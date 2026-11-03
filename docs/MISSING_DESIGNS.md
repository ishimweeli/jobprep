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

**All 12 Batch 1 items are now built** in `apps/web` (committed `fff344b`), with the copy corrected to the backend's real
values (code lifetime, tries left and resend wait come from the API; practice shows "{n} questions" with no minutes;
placeholders such as `[PRICE]` never render). Still inert because nothing is drawn for them: Language, Help and support,
Change goal, Request this exam, and "Number on another network".

### New gaps found while building Batch 1 (for the designer)
- **Phone "Back online" banner** (only the desktop version of back-online is drawn).
- **Jump-grid cell and legend for "Partly correct"** (the build added a minimal `7◐` and a legend entry; please draw it).
- **"Finish practice" confirmation** and a **"Partly correct" feedback panel** in the practice runner.
- **Practice results** (the existing results screen is reused, without comparison or history) and **results edge states**.
- **Case passage in the answer review**, **reopening a finished attempt**, **desktop account page and profile editing**,
  **Language picker**, **Help page**, **Terms and Privacy**, **change goal**, **request-this-exam form**.
- **Country gate**: the optional "What are you preparing for?" field has no storage; the wrong-country page cannot name the test.
- **"Review last attempt" / best score** need the API to separate practice sets from mock tests (API gap, not a design gap).

Backend facts the design must match (sign-in): a login code lasts **5 minutes**, allows **5 wrong tries** and is then
dead (request a new one, resend wait **45 s**); at most **5 codes per email address per hour**, then "try again later". There is
**no timed lockout** and the API does **not** return a tries-left number.

### E1 — Email sign-in (replaces phone/SMS)

Owner-approved swap, 2026-11-03: an account is now identified by an **email address** and the login code is **emailed**. The
screens below were built in their existing layouts (same screens, states and spacing) with the phone field replaced by an
email field and the SMS wording replaced by email wording. Nothing new was invented; the designer should redraw these.
The Mobile Money payer number at checkout is **not** an identity and stays a phone field.

- **Sign-up, step 2** (`SignUp` / `SignUpPhone`): title "Your phone number" is now "Your email address"; the "Phone number" field with the
  country dial chip ("RW +250 | 788 123 456") is now an "Email address" field with no chip; helper "We'll text you a 6-digit code…" is now
  "We'll email you a 6-digit code to confirm it — there is no password."; inline error is "Enter a valid email address, like name@example.com."
- **Sign-up, step 3 code** (`SignUp` / `SignUpPhone`): "Sent by SMS to +250 …" is now "Check your email. We sent a code to {email}."
- **Sign-up and sign-in side panel** (desktop `AuthShell`): "Sign in with your phone number" is now "Sign in with your email address".
- **Sign-in, step 1** (`SignIn` / `SignInPhone`): helper is "Enter the email address you signed up with. We'll email you a 6-digit code — there is no password."; the
  phone field and its tappable country chip ("RW +250 ▾", which opened the country picker) are now one "Email address" field, so that chip is gone from this screen.
- **Sign-in, step 2 code** (`SignIn` / `SignInPhone`): "…a code is on its way by SMS" is now "If {email} has a JobPrep account, a code is on its way to your email."; the wrong-code box
  reads "Check your email and try again. N tries left."; "Use a different number" is now "Use a different email"; the desktop hint "Check the number…" is now "Check the address…".
- **Error catalogue** (`C28`): "invalid phone" is now "invalid email"; "account exists" reads "This email address already has an account."
- **Country not open** (`CountryGate` / `CountryGatePhone`): the dial-code phone field is now an "Email address" field; body "Leave your number and we'll send one SMS…"
  is now "Leave your email address and we'll send one email when they're ready — nothing else."; the "You're on the list" body is now "We'll send one email to {email} when {country} opens. You can ask us to remove your address at any time."
- **Guest wants a paid test** (`GuestPaid` / `GuestPaidPhone`) and the guest **"Keep this result"** banner on results (`Results` / `ResultsPhone`): "with your phone number" is now "with your email address".
- **Signed-in header menu, phone Account tab, Account settings** (`AccountMenu`, `NavPhone`, `ChangeCountryPhone`): the phone number under the name is now the email address; the settings row "Phone" is now "Email";
  the menu row hint "Name, phone number" is now "Name, email". Long addresses truncate (menu, tab) or wrap (settings).
