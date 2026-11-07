import type { DashboardResponse, DashboardTestCard } from '../../api/types';

/** Pure helpers for the dashboard (Dashboard.dc / DashboardPhone.dc). */

export function greeting(countryCode: string, firstName: string): string {
  return `${countryCode === 'RW' ? 'Muraho' : 'Hello'}, ${firstName}`;
}

/** What the Continue card says about the unfinished attempt. A practice set is untimed (its clock is only a safety limit), so it never shows a timer. */
export function resumeView(r: Pick<DashboardResponse['resume'] & object, 'kind' | 'answered' | 'total' | 'mockTest'>, clock: string) {
  if (r.kind === 'PRACTICE') {
    return {
      eyebrow: 'Continue your practice',
      title: `Practice set from ${r.mockTest.title}`,
      meta: `${r.answered} of ${r.total} answered · Untimed`,
      action: 'Continue practice',
    };
  }
  return { eyebrow: 'Continue where you stopped', title: r.mockTest.title, meta: `${r.answered} of ${r.total} answered · ${clock} left on the timer`, action: 'Resume test' };
}

/** The category tile: your goal is the highlighted one, and "Most practised" never sits on a category with nothing in it. */
export function categoryTile(c: { id: string; featured: boolean; mockTestCount: number }, goalCategoryId: string | null | undefined) {
  return { active: c.id === goalCategoryId, mostPractised: c.featured && c.mockTestCount > 0 };
}

export const progressWidth = (answered: number, total: number) => (total <= 0 ? 0 : Math.min(100, Math.round((answered / total) * 100)));

export type HeroStatIcon = 'tests' | 'completed' | 'progress' | 'goal';

export interface HeroStat {
  icon: HeroStatIcon;
  label: string;
  value: string;
}

/**
 * The dashboard hero's 4-tile stat row. Every value comes from real data: `mockTestsAvailable` is the chosen
 * goal's mock-test count (from the categories list, looked up by the caller — not part of `DashboardResponse`
 * itself, hence the separate parameter rather than reaching for it internally). The "Mock tests available"
 * and "Preparing for" tiles are left out when there's no chosen goal, rather than show a 0 or a placeholder.
 */
export function heroStats(d: Pick<DashboardResponse, 'scoreHistory' | 'goal'>, mockTestsAvailable: number | null): HeroStat[] {
  const scored = d.scoreHistory.filter((h): h is typeof h & { percent: number } => h.percent !== null);
  const avg = scored.length > 0 ? Math.round(scored.reduce((sum, h) => sum + h.percent, 0) / scored.length) : 0;
  const tiles: HeroStat[] = [];
  if (mockTestsAvailable !== null) tiles.push({ icon: 'tests', label: 'Mock tests available', value: String(mockTestsAvailable) });
  tiles.push({ icon: 'completed', label: 'Tests completed', value: String(scored.length) });
  tiles.push({ icon: 'progress', label: 'Overall progress', value: `${avg}%` });
  if (d.goal) tiles.push({ icon: 'goal', label: 'Preparing for', value: d.goal.name });
  return tiles;
}

export interface ChartGeometry {
  width: number;
  height: number;
  baseline: number;
  /** y of the 0 % line is `baseline`; y of 100 % is `top`. */
  top: number;
  left: number;
  right: number;
  /** Where the labels under the line sit. */
  dateY: number;
  gridLines: { percent: number; y: number }[];
}

/** Desktop (viewBox 600 x 220) and phone (340 x 150) frames, with the artboards' line positions. */
export const DESKTOP_CHART: ChartGeometry = {
  width: 600, height: 220, baseline: 200, top: 20, left: 100, right: 520, dateY: 218,
  gridLines: [100, 70, 40].map((percent) => ({ percent, y: 200 - (percent / 100) * 180 })),
};
export const PHONE_CHART: ChartGeometry = {
  width: 340, height: 150, baseline: 125, top: 30, left: 50, right: 290, dateY: 144,
  gridLines: [],
};

