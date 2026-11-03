# One image = the API plus the built web app it serves (see apps/api/src/http/static-web.ts).
# Build context is the repo root:  docker build -t jobprep:v1 .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Manifests first, so the dependency layer is reused when only source changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w @jobprep/web


FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST_DIR=/app/apps/web/dist

# The API runs its TypeScript through tsx (the shared package is TypeScript source too), so the full
# node_modules travels with it.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# 200 only while the database answers (the same endpoint the deploy scripts gate on).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `node` itself is PID 1, so SIGTERM from `docker stop` reaches the shutdown handler in server.ts.
CMD ["node", "--import", "tsx", "src/server.ts"]
