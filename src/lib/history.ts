// Time windows for the History tab. Pure functions, no store dependency.
// Dates are handled as UTC midnights so day arithmetic never trips over DST.

export const HISTORY_RANGES = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: '6months', label: '6 months' },
  { id: 'year', label: '1 year' },
  { id: '5years', label: '5 years' },
] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number]['id'];

/** How long one column of the history chart is. */
export type BucketUnit = 'day' | 'week' | 'month';

export interface Bucket {
  start: string; // YYYY-MM-DD, inclusive
  end: string;   // YYYY-MM-DD, inclusive
  /** Full name for the readout: 'Fri, Oct 24', 'Week of Oct 6', 'October 2024'. */
  label: string;
  /** Axis label, or null when this column gets none. */
  tick: string | null;
}

export interface HistoryWindow {
  unit: BucketUnit;
  from: string;
  to: string;
  buckets: Bucket[];
}

const DAY_MS = 86_400_000;

function parse(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

function dayBuckets(today: Date, days: number): Bucket[] {
  const first = addDays(today, -(days - 1));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(first, i);
    // A week shows every weekday; a month marks each Monday, but not one so
    // close to the right edge that its label would run off the chart.
    const tick = days <= 7
      ? fmt(d, { weekday: 'short' })
      : d.getUTCDay() === 1 && i <= days - 4 ? fmt(d, { month: 'short', day: 'numeric' }) : null;
    return { start: format(d), end: format(d), label: fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }), tick };
  });
}

/** `weeks` Monday-to-Sunday weeks, the last one being the current week. */
function weekBuckets(today: Date, weeks: number): Bucket[] {
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
  const first = addDays(monday, -7 * (weeks - 1));
  // Six months labels every month; a year only every quarter, which is all that fits.
  const every = weeks > 26 ? 3 : 1;
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(first, 7 * i);
    const month = start.getUTCMonth();
    const newMonth = i > 0 && addDays(start, -7).getUTCMonth() !== month;
    const tick = newMonth && month % every === 0 && i <= weeks - (every === 3 ? 6 : 3)
      ? fmt(start, month === 0 && every === 3 ? { month: 'short', year: 'numeric' } : { month: 'short' })
      : null;
    return {
      start: format(start),
      end: format(addDays(start, 6)),
      label: `Week of ${fmt(start, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      tick,
    };
  });
}

/** `months` calendar months, the last one being the current month. */
function monthBuckets(today: Date, months: number): Bucket[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return Array.from({ length: months }, (_, i) => {
    const start = new Date(Date.UTC(y, m - (months - 1) + i, 1));
    const end = new Date(Date.UTC(y, m - (months - 1) + i + 1, 0));
    const tick = start.getUTCMonth() === 0 && i <= months - 5 ? String(start.getUTCFullYear()) : null;
    return { start: format(start), end: format(end), label: fmt(start, { month: 'long', year: 'numeric' }), tick };
  });
}

/**
 * The columns the History chart shows for a range, ending with the one that
 * contains `today`. Short ranges are split into days, longer ones into weeks
 * or months so the chart stays readable on a phone.
 */
export function historyWindow(range: HistoryRange, today: string): HistoryWindow {
  const t = parse(today);
  let unit: BucketUnit;
  let buckets: Bucket[];
  switch (range) {
    case 'week':    unit = 'day';   buckets = dayBuckets(t, 7); break;
    case 'month':   unit = 'day';   buckets = dayBuckets(t, 30); break;
    case '6months': unit = 'week';  buckets = weekBuckets(t, 26); break;
    case 'year':    unit = 'week';  buckets = weekBuckets(t, 52); break;
    case '5years':  unit = 'month'; buckets = monthBuckets(t, 60); break;
  }
  return { unit, from: buckets[0].start, to: today, buckets };
}

/** Which column a date falls in, or -1 when it is outside the window. */
export function bucketIndex(win: HistoryWindow, date: string): number {
  if (date < win.from || date > win.to) return -1;
  const d = parse(date);
  const from = parse(win.from);
  switch (win.unit) {
    case 'day':   return Math.round((d.getTime() - from.getTime()) / DAY_MS);
    case 'week':  return Math.floor(Math.round((d.getTime() - from.getTime()) / DAY_MS) / 7);
    case 'month': return (d.getUTCFullYear() - from.getUTCFullYear()) * 12 + d.getUTCMonth() - from.getUTCMonth();
  }
}

/** Calendar days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
}

// ── Cadence ───────────────────────────────────────────────────────
// How well the gap since the previous session of the same exercise matched
// the ideal rest. The queue turns an exercise yellow, then red, as it waits;
// the ideal is halfway between — with the defaults (3 and 5), the orange point
// at 4 days: rested long enough, but not so long it's overdue.

export function idealGap(yellowAfterDays: number, redAfterDays: number): number {
  return (yellowAfterDays + redAfterDays) / 2;
}

/**
 * Signed distance from the ideal: 0 = ideal, −1 = far too soon, +1 = far too
 * late. A one-day gap is as far too soon as it gets; "too late" is scored over
 * the same number of days on the other side. An ideal between two whole days
 * (yellow 1, red 2 → 1.5) counts both as ideal, since gaps are whole days.
 */
export function cadenceDeviation(gap: number, ideal: number): number {
  const lo = Math.floor(ideal);
  const hi = Math.ceil(ideal);
  // Never fewer than two days, so one day off a short ideal isn't already red.
  const span = Math.max(lo - 1, 2);
  const off = gap < lo ? gap - lo : gap > hi ? gap - hi : 0;
  return Math.max(-1, Math.min(1, off / span));
}

/** Green at the ideal, through yellow and orange to red — the queue's colors. */
export function cadenceColor(deviation: number): string {
  const hue = 120 * (1 - Math.abs(deviation));
  return `hsl(${hue.toFixed(1)}, 75%, 45%)`;
}

export function cadenceVerdict(deviation: number): string {
  const d = Math.abs(deviation);
  if (d < 0.2) return 'ideal';
  const side = deviation < 0 ? 'soon' : 'late';
  return d < 0.6 ? `a bit ${side}` : `too ${side}`;
}

/** '4 days', or '4–5 days' when the ideal falls between two. */
export function fmtIdeal(ideal: number): string {
  return Number.isInteger(ideal) ? `${ideal} ${ideal === 1 ? 'day' : 'days'}` : `${Math.floor(ideal)}–${Math.ceil(ideal)} days`;
}
