# JobPrep (jobprep.nexvecta.com) — Product spec

> Source of truth for product, data model, business rules and acceptance criteria.
> Approved design: https://claude.ai/artifact/BJuCzgsYCKwxYpxz2zchU4 (desktop 1440px + phone 390px for every screen).
> If this spec and the design disagree, follow this spec and note it in `DECISIONS.md`.

## Context
JobPrep is a Rwanda-first MOCK EXAM platform for recruitment exams (teacher recruitment first, then school leadership, government administration, accounting & finance, procurement, other professional roles). It is NOT a course platform or LMS. Core loop: find a mock test → take it timed → see results → review answers → practise weak areas.

Country-scoped: the user's country is chosen at sign-up and filters every query, price, payment method and page. Live: Rwanda. Preparing: Kenya. Planned: Uganda, Tanzania.

## Stack
Node.js + Express + TypeScript API, PostgreSQL with Prisma, React (Vite) web app, Tailwind. Public pages must be fast on low-end Android phones over 3G (mobile-first).

## Design system (match exactly)
- Font: Inter (400–800), system-ui fallback. Tabular numbers for timers and scores.
- Colors: ink #18181B, ink-2 #3F3F46, muted #52525B, border #E4E4E7, input border #A1A1AA, surface #FFFFFF, page #FAFAFA, soft #F4F4F5.
- Brand violet: primary #6D28D9, hover/text #5B21B6, soft #EDE9FE / #F5F3FF, focus ring #A78BFA.
- Status: correct #047857 on #D1FAE5; incorrect #B91C1C on #FEE2E2; flagged #B45309/#92400E on #FEF3C7; free badge #065F46 on #D1FAE5.
- Radius: buttons/inputs 12px, cards 16–18px, chips/badges pill.
- Buttons: primary violet, secondary violet outline, final/submit near-black #18181B, neutral grey outline.
- Touch targets ≥ 44px; text contrast ≥ 4.5:1; never rely on colour alone (flagged cells also carry a corner mark, review uses ✓/✕ labels).
- Icons: simple stroke SVGs (Lucide is fine). No emoji. No decorative animation, especially during exams.

## Screens (desktop + phone for each)
1. **Landing**: headline "Practice Smarter. Pass with Confidence.", search "Which job exam are you preparing for?" + "Find Mock Tests", popular search chips, 6 category cards (Teaching positions highlighted), featured teacher tests, how it works (4 steps), recently added, pricing summary, footer disclaimer "Independent practice platform — not affiliated with MIFOTRA or REB."
2. **Exam discovery**: search by job title/subject/category; category chips; filters for price, difficulty, language, subject (phone: bottom-sheet filters); result cards (category, title, questions, minutes, language, difficulty, Free / Full Access tag, one "View test" action); empty state with "Request this exam".
3. **Exam details**: title, category, questions, time limit, total marks, language, section table, instructions, "No official pass mark is published" note, previous attempts. Free test → "Start Mock Test" (no account needed). Paid test → "Get Full Access · RWF 2,000" plus "Try the free sample". Phone: fixed bottom CTA bar.
4. **Mock exam**: distraction-free header (exam name, "All answers saved", countdown timer, Submit). Large question text, A–D answer buttons, Flag for review, Previous/Next, progress bar, question navigator grid (answered / not answered / flagged / current). Phone: navigator opens as a bottom sheet. Submit confirmation shows answered/unanswered/flagged counts and time left, with "Go to first unanswered", "Submit now", "Keep working". Timer turns red under 5 minutes.
5. **Case-based questions**: desktop split view (case passage with tables left, question right, case-question mini navigator); phone uses a "Question | Case study" segmented switch.
6. **Results**: score ring (% and marks), correct/incorrect/unanswered/time spent, change vs previous attempt, performance by topic with "Weak area" badges, comparison with earlier attempts, "Review these first" list. Actions: Review Answers, Practice Weak Areas, Try Another Mock Test. Guests see "Save my result" (create a free account with phone number).
7. **Answer review**: filters Incorrect / Flagged / Unanswered / All; each question shows options with correct and user's answer marked, topic, explanation. Desktop: full list + jump grid. Phone: one question at a time with Prev/Next.
8. **Dashboard**: greeting, exam goal, resume unfinished test, recommended next practice (weakest topic), score history chart, strong/weak topics, recently completed, "My access" (Full Access status, days left). Phone: bottom tab bar (Mock tests, My progress, Access).
9. **Pricing**: Free samples (0) and Full Access (paid once, unlimited access to every mock test in every category for 30 days, no auto-renew), Mobile Money section, FAQ.
10. **Checkout (phone-first)**: order summary, choose provider, phone number, "Pay RWF 2,000" → "Approve on your phone" pending state with "Send again" and "Use a different number" → Payment confirmed (amount, method, access until, transaction ID, "Start mock test").
11. **System states**: loading skeletons, empty, error with retry, resume-in-progress prompt, payment declined/expired ("You were not charged"), offline banner during exam.
12. **Sign-up / country**: country → phone (prefix from country) → OTP → job goal; sign-in with OTP; change country with confirmation sheet.
13. **Admin**: overview (country filter, needs attention), users (detail, grant/extend/suspend with reason), exams & question editor (all question types, CSV import, candidate reports), payments (stuck handling, manual grant with transaction ID), countries (go-live checklist), settings, audit log.