export interface ChartPoint {
  x: number;
  y: number;
  percent: number;
  label: string;
}

/** Points spread evenly between `left` and `right`; y is linear in the percentage (0 % = baseline). */
export function chartPoints(history: { percent: number | null; label: string }[], g: ChartGeometry): ChartPoint[] {
  const pts = history.filter((h): h is { percent: number; label: string } => h.percent !== null);
  const mid = (g.left + g.right) / 2;
  return pts.map((h, i) => ({
    x: pts.length === 1 ? mid : g.left + (i * (g.right - g.left)) / (pts.length - 1),
    y: Math.round((g.baseline - (Math.max(0, Math.min(100, h.percent)) / 100) * (g.baseline - g.top)) * 10) / 10,
    percent: Math.round(h.percent),
    label: h.label,
  }));
}

/** "54 percent on 17 October, 62 percent on 24 October" for the chart's accessible name. */
export function chartAria(points: ChartPoint[], longDates: string[]): string {
  return `Scores: ${points.map((p, i) => `${p.percent} percent${longDates[i] ? ` on ${longDates[i]}` : ''}`).join(', ')}`;
}

export function longDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Everything the artboard can show for this data. Sections without data are left out; "My access" always has a state. */
export function visibleSections(d: DashboardResponse) {
  return {
    resume: !!d.resume,
    recommended: !!d.recommended,
    history: d.scoreHistory.some((h) => h.percent !== null),
    topics: d.topics.strong.length + d.topics.needsWork.length > 0,
    recent: d.recentlyCompleted.length > 0,
    access: true,
  };
}

// ───────────────────────── "My access" states (DashboardNew.dc, DashboardNewPhone.dc)

export type AccessState = 'free' | 'pending' | 'active' | 'endingSoon' | 'expired';

/**
 * Which "My access" card to draw, from the API's fields only:
 *  - a payment waiting for approval wins (the user is in the middle of paying);
 *  - then running access (`endingSoon` = 3 days or fewer), then access that ended, then "free only".
 */
export function accessState(d: Pick<DashboardResponse, 'access' | 'pendingPayment'>): AccessState {
  if (d.pendingPayment) return 'pending';
  if (d.access.current) return d.access.current.endingSoon ? 'endingSoon' : 'active';
  if (d.access.expired) return 'expired';
  return 'free';
}

export type BadgeTone = 'soft' | 'amber' | 'green';

export interface AccessCardView {
  state: AccessState;
  badge: { text: string; tone: BadgeTone };
  title: string;
  body: string;
  /** Progress bar: share of the plan's days still left, and its colour. */
  bar: null | { percent: number; amber: boolean };
  cta: null | { label: string; target: 'checkout' | 'check' };
  link: null | { label: string; target: 'catalog' | 'resend' };
}

