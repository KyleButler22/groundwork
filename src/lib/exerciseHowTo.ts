/**
 * Parse an exercise's `how_to` text (see
 * supabase/seed/001_movement_library.sql) into structured lines for
 * ExerciseView. The stored format is 2-4 newline-separated
 * "Label: detail" lines, the last always a cautionary one
 * ("Common mistake:" / "Avoid:" / "Watch out:").
 *
 * Pure and dependency-free — unit-tested in exerciseHowTo.spec.ts. A line
 * with no colon becomes a label-less detail line. Blank lines are
 * dropped. `\r\n` is tolerated: the seed file is stored LF but checked
 * out CRLF on Windows (no .gitattributes override).
 */
export interface HowToLine {
  label: string
  detail: string
  isWarning: boolean
}

const WARNING_LABEL = /^(common mistake|avoid|watch out)\b/i

export function parseHowTo(howTo: string | null | undefined): HowToLine[] {
  if (!howTo) return []
  const lines: HowToLine[] = []
  for (const raw of howTo.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon === -1) {
      lines.push({ label: '', detail: line, isWarning: false })
      continue
    }
    const label = line.slice(0, colon).trim()
    const detail = line.slice(colon + 1).trim()
    lines.push({ label, detail, isWarning: WARNING_LABEL.test(label) })
  }
  return lines
}
