# JobPrep — missing designs (brief for the design agent)

The approved design (42 artboards, copies in `docs/design/source/`, index in `canvas.json`) does not cover
everything the product needs. Nothing is built for these until a design exists. This file lists **every gap**
with enough detail to draw it. IDs are stable: **C** = candidate app, **A** = admin.

Priority: **P0** blocks a required flow or go-live · **P1** needed for a complete product · **P2** nice to have.

---

## Status after Batch 1 (designer delivered 2026-11-02; artboards copied into `docs/design/source`)

| Item | Artboards | Status |
|---|---|---|
| C12 Sign-in | `SignIn`, `SignInPhone` | Drawn. **Copy must change**: code lifetime, tries and lockout do not match the backend (see below) |
| C13 Signed-in header / account menu / sign out | `AccountMenu` | Drawn. Buildable as is |
| C29 Phone navigation | `NavPhone` | Drawn. **Conflicts** with the older tab bar in `DashboardPhone` (owner to confirm C29 is the standard) |
| C16 Dashboard new user + access states | `DashboardNew`, `DashboardNewPhone` | Drawn. Needs small API additions (start-here test, pending payment, "ending soon" threshold) |
| C30 Details for an unlocked test | `ExamDetailUnlocked`, `ExamDetailUnlockedPhone` | Drawn. Buildable with existing data |
| C17 Guest taps a paid test | `GuestPaid`, `GuestPaidPhone` | Drawn. Buildable |
| C20 Checkout edge states | `CheckoutStates`, `CheckoutStatesPhone` | Drawn. "Number on another network" has no backend rule (owner decision) |
| C23 Country not open / wrong country | `CountryGate`, `CountryGatePhone` | Drawn. Opt-out wording for the waiting-list SMS still open |
| C26 System pages | `SystemPages`, `SystemPagesPhone` | Drawn. The error "Reference" code needs a request id from the API |
| C3 + C5 Multiple-select, partly correct | `MultiSelect`, `MultiSelectPhone` | Drawn. **"Choose 3" needs a product decision and a backend field** |
| C1 Practice runner | `Practice`, `PracticePhone` | Drawn. **"Untimed" conflicts** with the backend timer and the dashboard copy (owner decision) |
| C7 + C8 Time up and offline, desktop | `TimeUpDesktop` | Drawn. Buildable |

Backend facts the design must match (sign-in): a login code lasts **5 minutes**, allows **5 wrong tries** and is then
dead (request a new one, resend wait **45 s**); at most **5 codes per phone per hour**, then "try again later". There is
**no timed lockout** and the API does **not** return a tries-left number.

---

## 0. Brief that applies to every screen

**Product.** JobPrep is a mock-exam platform for recruitment exams (teacher recruitment first). Not a course
platform. Core loop: find a mock test → take it timed → results → review answers → practise weak areas.
Candidates are mostly on low-end Android phones over 3G, so **phone is the primary design**. Rwanda is live;
Kenya is next (KES, M-Pesa, English + Kiswahili); Uganda and Tanzania later. Languages: English, Kinyarwanda,
Kiswahili.

**Deliver** for each item: a **desktop artboard (1440 wide, fluid)** and a **phone artboard (390 wide)**, unless
the item says "phone only" or "desktop only"; every state listed; clickable where there is a flow. Name files like
the existing ones (`Practice.dc.html`, `PracticePhone.dc.html`) and add them to the same canvas. Match the
existing artboards for header, footer, cards and spacing. Where an item says "match", open that file.

**Design system (from the approved design — match exactly).**
- Font Inter 400–800, system-ui fallback; tabular numbers for timers, scores, prices.
- Colours: ink #18181B, ink-2 #3F3F46, muted #52525B, border #E4E4E7, input border #A1A1AA, surface #FFFFFF,
  page #FAFAFA, soft #F4F4F5. Brand violet primary #6D28D9, hover/text #5B21B6, soft #EDE9FE / #F5F3FF, focus ring #A78BFA.
  Status: correct #047857 on #D1FAE5 · incorrect #B91C1C on #FEE2E2 · flagged #B45309/#92400E on #FEF3C7 · free badge #065F46 on #D1FAE5.
