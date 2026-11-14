// Time helpers. Instants are stored in UTC; a "day" is always computed in the athlete's local zone.

export const DEFAULT_TIMEZONE = "America/Los_Angeles";
export const FOLLOWUP_DAYS = 7;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD of an instant in the given IANA zone. */
export function localDateOf(instant: string | Date, timezone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid instant: ${String(instant)}`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const toUtcMs = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(date: string, n: number): string {
  return new Date(toUtcMs(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole calendar days from a to b (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** Completed years on `onDate` for a YYYY-MM-DD date of birth. */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

export function isMinorOn(dateOfBirth: string | null, onDate: string): boolean {
  // Fail closed: an unknown date of birth is treated as a minor.
  if (!dateOfBirth) return true;
  return ageOn(dateOfBirth, onDate) < 18;
}

/**
 * 1-based follow-up day for an impact, as seen on `onDate`. Day 1 is the athlete's local calendar
 * day of the impact; day 7 is six days later. Values above 7 mean the window is over.
 */
export function followUpDayNumber(impactAt: string, onDate: string, timezone: string): number {
  return dayDiff(localDateOf(impactAt, timezone), onDate) + 1;
}

export function followUpSchedule(
  impactAt: string,
  timezone: string,
): { day: number; localDate: string }[] {
  const start = localDateOf(impactAt, timezone);
  return Array.from({ length: FOLLOWUP_DAYS }, (_, i) => ({ day: i + 1, localDate: addDays(start, i) }));
}