## Business rules
- One paid tier per country: **Full Access** (Rwanda: RWF 2,000, one-time, 30 days, all mock tests in that country). Price, currency and duration live in config/DB (`PlanConfig`) — never hardcoded in components.
- Every category has at least one free sample test, playable without an account or payment.
- Never show or invent a pass mark. Only display an official threshold if an admin enters one with a source.
- Never call questions "official" or "real".
- Support different formats per exam: question count, time limit, marks per question, sections, case-based question groups, languages (English, Kinyarwanda, Kiswahili).
- No negative marking unless configured per exam.
- A Full Access grant is scoped to its country: a Rwanda grant does not unlock Kenya tests.
- A country's price may be unset (country not live) — checkout is unavailable until set.

## Exam engine requirements
- Server is authoritative for the timer: store `started_at` and duration, compute remaining time on the server. Client timer is display only.
- Autosave every answer and flag change immediately (debounced), with a local IndexedDB queue so answers survive offline periods and refreshes; sync on reconnect and show "N answers waiting to save".
- Resume an in-progress attempt after refresh or on another device.
- Auto-submit at time-up, with a "Time is up" screen confirming answers were kept.
- Scoring per topic/section for results and weak-area recommendations.
- Practice-weak-areas mode builds a short set from the user's lowest-scoring topics.
- Question types behind a `QuestionType` interface: single-answer MCQ, multiple-select (all-or-nothing or partial credit), case-based (questions grouped under a passage with tables).

## Data model (minimum)
Country, Authority, Category, Profession, Exam, MockTest (format settings, is_free, languages), Section, Topic, Question (type, JSON payload, explanation, topic, optional case), QuestionTranslation, Case (passage, tables), Attempt (user or guest token, started_at, submitted_at, status), AttemptAnswer (question, choice, flagged, saved_at), User (phone + OTP login), Session, OtpCode, AccessGrant (user, country, plan, starts_at, ends_at, payment), Payment (+ events), PlanConfig, PaymentMethodConfig, WaitingListEntry, QuestionReport, ExamRequest, AdminUser, Role, AuditLog, Translation, Setting.

## Payments
Providers: MTN MoMo (Collections, request-to-pay), Airtel Money (Collections), M-Pesa (Kenya, sandbox) behind a `PaymentProvider` interface, plus a `fake` provider for local dev/tests (success, decline, timeout, duplicate callback).
Flow: create Payment as pending → send request-to-pay → poll and accept webhook callbacks → on success create AccessGrant (now + plan duration, country-scoped) and send SMS receipt. Timeout, decline and duplicate callbacks are handled idempotently. Never ask for or store a PIN. A "Check payment" action exists for stuck payments.

## Admin
Roles: **System admin** (everything), **Content editor** (exams and questions only; optional country restriction), **Support** (view users, resend login codes, check payments). Every sensitive action writes an audit-log entry.

## Accessibility and quality
Semantic HTML, keyboard-operable exam (no global key traps), visible focus, aria labels on icon buttons, dialog semantics for sheets/modals. Lighthouse mobile ≥ 90 on landing and catalog. Test on a 360px-wide Android device.

## Acceptance criteria
- Flow A: Teaching → Secondary Mathematics → free mock → submit → results → review → another test, with no account.
- Flow B: search "Accountant" → paid exam → MoMo payment (sandbox/fake) → Full Access active → case-based exam → results.
- Refreshing mid-exam, or going offline for 2 minutes, loses no answers and the timer stays correct.
- Every screen matches the design on desktop and on a 390px phone.
