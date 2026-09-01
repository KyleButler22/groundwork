/**
 * docs/intake.md open questions: "store metric always, ask in whichever
 * units the user picked at step 1. Imperial units are an input-layer
 * concern only and should never reach the database." Every function here
 * converts INTO metric; nothing in the store or its Supabase projection
 * should ever hold a pound or an inch.
 */

export function lbToKg(lb: number): number {
  return lb * 0.45359237
}

export function kgToLb(kg: number): number {
  return kg / 0.45359237
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54
}

/**
 * Rounds to the nearest WHOLE inch first, then splits into feet/inches —
 * not the other way around. Splitting first and rounding each part
 * independently (the original bug here) can round the leftover inches up
 * to 12 without carrying into feet: 152cm is 59.84 total inches, which
 * floors to 4 feet with an 11.84-inch remainder that then rounds to a
 * literal "4 feet 12 inches" instead of carrying to 5 feet 0. Rounding
 * the total first means the feet/inches split happens on an integer,
 * where inches = totalInches - feet*12 is always in [0, 11] by
 * construction — there's no remainder left to round separately.
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / 2.54)
  const feet = Math.floor(totalInches / 12)
  const inches = totalInches - feet * 12
  return { feet, inches }
}