- Radius: buttons and inputs 12px, cards 16–18px, chips and badges pill.
- Buttons: primary violet · secondary violet outline · final/submit near-black #18181B · neutral grey outline.
- Touch targets ≥ 44px; text contrast ≥ 4.5:1; **never colour alone** (flagged cells also carry a corner mark; review uses ✓/✕ labels).
- Icons: simple stroke SVG (Lucide is fine). **No emoji. No decorative animation, especially during exams.**
- Visible focus ring on everything interactive; dialogs and sheets are real modals (labelled, closable, Esc).

**Product rules the design must respect.**
- **Never show a pass mark** unless an admin entered an official one with a source. Default note: "No official pass mark is published for this examination, so JobPrep shows your score and percentage only."
- Never call questions "official" or "real".
- **Payments:** never ask for a PIN; the payer approves on their own phone. Every non-success ending says **"You were not charged."**
- **Price is data, never typed into a design as final.** Use placeholders like `[PRICE]` as `CheckoutKenyaPhone.dc.html` does; Rwanda currently reads "RWF 2,000", "30 days", "paid once, no auto-renew".
- Everything is country-scoped: price, currency, payment methods, language, disclaimer, categories.
- No account is needed to take a free sample.

**Tone.** Plain, short, reassuring, second person ("Your answers are kept…"). Look at the copy in `States.dc.html`,
`TimeUp.dc.html`, `PayDone.dc.html` and keep that voice.

---

## C — Candidate app

