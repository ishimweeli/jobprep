# Writing brief: mock-exam questions in the real MIFOTRA pattern

Every JobPrep mock has **exactly 50 questions**, and every job on the site is a real MIFOTRA posting. Writers produce
either top-ups (existing mocks below 50) or whole new 50-question mocks for a newly advertised job. Writers never edit
repo files; they write JSON part files that `check.ts` validates and `apply.ts` merges.

## What the real MIFOTRA written exam looks like (match this)
- Multiple choice, 4 options, one correct. Candidates see options shuffled, so position doesn't matter.
- Content, measured on 195 real questions: ~20–30% **the job's own duties and technical knowledge** (from the
  advert), ~50–60% **laws, policies, strategies, programmes and institutions the post works within**, at most ~10%
  general Rwanda public-service knowledge the post plausibly needs (NST2 / Vision 2050 targets, decentralisation
  structure, public-service ethics). **No aptitude puzzles, no generic maths, no common-sense scenarios.**
- Style: exact recall — rules, lists, definitions, responsibilities, numbers and dates in the policy or law, what an
  acronym stands for, "Which of the following is NOT …" (~20% negative stems), "Fill the missing …".
- **Distractors are near-misses**: a neighbouring number or year, a close law number, an item from a related list, a
  plausible-but-wrong institution. Never joke options.
- **The correct option must not stand out**: similar length, detail and grammar to the wrong ones. It may be the
  single longest option in at most 1 of every 3 questions.
- "None of the above" / "All of the above" sparingly (≤ 10%), always as the last option.
- **Marking and structure**: the real exam is marked out of 100. Questions 1–30 carry 1 mark, 31–40 carry 3 marks, and
  41–50 carry 4 marks each. Questions 41–50 are **two case studies of five questions each**: a short passage (2–4
  sentences) frames the post's role and one subject (for example: "One of the responsibilities of the Sector Executive
  Secretary is to supervise civil registration. Suppose that you are selected to join a panel … you are first asked to
  answer the questions prepared for the interview"), then five exact-recall questions on that one law or policy. The
  three-mark questions (31–40) and the case questions are not harder in kind, but put the more demanding, rule-heavy
  recall there. `apply.ts` sets the marks; you only choose which questions go where.

## Accuracy (non-negotiable)
- Every fact must be true and current. Verify law numbers, dates, figures and institutional facts with web sources
  (gazette, RwandaLII, ministry/agency sites, MINECOFIN, NISR, RGB, MIFOTRA, professional standards bodies).
- If a fact cannot be verified, do not write that question.
- Known traps: CNLG merged into MINUBUMWE (2021); Ubudehe categories A–E (2020 reform); NST2 (2024/25–2028/29)
  succeeds NST1; Cell-level SEDO was split into Economic Development Officer and Human Capital & Social Development
  Officer.
- Every question carries a short `source` (URL or document + article). It is kept for review, not shown.
- `explanation`: 1–2 plain-English sentences on why the answer is right, naming the law/policy/standard. Never refer
  to options by letter — options are shuffled.

## Don't repeat
The job's context file (from `scan.ts`) holds the advert and every existing question. Do not repeat a fact already
asked there or in your own parts. Spread questions across the advert's duties and the frameworks.

## Work in small parts
Write **part files of at most 20 questions** into your output folder (`part01.json`, `part02.json`, …) as you go —
one huge write stalls. After each part run `npx tsx prisma/pipeline/check.ts <worklist.json> <folder>` from
`apps/api`; finish when it prints OK with all counts complete.

## Part file shape
```json
{
  "topups": {
    "<existing mock slug>": [
      { "section": "<one of that mock's existing section names, exactly>", "topic": "<that mock's topic or the section name>",
        "stem": "…", "options": ["…", "…", "…", "…"], "correct": 2, "explanation": "…", "source": "…" }
    ]
  },
  "newMocks": [
    { "slug": "<from the work list>", "title": "<from the work list>", "summary": "≤ 220 chars, topics covered",
      "free": false, "sections": ["<3–4 section names>"],
      "questions": [ { "section": "…", "topic": "…", "stem": "…", "options": ["…","…","…","…"], "correct": 0, "explanation": "…", "source": "…" } ] }
  ]
}
```
- Top-ups bring the mock to exactly 50 and use its existing section names (a live mock cannot get new sections).
- A new mock: exactly 50 questions. Questions 1–40 go in 3–4 sections of at least 8 each; questions 41–50 are the two
  case studies: `section` must be exactly `"Case studies"` (do not list it in `sections`), and `case` is `0` for
  questions 41–45 and `1` for questions 46–50. Questions 1–40 have no `case`. Put title/summary/free/sections/cases in
  its first part; later parts need only `slug` and `questions`. Use `free` as the work list says.
- `cases` holds exactly two items, `{ "title": "<the law or policy the five questions are about>", "passage": ["<2–4
  sentences>"] }`: the passage is context only and must not give away any answer. All five questions of a case are about
  its subject, in the same source document where possible.

Example of a new mock part (abridged):
```json
{ "newMocks": [ { "slug": "…", "title": "…", "summary": "…", "free": false, "sections": ["Duties", "Laws", "Policies"],
  "cases": [ { "title": "Law on …", "passage": ["One of the responsibilities of … Suppose that …"] }, { "title": "Policy on …", "passage": ["…"] } ],
  "questions": [ { "section": "Duties", "topic": "…", "stem": "…", "options": ["…","…","…","…"], "correct": 1, "explanation": "…", "source": "…" },
                 { "section": "Case studies", "case": 0, "topic": "…", "stem": "…", "options": ["…","…","…","…"], "correct": 3, "explanation": "…", "source": "…" } ] } ] }
```
