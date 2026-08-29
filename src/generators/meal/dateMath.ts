/**
 * Pure UTC-based date-string math for yyyy-mm-dd values (meal_plans.week_
 * starts_on, meal_plan_entries.serve_on, user_recipe_feedback.last_served_on
 * — all `date`, never `timestamptz`). UTC specifically so a date string
 * never shifts by a day depending on the browser's local timezone — these
 * values represent a calendar day, not an instant.
 */

const MS_PER_DAY = 86_400_000

function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(parseDateUTC(iso) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDateUTC(toIso) - parseDateUTC(fromIso)) / MS_PER_DAY)
}