- **Payment confirmed** (`PayDone`): "A receipt was sent by SMS to {number}" is now "A receipt was sent to {email}."
- **Checkout** (`Checkout`, `CheckoutKenyaPhone`): layout unchanged, but the Mobile Money number is no longer prefilled from the account. It is empty on a first payment and prefilled
  only from the payer number of the user's last payment. Please draw the empty-field state if the current one is not enough.
- **Copy only** (`C27`): the login-code message and the payment receipt are now emails, not SMS. Subject lines and body text are still to be written.

### E2 — Admin email sign-in and email columns (admin sign-in itself superseded by E3)

Owner-approved swap, 2026-11-03 (same rule as E1): admins are identified by **email address** and their login code is emailed.
Built in the existing admin layouts; no new screen, nothing new invented. The designer should redraw these. **Note (E3):** there is no
separate admin sign-in any more: admin people use the normal candidate sign-in, so the two "Admin sign-in" bullets below are simply the
candidate sign-in of E1 (the admin layouts for them no longer exist).

- **Admin sign-in, step 1** (desktop + phone): helper "Enter the email address you signed up with. We'll email you a 6-digit code — there is no password."; the "Phone number" field with its RW +250 chip is one "Email address" field.
- **Admin sign-in, step 2 code** (desktop + phone): "If {email} has a JobPrep account, we sent a code to your email. It works for N minutes."; wrong-code box "Check your email and try again. N tries left."; "Use a different number" is now "Use a different email"; inline error "Enter a valid email address, like name@example.com."
- **Users** (`AdminUsers`, `AdminUsersPhone`): the phone number under each name (table row and phone card) is the email; search label and placeholder "Search name or email" (matches name or email, any case).
- **User detail** (`AdminUsers` side panel, `AdminUserPhone`): the phone number next to "joined {date}" is the email.
- **Payments** (`AdminPayments`, `AdminPaymentsPhone`): under the candidate's name is the email. The payer's Mobile Money number stays a phone number: desktop shows it as a small second line under the Provider cell, phone shows it in the card's detail line ("RWF 2,000 · 078 912 3456 · 14:02 · …"). **Please draw where the payer number should sit**; these two places are the build's choice.
- **Settings, Admin team** (`AdminSettings`): the phone number under each team member's name is the email. (The invite button is still drawn but inert, A13.)
- **Overview search** (`AdminOverview`): "Search users, phone numbers or exams" is now "Search users, emails or exams".
- **Unchanged on purpose:** the country "Phone prefix" field (a dial code, not an identity), and the payer number everywhere a payment is shown. The "Send login code" support button is still drawn but inert (A5); the API now emails the code.

### E3 — One app, roles

Owner decision, 2026-11-03: there is one backend and one frontend. The admin screens are part of the web app under `/admin`, for
signed-in people who hold a role (one account can hold several). Nothing below is drawn in the designs; each is built the plainest way
with existing styling. The designer should draw them.

- **"Admin" entry in the candidate account menu** (desktop avatar menu and the phone Account tab; only when the account holds a role): a plain row, same style as the other rows ("Admin", no second line, a shield icon), after "Account settings". It opens `/admin`.
- **"Please sign in again to use the admin area" notice:** the admin API asks for a sign-in within the last 12 hours. When it is older, the person is sent to the normal sign-in screen (with a return to the admin page they were on) and sees this sentence as a plain amber status box above the email field.
- **No-access page** (signed in, no admin role, at `/admin`): "You don't have access to the admin area" / "Your account has no admin role. If you should have one, ask a system administrator to add it." / button "Go to the home page". Built with the existing system-page layout (lock icon), without any header. Also appears for an account whose roles open no page. (The restricted-role states of A17, for a role that lacks one page, are still undesigned: such a URL still redirects to the first allowed page.)
- **Several roles on one account:** Settings → Admin team shows each person's roles as comma-separated labels in the existing role slot (phone: the grey text; desktop: the one closed select shows "Content editor, Support"); the admin sidebar's role line under the name does the same. Navigation is the union of the roles' pages. Nothing to change, add or remove a single role exists yet (A13).
- **Admin sign-in screens (previously gap A1) no longer exist:** admin uses the normal candidate sign-in (C12 / E1). There is nothing to design for them. The E2 notes on "Admin sign-in" refer to that same screen.

