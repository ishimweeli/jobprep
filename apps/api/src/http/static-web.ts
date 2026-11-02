import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';

/**
 * Serves the built web app (apps/web/dist) from the API process, so one container is one replica and the
 * web app and the API it talks to are always the same version (and the session cookie stays same-origin).
 * Mount it AFTER every /api route: anything under /api that nothing matched has already got its JSON 404.
 */
export function serveWeb(app: Express, dir: string) {
  const root = path.resolve(dir);
  const indexFile = path.join(root, 'index.html');
  if (!existsSync(indexFile)) throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);

  // Hashed bundles never change, so browsers may keep them for good; index.html must always be re-read
  // so a new deploy is picked up on the next visit.
  app.use('/assets', express.static(path.join(root, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(root, { index: false, maxAge: '1h' }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // A missing file (an old bundle name after a deploy, a typo) is a real 404, not the app shell:
    // handing HTML to a <script> tag is a blank page that is hard to diagnose.
    if (req.path.startsWith('/assets/') || path.extname(req.path) !== '') {
      return res.status(404).type('text/plain').send('Not found');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
}