### C1 · Practice-set runner — **P0** · desktop + phone
- **What / when:** the exam screen for a short practice set built from the candidate's weak topics. Reached from results ("Practice Weak Areas") and dashboard ("Start practice"). Differs from a real exam: **after each answer the candidate can see whether it was right, the correct answer and the explanation, then moves on.**
- **Match:** `Exam.dc.html` / `ExamMobile.dc.html` (header, question, A–D options, navigator, flag).
- **States to draw:** (1) question unanswered; (2) option chosen, with a "Check answer" action; (3) feedback shown — correct (green, "Correct"), incorrect (red, "Incorrect", correct option highlighted with ✓ and the chosen wrong one with ✕), partly correct for multiple-select; explanation panel; "Next question"; (4) last question → "Finish practice" (confirmation like the exam's submit dialog, with answered/unanswered counts); (5) time up.
- **Content / data available:** set title ("Statistics & probability practice set" or "Practice set: Pedagogy & CBC, Statistics & probability"), 3–15 questions, minutes = 4/3 × questions rounded up (15 → 20), topic per question, timer (server), saved/offline state as in the exam.
- **Notes:** label it clearly as practice (not an exam). Explanations must only appear after the candidate has answered that question.

### C2 · Practice results — **P1** · desktop + phone
- **What:** results after a practice set. No "compared with last time" and no history chart (a practice set has neither).
- **Match:** `Results.dc.html` / `ResultsPhone.dc.html`. Show score ring, correct/incorrect/unanswered, time, performance by topic, actions: Review Answers, **Practice again**, Back to my progress / Try a mock test.
- **Data:** `kind = PRACTICE`, same score and topic fields, no `comparison`.

### C3 · Multiple-select question — **P0** · exam desktop + phone, case exam, review
- **What:** some questions have **more than one correct answer** ("Select ALL that apply"). The current design only draws single-choice A–D.
- **States:** unanswered; some selected; all selected. Options must read as **checkboxes, not radio-style**; a visible instruction line above the options; selection count is allowed ("2 selected") but **must not reveal how many are correct**.
- **Where:** `Exam`, `ExamMobile`, `CaseExam`, `CaseExamPhone` (answer area); `Review` (several options marked correct, several marked "your pick"); navigator cell "answered" when ≥ 1 selected.
- **Scoring copy to decide:** two modes exist — all-or-nothing, or **partial credit** (each correct pick earns a share, each wrong pick cancels one). Draw how partial credit is explained in review (e.g. "Partly correct: 1 of 2 marks").

### C4 · Review of case-based questions — **P1** · desktop + phone
- **What:** in answer review, a case question needs its **case passage and tables** (the case study from `CaseExam.dc.html`).
- **States:** desktop: case panel beside or above the question, collapsible; phone: "Question | Case study" switch as in `CaseExamPhone.dc.html`; show "Case study · questions 8–12" label; per-question correct/incorrect marking and explanation as in `Review`.

### C5 · "Partly correct" status — **P1** · review, jump grid, results
- Add a fourth answer status beside correct / incorrect / not answered: **partly correct** (multiple-select partial credit). Needs a badge (not colour alone: label + shape), a jump-grid cell style, and a place in the "Incorrect" tab (partly correct answers are listed under Incorrect). Show "marks awarded of marks available".

### C6 · Results edge states — **P1** · desktop + phone
- **Auto-submitted:** a line such as "Submitted automatically when time ran out" on results.
- **No weak areas:** every topic ≥ 60%; hide "Practice Weak Areas" and the weak-area badge; show a positive line instead.
- **Zero answered / blank exam**, **perfect score**: check the score ring and copy.
- **Guest vs signed in:** "Save my result" banner for guests only (already drawn); signed-in variant has no banner.

### C7 · Time is up — desktop — **P0** · desktop
- **What:** the "Time is up" screen on desktop (phone exists in `TimeUp.dc.html`).
- **Copy to keep:** "Time is up. Your exam was submitted automatically with 47 of 50 questions answered. Nothing you answered was lost." Primary action "See my results".
- **Also draw:** when the candidate returns after the exam closed (page was left open or reopened): same screen with the final counts.

### C8 · Offline and save states — desktop — **P0** · desktop (+ extra states on both)
- **What:** the offline banner and "N answers waiting to save" in the exam header on desktop (phone version is in `TimeUp.dc.html`; a banner component is in `States.dc.html`).
- **Copy to keep:** "No connection. Keep answering — your answers are kept on this device and will save when you are back online." and "The timer keeps running while offline, exactly as it would in the exam room."
- **States:** online and saved ("All answers saved") · saving · offline with N waiting · back online and syncing · **sync problem** (retry) · **"This exam has already ended"** (the server refused a late save) with a way to see results.

### C9 · Finished-attempt reopen — **P2** · both
- When someone opens an exam link whose attempt is already submitted: a short screen "This attempt has ended" with "See results" and "Start a new attempt" (only if allowed).

### C10 · "Request this exam" form and confirmation — **P1** · desktop + phone
- **Where:** empty search state (`States.dc.html` draws only the button "Request this exam").
- **Draw:** the form (shows what they searched, e.g. "Veterinary officer"; optional phone number field, prefilled for signed-in users, with country prefix; submit "Send request"), validation error (bad number), success confirmation ("We will text you when it is added" — confirm wording), error with retry. Phone: bottom sheet. Desktop: dialog or inline.

### C11 · "Notify me when {country} opens" form and confirmation — **P1** · desktop + phone
- **Where:** country picker for a coming-soon country (`CountryPicker*.dc.html` draws only the button).
- **Draw:** phone field with that country's prefix, submit, success ("We will text you when {country} opens"), already-on-the-list state, error.

### C12 · Sign-in (returning user) — **P0** · desktop + phone
- **What:** the sign-up flow is drawn; **returning-user sign-in is only a link** ("Already have an account? Sign in"). Draw: phone number step → 6-digit code step → signed in (back to where they were).
- **Match:** `SignUp.dc.html` / `SignUpPhone.dc.html` visuals and the code-entry step.
- **States:** wrong code ("That code is not right"); too many wrong attempts (new code needed); **resend countdown** (about 45 s, then "Resend code"); hourly limit reached ("Too many codes requested, try again later"); suspended account ("This account is suspended. Contact support."); invalid number.
- **Important:** the server answers identically whether or not an account exists, so the design **must not say "no account found"**. Offer "Create an account" as a separate link instead.

### C13 · Signed-in header, account menu, sign out — **P0** · desktop + phone
- **What:** the header today shows "Sign in". Draw the signed-in header: avatar/initials, name, **account menu** (My progress, Account, Language, Change country, Sign out). Phone: how the account entry appears (bottom tab bar is drawn for "Mock tests, My progress, Access" — add where Account lives).
- Include the **country switcher** in the header on both sizes (the design mentions "change this later from the top of any page" but does not draw it).

### C14 · Account page (desktop + full phone) and edit profile — **P1** · desktop + phone
- **What:** only a phone account card exists inside `ChangeCountryPhone.dc.html` (Name, Phone, Exam country). Draw the full page: name (editable), phone (read-only), exam country (opens the change-country sheet), language (English / Kinyarwanda / Kiswahili — only those the country offers), exam goal (links to C15), My access summary, Sign out.
- **States:** editing name with validation, saved confirmation, language changed.

### C15 · Change goal — **P1** · desktop + phone
- **What:** dashboard says "Preparing for … · Change goal" but no screen. Draw a picker of **that country's job categories** (same cards as the sign-up goal step), current goal marked, confirm. Note: switching country clears the goal, so also draw the **"choose your goal"** prompt shown after a country switch.

### C16 · Dashboard — new user and "My access" states — **P0** · desktop + phone
- **New user (no attempts):** greeting, goal, **nothing to resume, no recommendation, no history**. Draw empty versions of: "Continue where you stopped" (hidden), "Recommended next" (replace with "Take your first mock test" using a free sample), "Score history" (empty chart), "Topics", "Recently completed".
- **My access (currently only "Full Access active, 23 days left"):** draw **no access** (free only, with "Get Full Access · [PRICE]"), **expired** ("Your Full Access ended on 15 Oct" with renew), **expiring soon** (e.g. ≤ 3 days), **renewed while active** ("Active until 24 Dec — includes days you had left"), and **access in another country** ("You also have Full Access in Rwanda, 23 days left. It only covers Rwanda tests").

### C17 · Guest wants a paid test — **P0** · desktop + phone
- **What:** a guest taps "Get Full Access" or "Start" on a paid test. They must create an account before paying. Draw the interstitial/flow: short explanation ("Create a free account to pay and keep your access"), → sign-up (existing) → **return to the test or straight to checkout** with the order summary. Also the case where they already have an account (go to sign-in).

### C18 · "Save my result" success — **P1** · desktop + phone
- After a guest creates an account from results: confirmation that the result was saved and now appears in **My progress** (e.g. "Saved. Find it under My progress."), then back to results. Include the case where nothing could be saved (the attempt belonged to someone else or another country) — a neutral message, no error tone.

### C19 · Checkout on desktop — **P1** · desktop
- Design is phone-first; draw the desktop version of `Checkout.dc.html` (order summary left, method + phone number + pay right), plus the **pending** ("Approve on your phone" with countdown, "Send again", "Use a different number") and **confirmed** (`PayDone.dc.html`: amount, method, access until, transaction ID, "Start mock test", "A receipt was sent by SMS to …") screens.

### C20 · Checkout edge states — **P0** · desktop + phone
Draw each as a state of checkout:
1. **Provider unavailable / could not send the request:** "We could not send the payment request. You were not charged. Try again." (retry, choose another method).
2. **Invalid phone number** inline error; number not matching the chosen operator.
3. **Pending too long:** between the countdown and expiry — "Still waiting for approval" with **"Check payment"** (asks the operator now) and the time left; what to do if they approved but nothing happened.
4. **Price not set for this country** (checkout unavailable): "Payments are not open in {country} yet" with "Notify me" — no pay button.
5. **Already has active access** and buys again: confirmation that the new 30 days **start when the current ones end** ("Your access will run until …").
6. **Payment method list** when a country has one method only (Kenya: M-Pesa) vs two (Rwanda: MTN MoMo, Airtel Money).
7. Payment **declined / failed / expired** exist in `States.dc.html`; add the **desktop** versions and the **failed** variant (not just declined/expired).
8. **Late success:** payment showed "expired" but the payer approved afterwards — the screen turns into "Payment confirmed" (draw the transition message).

### C21 · Payment history and receipts — **P2** · desktop + phone
- List of the user's payments (date, amount, method, status, transaction ID) under Account; receipt detail; **"Check payment"** on a pending one.

### C22 · Language switcher — **P1** · desktop + phone
- English / Kinyarwanda / Kiswahili (only the languages the country offers) in the header or account menu; shows in the footer too. Draw the control, the open state, and what happens to a test that has no translation (stays in English with a small note "This test is available in English only").

### C23 · Country not available / wrong country — **P0** · desktop + phone
- **Link to a country that is not open** (e.g. `/ke` before Kenya opens): "Kenya is coming soon" with "Notify me when Kenya opens" (C11).
- **Signed-in user opens another country's page or test:** "This test is for Kenya. You are using JobPrep for Rwanda." with "Switch to Kenya" (opens the change-country sheet) and "Stay in Rwanda".

### C24 · Other countries on desktop, KES, and "price not set" — **P0 for Kenya go-live** · desktop + phone
- Kenya **desktop** landing, catalog, details, pricing (only a Kenya landing on phone and the M-Pesa checkout exist; the layout is the same but categories, disclaimer, language and payment methods differ — show it once for Kenya so the data-driven version can be checked).
- **Currency formats:** "RWF 2,000" (no decimals) vs "KES 1,500.00" (two decimals): confirm the Kenya format.
- **"Price coming soon"** state for a live country whose price is not set: details page access card, pricing page Full Access card, landing pricing summary. No fake number, no pay button.
- **Disclaimers per country** in the footer ("not affiliated with the TSC, the PSC or any county government").

### C25 · Legal and help pages — **P0 for Kenya go-live** · desktop + phone
- **Terms of use, Privacy policy, Refund policy**, **Help / Contact support** (phone and email placeholders), **cookie notice** (if cookies beyond the login session are used). The Kenya go-live checklist already lists "Legal review of terms and refund policy". The design agent should draw the page template (title, last-updated date, table of contents on desktop, readable body) with placeholder text; the owner supplies the legal text.

### C26 · 404, generic error, maintenance — **P0** · desktop + phone
- **Page not found**, **something went wrong** (with retry and home), **maintenance / we'll be back** page, and a **session expired** prompt ("Sign in again to continue", with the exam draft safe). `States.dc.html` has only inline loading/empty/error components.

### C27 · SMS copy — **P1** · copy only (no artboard)
- Wording for the **login code SMS** and the **payment receipt SMS** (and later: access expiring soon, request-exam fulfilled, country opened). Current placeholders written by engineering, to be replaced by approved copy:
  - "Your JobPrep code is 123456. It expires in 5 minutes. Never share it."
  - "JobPrep: we received RWF 2,000 via MTN MoMo. Full Access is active until 2 Dec 2026. Ref FAKE-TXN-ABC123."
- Keep each under ~160 characters, in English / Kinyarwanda / Kiswahili.

### C28 · Error-message catalogue — **P1** · copy table
Friendly text for each situation the API reports (sign-in/sign-up, checkout, exam): invalid code · too many attempts · wait before resending ("Try again in 40 s") · hourly limit · account exists (offer sign in) · invalid phone · account suspended · country not open · wrong country · full access required · sign in required · exam already ended · answer saved failed · payment method unavailable · price not set · provider unavailable. One line each, plus the action offered.

### Additional candidate gaps found while building the public screens

### C29 · Navigation on phone — **P0** · phone
- The landing, catalog and pricing artboards show a menu button but not what opens; the dashboard artboard has a bottom tab bar ("Mock tests, My progress, Access") but the other phone screens have none. Draw: the **phone menu** contents (links, country, language, Sign in / account), and **which screens carry the bottom tab bar** and the signed-out equivalent.

### C30 · Exam details for a test the user has already unlocked — **P0** · desktop + phone
- Only a small tag ("Unlocked · N days left") is drawn in `States.dc.html`. Draw the access card on exam details for: **free test** (drawn), **paid and locked** (drawn), **paid and unlocked** (Start button, "Full Access · N days left"), **paid, unlocked, with an unfinished attempt** ("Resume"), and the **"Review last attempt"** target.

### C31 · Catalog pagination — **P1** · desktop + phone
- The catalog will grow past one page (about 90 tests in Rwanda). Draw "Load more" or page controls, the loading-more state and the end-of-list state.

### C32 · Catalog filters — **P1** · phone + desktop
- The phone filter sheet should show **every filter the desktop has** (price, difficulty, language, subject); the artboards omit Subject and Language on phone. Decide **multi-select vs single-select** for difficulty and language, and add a **sort** control (the design mentions "free first").

### C33 · Landing language toggle — **P1** · phone + desktop
- Drawn only on the Kenya phone landing, with no rule for when it appears. Specify: shown when the country offers more than one language? where on desktop? what changes on tap?

### C34 · Country picker "Detected from your connection" — **P2** · desktop + phone
- The picker says "Detected from your connection: Rwanda". Decide whether this is wanted (it needs IP geolocation, which is not built). If not, remove the line from the design.

### C35 · Switch-country sheet note about the job goal — **P1** · phone + desktop
- Switching country **clears the exam goal**. The sheet lists what happens to access and results but does not mention the goal. Add the line, and draw the desktop version of the sheet.

### C36 · Support contact — **P1** · desktop + phone
- The pricing FAQ and error states refer to contacting support. Provide the **phone / WhatsApp / email** per country and where it appears.

### C37 · Multiple-select visual treatment — interim — **P0** · exam desktop + phone
- (See C3.) Until C3 is designed, the exam uses the **existing option buttons**, toggling several on and off, with no extra instruction text. This is behaviour only and is **not a design decision**; it must be replaced by the C3 design.

---

## A — Admin (System admin, Content editor, Support)

Existing: overview, users + user detail, exams + question editor, payments, pricing & settings (with team and a
short audit list), countries with go-live checklist — desktop and phone. **Roles:** System admin (everything),
Content editor (exams and questions only; optional country restriction), Support (view users, resend login codes,
check payments). Every sensitive action needs a reason and is written to the audit log.

### A1 · Admin sign-in — **P0** · desktop + phone
- Phone number → 6-digit code → in; "not an admin" outcome that does not reveal which numbers are admins; session expired state. Match the candidate sign-in (C12) but with the **ADMIN** mark used in the admin chrome.

### A2 · Grant or extend access dialog — **P0** · desktop + phone
- From user detail ("Grant / extend 30 days"). Fields: country (defaults to the user's), days or "30 days", **reason (required, free text)**; summary of what will happen ("Access will run until …"); confirm / cancel; success toast; error. Shows that it will be recorded in the audit log.

### A3 · Suspend and un-suspend dialogs — **P0** · desktop + phone
- **Reason required**; consequence text ("They will be signed out and cannot sign in"); confirm in the destructive style; the suspended state of the user detail (banner, "Un-suspend" with reason).

### A4 · Manual grant for a stuck payment — **P0** · desktop + phone
- From Payments ("Grant access manually"): requires the **provider transaction ID** and a reason; shows payment amount, method, payer number, age; confirm. Also the result of **"Check payment"** (asked the operator: still pending / approved / declined / expired) and a **payment detail** view with the event timeline (request sent, callbacks, polls, grant created). Define the **"stuck"** badge (pending longer than the configured minutes).

### A5 · Support actions — **P1** · desktop + phone
- "Send login code" confirmation and result (code sent / too soon, wait N s); "View as candidate" (read-only banner across the candidate screens: "Viewing as Aline Uwase — read only", exit).

### A6 · CSV import of questions — **P0** · desktop + phone (phone may be "use desktop")
- Steps: choose mock test and file → **column mapping** → **validation report** (row, problem: missing correct answer, bad option key, unknown topic, duplicate) → preview → confirm → result (N added, M skipped, download error file). Include the CSV format help (columns: stem, options A–D, correct, explanation, topic, section, marks).

### A7 · Category, section and topic editors — **P0** · desktop + phone
- **Categories** per country (name, description, icon, order, featured flag); **sections** inside a mock test (name, question-type label, order, marks summary); **topics** per category (name; used for weak-area analysis). Create, edit, reorder, delete with a "used by N questions" guard.

### A8 · Case study editor — **P0** · desktop + phone
- Case = title, passage paragraphs, **tables** (caption, rows with label/value/heading rows), numbered notes; attach to questions; preview exactly as candidates see it (`CaseExam.dc.html`); translations tab.

### A9 · Mock test form and publishing — **P0** · desktop + phone
- Create/edit: title, summary, category, profession/exam, authority, **free or Full Access**, difficulty, **time limit**, languages, instructions list, **negative marking per wrong answer (off by default)**, **official pass mark with a required source (empty by default; explain it is only shown when both are set)**, sections. States: draft / published / archived, **publish checklist** (needs ≥ 1 question, a free sample exists in the category), unpublish with consequences, duplicate.

### A10 · Question editor — more types and translations — **P0** · desktop + phone
- Extend `AdminExams.dc.html` (it edits one single-answer question) to: **multiple-select** (several correct options; all-or-nothing vs **partial credit**; marks), **case-based** (choose case), 2–6 options, reorder, marks, difficulty, topic, explanation, status draft/published; **translation tabs** (Kinyarwanda, Kiswahili) with completeness; **preview as candidate**; version note ("edited after 1,204 attempts").

### A11 · Candidate reports queue — **P1** · desktop + phone
- Reported questions list (test, question number, count, latest message, date), filter (open / resolved / dismissed), open → edit question (A10) → **"Publish change & resolve reports"** (already shown as a button) or dismiss with reason.

### A12 · Audit log — **P0** · desktop + phone
- Full list (actor, action, entity, country, reason, time), **filters** (actor, action type, country, date), entry detail with before/after where relevant, export. Only System admin (and Support read?) — mark who can see it.

### A13 · Admin team — invite and edit — **P1** · desktop + phone
- "Invite" dialog: phone, name, **role** (System admin / Content editor / Support), **country restriction** for Content editors; edit role, deactivate, "last active". Role explanation as in the settings footnote.

### A14 · Country management actions — **P0 for Kenya go-live** · desktop + phone
- **Go-live confirmation** (shows the checklist: price set, payment method live, free sample in every category, legal pages; blocks or warns on gaps); **set price** in the country's currency with "applies to new payments only; active access is never shortened"; **payment provider setup** (sandbox → live, last test, callback URL, status — never show secrets); move a country back to "Preparing".

### A15 · Demand views — **P1** · desktop + phone
- **Exam requests** grouped by search ("Veterinary officer — 7 requests, last 1 Nov"), with "Plan exam" (links to A9) and "Mark done / notify"; **waiting list** per country (count, export). The Overview alert "Plan exam" currently goes nowhere.

### A16 · Exports — **P1** · desktop + phone
- "Export for accounting" (Payments): date range, country, status, format; result/download state.

### A17 · Restricted-role states — **P0** · desktop + phone
- What a **Content editor** and a **Support** user see: navigation items hidden or disabled, a "You do not have access to this" screen, disabled buttons with a tooltip/explanation, and the country-restricted editor seeing only their country in filters.

### A18 · Admin loading, empty, error states — **P1** · desktop + phone
- `States.dc.html` covers the candidate app only. Draw admin versions: table skeletons, empty lists ("No payments match"), error with retry, saving/saved, unsaved-changes warning in editors, destructive confirmations.

---

## Reference: what API data exists for each screen
The API for C1, C2, C10–C12, C14–C16, C18–C20, C23, A-side areas is built or planned; engineering will supply field lists when a design is approved. Notable facts for design: exams and payments have **server-side time** (timer, 3-minute payment request window); a **guest** is identified by a device token (no account); a payment **success after expiry still grants access**; sign-in answers are **identical for unknown numbers**; prices can be **unset**; access is **per country** and renewals **chain** (shown as one "until" date).