export interface AccessCardInput {
  d: Pick<DashboardResponse, 'access' | 'pendingPayment'>;
  countryName: string;
  /** From `GET /api/countries/:code`: the price and length of Full Access. Missing price => lines that need it are left out. */
  plan: null | { priceLabel: string | null; durationDays: number; checkoutAvailable: boolean };
  /** Details of the waiting payment (`GET /api/payments/:id`): where the prompt went and when it was sent. */
  pending?: null | { msisdn: string; createdAt: string };
  formatDate: (iso: string) => string;
  formatTime: (iso: string) => string;
  formatPhone: (e164: string) => string;
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function accessCardView(i: AccessCardInput): AccessCardView {
  const state = accessState(i.d);
  const planDays = i.plan?.durationDays ?? null;
  const canBuy = !!i.plan?.checkoutAvailable;
  const none = { bar: null, cta: null, link: null };

  if (state === 'pending') {
    const p = i.d.pendingPayment!;
    const where = i.pending ? ` to ${i.formatPhone(i.pending.msisdn)} at ${i.formatTime(i.pending.createdAt)}` : '';
    return {
      ...none,
      state,
      badge: { text: 'Pending', tone: 'amber' },
      title: `Waiting for your ${p.providerLabel} approval`,
      // The artboard adds "with your PIN"; JobPrep never asks for or mentions entering a PIN in its own copy.
      body: `We sent a prompt for ${p.priceLabel}${where}. Approve it on your phone. If you don’t, you won’t be charged.`,
      cta: { label: 'Check payment', target: 'check' },
      link: { label: 'Send the prompt again', target: 'resend' },
    };
  }
  if (state === 'active' || state === 'endingSoon') {
    const c = i.d.access.current!;
    const percent = planDays ? Math.max(0, Math.min(100, Math.round((c.daysLeft / planDays) * 100))) : null;
    const bar = percent === null ? null : { percent, amber: state === 'endingSoon' };
    if (state === 'active') {
      return {
        state, bar, cta: null,
        badge: { text: 'Active', tone: 'green' },
        title: `Full Access · ${days(c.daysLeft)} left`,
        body: `Every mock test in ${i.countryName} is unlocked until ${i.formatDate(c.endsAt)}.`,
        link: { label: 'Browse all mock tests', target: 'catalog' },
      };
    }
    return {
      state, bar,
      badge: { text: c.daysLeft <= 0 ? 'Ends today' : `Ends in ${days(c.daysLeft)}`, tone: 'amber' },
      title: `Full Access ends on ${i.formatDate(c.endsAt)}`,
      body: `After that, you keep your results but paid tests lock again. You can buy another ${planDays ? days(planDays) : 'period'} at any time — it starts when the current access ends.`,
      cta: canBuy ? { label: planDays ? `Add ${planDays} more days` : 'Add more days', target: 'checkout' } : null,
      link: null,
    };
  }
  if (state === 'expired') {
    return {
      ...none,
      state,
      badge: { text: 'Expired', tone: 'soft' },
      title: `Full Access ended on ${i.formatDate(i.d.access.expired!.endedAt)}`,
      body: 'Your results, scores and review notes are still here. Free sample tests stay open.',
      cta: canBuy ? { label: 'Get Full Access again', target: 'checkout' } : null,
    };
  }
  const price = i.plan?.priceLabel;
  return {
    ...none,
    state,
    badge: { text: 'Free', tone: 'soft' },
    title: 'You’re using free sample tests',
    body: `Full Access unlocks every mock test in ${i.countryName}${planDays ? ` for ${days(planDays)}` : ''}${price ? `, with one payment of ${price}` : ''}. Nothing renews.`,
    cta: canBuy ? { label: 'Get Full Access', target: 'checkout' } : null,
  };
}

/** "Good morning" / "Good afternoon" / "Good evening" from the hour (0-23, local time). */
export function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** A time-of-day greeting ("Good morning, Aline") for someone who has not finished a test yet, else the usual greeting. */
export function headline(d: Pick<DashboardResponse, 'hasActivity' | 'country' | 'user'>, hour: number = new Date().getHours()): string {
  return d.hasActivity ? greeting(d.country.code, d.user.firstName) : `${getGreeting(hour)}, ${d.user.firstName}`;
}

/** "Free sample · 50 questions · 60 minutes" on the Start here card. */
export function startHereLine(t: Pick<DashboardTestCard, 'isFree' | 'questionCount' | 'durationMinutes'>): string {
  return `${t.isFree ? 'Free sample' : 'Mock test'} · ${t.questionCount} questions · ${t.durationMinutes} minutes`;
}

/** "40 questions · 45 min" in "More for your goal". */
export function suggestedMeta(t: Pick<DashboardTestCard, 'questionCount' | 'durationMinutes'>): string {
  return `${t.questionCount} questions · ${t.durationMinutes} min`;
}

/** The practice line. Practice has no clock, so there are no minutes ("15 questions · 20 min" in the artboard no longer applies). */
export function practiceLine(r: { percent: number; questionCount: number }, desktop: boolean): string {
  return desktop
    ? `Your weakest topic at ${r.percent}%. ${r.questionCount} questions, with explanations after each one.`
    : `Your weakest topic at ${r.percent}% · ${r.questionCount} questions`;
}