### E4 — New sign-in (password, Google, setup)

Built from the 2026-11-03 artboards `SignUp`, `VerifyEmail`, `OnboardCountry`, `OnboardCategory`, `OnboardGoal`, `AuthCallback`, `SignIn`, `ForgotPassword`, `ResetPassword`, `ChangeCountry`
(each with its Phone twin; one responsive component per screen). These are the states and flows the artboards do not draw, built the plainest way with existing styling.

- **Google not set up yet (undesigned state):** "Continue with Google" and its divider ("or sign in with email" / "or") are always drawn as designed. While `GET /api/auth/providers` says `google: false` (no credentials configured), pressing the button does not leave the page; a plain amber status line appears under it: "Google sign-in isn’t available yet. Use your email instead." With `google: true` it goes to `/api/auth/google/start?next=&countryCode=`.
- **Back to home** (top right, on the logo row) is drawn on Sign in, Create account, Check your email, Forgot password and Reset password, and links to the landing page of the browsing country; not on the setup steps or "Signing you in".
- **Google sign-in failed:** Google sends the person back to `/sign-in?error=google_failed`. Not drawn; shown as a red box above the email field in the same style as the three sign-in errors: "Google sign-in did not work" / "Please try again, or sign in with your email and password." Also used when `/auth/callback` finds no session.
- **Guest attempts are not claimed through Google:** the API's Google start is a plain redirect and takes no guest tokens, so a guest who signs in with Google keeps no attempts (password sign-in and email verification do send them). Needs a decision.
- **Reset link no longer valid** (`/reset-password` with an expired, used or missing token): no artboard. Built with the app's error state under the "Choose a new password" heading: "This reset link is not valid" / "It may have expired or already been used. Ask for a new link." and a button "Send a new reset link" to Forgot password. A save that fails because the link died says "This link is no longer valid. Ask for a new one."
- **Check your email, the error and wait states:** only the empty boxes are drawn. Built with the existing code-error boxes: wrong code ("That code is not right", tries left from the API), expired ("This code has expired"), five wrong codes ("Too many tries", Verify locked), a wait before another code ("You can ask for another code in 0:31."), "We sent you a new code." after "Send a new code". "Send a new code" shows a countdown ("Send a new code in 0:45") while the API's wait runs.
- **Sign-in other errors:** suspended account ("This account is suspended" / "Please contact support."), offline, and a server error use the same red box; field errors ("Enter your password.", the invalid-email line) are inline. "Resend verification" with no valid email typed asks for the email first. If the resend itself is rate-limited a box says how long to wait.
- **Sign-up other errors:** an existing address shows "This email address already has an account." (red box above the button); field errors for name, email and password are inline. The password hint "Use 8 or more characters." turns red when it fails.
- **Terms and Privacy policy:** drawn as a link in "By continuing you agree to the Terms and Privacy policy." but those pages do not exist (see the C-list); it is plain blue text, not a link.
- **Setup 1/3 and Change exam country, meta lines:** the artboards say "Suggested · 90 mock tests" / "24 mock tests" (no currency beside a country, as of design ba8f27b). The countries list has no test count, so the number is the sum of the country's category counts (`GET /countries/:code/categories`, live countries only; the line shows just "Suggested" until it loads). "Coming soon" rows are as drawn (disabled).
- **Setup 1/3, "Not listed? Tell us your country":** no follow-up screen is drawn; the link is drawn as text and does nothing.
- **Setup 2/3, meta lines:** "N mock tests" from the API (plus the category description when it has one); the artboard's extra words ("most practised") are not in the API.
- **Setup 3/3, exam date:** a free-text box ("e.g. 14 Dec 2026") with no calendar. It accepts "14 Dec 2026", "14 December 2026" and "2026-12-14"; anything else shows the inline line "Enter the date like 14 Dec 2026." (not drawn). Level and subject chips can be un-pressed by tapping again (the artboard pre-presses one of each only as a demo); both are optional. The values saved are the chip labels as drawn ("Secondary (S1–S3)", "Mathematics", …).
- **Setup 3/3, "Skip for now" in the fromPaid variant:** drawn going to the dashboard even when a payment was pending; built as drawn, so the pending payment intent is dropped (the person taps the test again).
- **fromPaid variants:** the test title comes from the test's own API record; if it cannot be loaded the blue note is simply not shown (the button text still changes to "Finish and continue to payment").
- **Change exam country (`/account/country`):** reached from the account menu row, the Account tab row, the Account settings country row, the country chip's picker for a signed-in person and the "Switch my account to Kenya" link on the wrong-country page (which pre-selects that country with `?to=`). Not drawn: the case where no other country is live (the radio list starts on the current country and the button reads "Choose a different country", disabled, as drawn), and the explainer's wording when the person has no Full Access (the access bullet is left out). Payment methods in the first bullet come from the new country's own record. The older "Switch to X?" sheet is retired.
- **Account settings:** the screen has no change-password row and no way to edit the name or email (nothing is drawn). A person who only used Google has no password to reset until they use Forgot password.
- **Designer note, `AccountMenu`:** the "Account settings" row still says "Name, phone number" in the artboard; accounts have no phone number, so the build says "Name, email". Please redraw.
- **Designer note, `AccountMenu`:** "Account settings" links to `ChangeCountry.dc` in the artboard, the same target as "Exam country", which looks like a copy-paste slip. Built: Exam country opens Change exam country, Account settings opens the account page (name, email, exam country).
- **Admin, Users detail:** the button reads "Send password reset" and, like the other three actions, is drawn but inert (the confirmation and result dialogs, A5, are still not designed). The audit-history sentence reads "{name} sent a password reset email".
- **Top of the new screens:** only the logo is drawn (no site header, no "Skip to content" bar); the dark side panel of the old sign-up layout is gone, as in the artboards.

