# Missing designs

Rule from the owner: nothing is built without a design. This is every screen, dialog or state the product
needs that has **no artboard** in the approved design (`docs/design/source`, 42 artboards). Checked against
the artboard markup, not from memory.

## What is designed (and may be built)
Landing (desktop, phone, Kenya phone) · Exam discovery (desktop, phone) · Exam details (free and paid, desktop,
phone) · Mock exam (desktop, phone) · Case-based question (desktop, phone) · Time up and offline banner (phone) ·
Results (desktop, phone) · Answer review (desktop, phone) · Dashboard (desktop, phone) · Pricing (desktop, phone) ·
Mobile Money checkout with the "Approve on your phone" state (phone) · M-Pesa checkout (Kenya, phone) ·
Payment confirmed (phone) · System states: loading, empty, error, resume, payment declined or expired, access
states · Country picker (desktop, phone) · Sign-up with country, phone, code, job goal (desktop, phone) ·
Change country sheet (phone) · Admin overview, users and user detail, exams and question editor, payments,
pricing and settings (with team and a short audit list), countries with go-live checklist (desktop, and phone
for each).

## A. Candidate app — missing
| # | Missing design | Where it is needed | Status |
|---|---|---|---|
| 1 | **Practice-set runner**: answering with the right answer and explanation shown after each question | "Practice Weak Areas", dashboard "Start practice" (dashboard text promises "explanations after each one") | API built (`/practice`, `/check`), no screen |
| 2 | **"Request this exam" form** (what the user fills in and the confirmation) | Empty search state (only the button is drawn) | API built |
| 3 | **"Notify me when X opens" form and confirmation** | Country picker for coming-soon countries (only the button is drawn) | API built |
| 4 | **Standalone sign-in** screens (code entry for returning users, wrong or expired code, resend) | The sign-up artboards mention "Sign in with your phone number" but only draw the sign-up path | Confirm what is covered |
| 5 | **Account page on desktop**; **edit name or language**; **sign out**; header **account menu** | Header "Sign in" is drawn; the signed-in header and account menu are not | Phone account page exists only inside the change-country sheet |
| 6 | **Change goal** screen or sheet | Dashboard "Change goal" link | Only the link is drawn |
| 7 | **Dashboard for a new user** (no attempts, nothing to resume or recommend) | First visit after sign-up | Not drawn |
| 8 | **Practice results variant** (a practice set has no "compared with last time") | After a practice set | Not drawn |
| 9 | **Time up on desktop** | Auto-submit at time-up | Phone only |
| 10 | **Offline and "N answers waiting to save" banner on desktop** | Exam screen | Phone only, plus a component in States |
| 11 | **Checkout on desktop** | Checkout | The design is phone-first only |
| 12 | **Payment pending too long / "Check payment" for the candidate**, and the provider-down error ("We could not send the request") | Checkout | Only declined or expired is drawn |
| 13 | **Language switcher** (English, Kinyarwanda, Kiswahili) in the header or account | Any page | Only a language select inside the country picker |
| 14 | **Kenya desktop screens** (landing, catalog, details, pricing) and **KES price display** rules | Kenya go-live | Only a Kenya landing on phone and the M-Pesa checkout |
| 15 | **Terms, Privacy, Refund policy, Help or Contact**, **cookie notice** | Footer links, Kenya go-live checklist ("legal review of terms and refund policy") | None drawn |
| 16 | **404** and **generic error** pages, **maintenance** page | Everywhere | Only inline error with retry is drawn |
| 17 | **Guest "Save my result" success state** after sign-up from results | Results | The sign-up flow is drawn, the return to results is not |

## B. Admin — missing
| # | Missing design | Where it is needed |
|---|---|---|
| 18 | **Admin sign-in** (phone and code) and session expiry | Admin entry |
| 19 | **Grant or extend access dialog** (reason required) | Users, user detail (button and a note are drawn) |
| 20 | **Suspend account dialog** (reason required) and un-suspend | Users |
| 21 | **Manual grant dialog** (provider transaction ID required) and the result of "Check payment" | Payments (a note says it asks for an ID; no dialog) |
| 22 | **CSV import**: upload, column mapping, validation errors, preview, confirm | Exams (only the button is drawn) |
| 23 | **Category, section, topic and case editors** (case passage and tables) | Exams and questions |
| 24 | **New mock test form** with every format setting (question count, time limit, marks, sections, negative marking, languages, official pass mark with a required source, free or Full Access) | Exams |
| 25 | **Question editor for multiple-select (all-or-nothing or partial) and case-based questions**, and for translations | Exams (the artboard edits one single-answer question) |
| 26 | **Candidate reports queue** (list, filter, resolve) | Exams (only a banner on one question) |
| 27 | **Full audit log** with filters and actor or entity detail | Settings (a short list is drawn) |
| 28 | **Invite or edit admin** dialog with role and country restriction | Settings (only the Invite button) |
| 29 | **Go-live confirmation** for a country, **payment provider setup** (sandbox to live), **set price in a country's currency** | Countries |
| 30 | **Exam demand view** ("requested 7 times", waiting list, "Plan exam") | Overview alert links nowhere |
| 31 | **"Export for accounting"** options, **"View as candidate"** | Payments, user detail (buttons only) |
| 32 | **Forbidden-action state** for Content editor and Support roles (hidden or disabled controls, "you don't have access") | Every admin screen |

## C. Copy with no design
- OTP and receipt **SMS wording** (I wrote: "Your JobPrep code is 123456. It expires in 5 minutes. Never share it." and "JobPrep: we received RWF 2,000 via MTN MoMo. Full Access is active until 2 Dec 2026. Ref …").
- Error messages for API error codes (invalid code, too many attempts, resend wait, daily limit, account suspended, country mismatch).

## What this means for the work done so far
- **Backend built without a drawn screen:** practice sets and the per-question check (#1), exam requests (#2), waiting list (#3), and the endpoints behind sign-in and account (#4, #5). These are APIs only, nothing visible. Say if you want any of them removed.
- **Not started, and blocked on design:** admin backend and screens (Phase 7) for items 18 to 32.
- **Not blocked:** everything in "What is designed".
