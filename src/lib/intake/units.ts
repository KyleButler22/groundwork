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

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches - feet * 12)
  return { feet, inches }
}