### E5 — Design update: palette and screen changes

- **Owner wording change (3 Nov 2026), differs from the artboards:** the guest header button reads "Get started" on every page (it replaces "Create account" and the landing's "Try a free test"; it opens sign-up), and the primary button on a test that has not been started reads "Get started" instead of "Start Mock Test". The artboards (Main, ExamDetail, SignIn…) still show the old words: please redraw.

Design update of 2026-11-03 (commit `8a41ad1`): new palette (Mwalimu Tools, no purple), the landing page without a pricing section, a Country selector in the admin sidebar,
light country-code chips. Built from the artboards; these are the gaps it leaves.

- **Admin sidebar Country selector (desktop):** only the closed button is drawn ("ALL", "All countries", "Rwanda live · Kenya preparing", a chevron). Not drawn: the **open menu**, and the **button
  when one country is chosen**. Built the plainest way: a list in a small white card of the same style (an "All countries" row, then one row per country with its code chip and status), and the chosen
  country shown on the button as its code chip, its name and its status in lower case. The choice is the global country filter: it sets `?country=` (and is remembered in the browser) for Overview, Users, Exams and
  Payments. **Countries and Settings are not filtered**: their API calls take no country, so the button there changes nothing (drawn as is). The **phone** artboards have no selector, so phones have none (the Overview
  page's own Country select on desktop is still drawn and now sets the same filter).
- **Users search wording:** the desktop artboard says "Search name, email or phone" and the phone artboard "Search name or phone"; accounts have no phone number and the API searches name and email only, so
  the field says "Search name or email" until the designer confirms.
- **Disabled "Submit exam" (time up)** is drawn white text on #A3ADBB (2.3:1). Disabled controls are exempt from WCAG contrast, so it is built as drawn; the designer may want a darker grey.
- **Input borders #CDD4DE are 1.5:1 against white** (WCAG 1.4.11 asks 3:1 for the boundary of a form field), and the focus ring #6AA6EE is 2.5:1 against white. Built as drawn; text pairs all pass AA.
- **Button hover** is not drawn. Navy buttons (Submit included, now the same navy) turn #1E4BA8 (the link-hover blue of the palette) on hover; links keep the drawn #1E4BA8.
- **Design update `ba8f27b` (no currency beside a country, lighter type, smaller shapes), things the artboards do not settle:**
  - **Mock-test count per country** is drawn only on the desktop picker ("90 mock tests · MTN MoMo, Airtel Money"); there is no API field for it, so it is the sum of the country's category counts (one extra request per live country). A live country whose categories fail to load shows only its payment methods.
  - **Country that is not live:** desktop draws the tag "Coming soon" and the line "Join the waiting list", the phone draws only "Coming soon" as the line (no tag). Built as drawn per screen size; the country-gate and change-country screens are built by the sign-in/setup pass.
  - **Heading weight:** headings without a weight in the artboards render bold (700) in the browser; the brief says "headings max 600". Built as the artboards render (700); one rule in `styles/index.css` plus the `font-bold` on headings changes it if the designer wants 600.
  - **Oval avatar:** `AdminUsers.dc` draws the user avatar 48 wide by 44 tall with a 999px radius (an oval; it looks like a bulk 48-to-44 height edit). Built as a 48px circle.
  - **Chip heights:** several phone chips are drawn 40px high (catalog categories, Review filters, admin filters); built 44px to keep the touch-target rule.
  - **Accessible name of the country chip** is the artboard's aria-label "Country: Rwanda. Change country", which does not contain the visible code "RW" (WCAG 2.5.3 label in name asks the visible text to be part of the name). Built as drawn.
  - **Checkout inputs and Pay button** are 48px in `Checkout.dc` (phone-width column) and 44px in `CheckoutStates.dc` (desktop); built 48px on phone and 44px from the desktop breakpoint. The Rwanda pay button keeps its 14px radius on phone and the Kenya one is 10px, as drawn.
- **Text links:** "See all N incorrect answers", "← Back to results" and the topic "Practise" are drawn as default links (blue #2D62CF) and built so.

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
- Colours (Mwalimu Tools palette, see `docs/SPEC.md` and `packages/shared/src/tokens.ts`): text #3A3F4A, secondary text #5E6573, page #EFF3F8, surface #FFFFFF, soft grey #EEF1F5,
  card border #E2E7EF, input border #CDD4DE. Brand navy #164A7A (selected background #E8EFFB, focus ring #6AA6EE), links #2D62CF / hover #1E4BA8.
  Status: correct #1E6B3C on #E3F4E8 · incorrect #A1281B on #FBE7E4 · flagged #8A5300 on #FDF1DD · free badge #1E6B3C on #E3F4E8 · partly correct stays orange.
- Radius: buttons and inputs 12px, cards 16–18px, chips and badges pill.
- Buttons: primary navy · secondary navy outline · final/submit dark #182231 · neutral grey outline.
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

**Status:** the designed admin screens are built (`apps/web/src/admin`, served at `/admin` by the web app); every API below is built and tested. What is still
blocked on a design, and shown inert in the app: **A1** (gone: admin uses the normal candidate sign-in, see E3; the admin chrome has no sign-out control), **A2** grant/extend dialog, **A3** suspend dialog, **A4** manual grant dialog, **A5** send login code
result and "View as candidate", **A6** CSV import, **A7/A8** category, topic and case editors, **A9** new mock test form,
**A10** multiple-select / case-based question editor and translations, **A11** reports queue, **A12** audit log screen
(only the short list in Settings exists), **A13** invite and role change, **A14** price change reason, country save and
go-live confirmation, **A15** demand views, **A16** exports, **A17** "no access" screen, **A18** admin loading/empty/error
states. Also: the Overview's "support requests" row has no data source and is omitted.

Existing: overview, users + user detail, exams + question editor, payments, pricing & settings (with team and a
short audit list), countries with go-live checklist — desktop and phone. **Roles:** System admin (everything),
Content editor (exams and questions only; optional country restriction), Support (view users, resend login codes,
check payments). Every sensitive action needs a reason and is written to the audit log.

### A1 · Admin sign-in — **no longer needed** (see E3)
- Admin people sign in through the normal candidate sign-in (C12, email + emailed code) and are sent back to the admin page. No admin sign-in screens, no "not an admin" outcome and no ADMIN-marked sign-in exist any more. Still open from the old A1: a sign-out control in the admin chrome (today: the candidate account menu).

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
