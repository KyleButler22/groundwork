import { describe, expect, it } from 'vitest'

import { parseHowTo } from './exerciseHowTo'

describe('parseHowTo', () => {
  it('returns [] for null, undefined, empty, and whitespace-only input', () => {
    expect(parseHowTo(null)).toEqual([])
    expect(parseHowTo(undefined)).toEqual([])
    expect(parseHowTo('')).toEqual([])
    expect(parseHowTo('   \n  \n')).toEqual([])
  })

  it('splits one "Label: detail" line into trimmed label and detail', () => {
    expect(parseHowTo('Setup:  Kneel on a pad. ')).toEqual([
      { label: 'Setup', detail: 'Kneel on a pad.', isWarning: false },
    ])
  })

  it('parses multiple lines in order and drops blank lines between them', () => {
    expect(parseHowTo('Setup: Stand tall.\n\nMovement: Lower down.\n')).toEqual([
      { label: 'Setup', detail: 'Stand tall.', isWarning: false },
      { label: 'Movement', detail: 'Lower down.', isWarning: false },
    ])
  })

  it('treats a line with no colon as a label-less detail line', () => {
    expect(parseHowTo('Just do the thing.')).toEqual([
      { label: '', detail: 'Just do the thing.', isWarning: false },
    ])
  })

  it('keeps everything after the first colon as the detail', () => {
    expect(parseHowTo('Movement: lower, pause, then press up: hard')).toEqual([
      { label: 'Movement', detail: 'lower, pause, then press up: hard', isWarning: false },
    ])
  })

  it('flags a cautionary line by its label, case-insensitively', () => {
    expect(parseHowTo('Common mistake: sagging hips')[0].isWarning).toBe(true)
    expect(parseHowTo('common mistake: sagging hips')[0].isWarning).toBe(true)
    expect(parseHowTo('Avoid: locking the knees')[0].isWarning).toBe(true)
    expect(parseHowTo('Watch out: rounding the back')[0].isWarning).toBe(true)
  })

  it('does not flag a line whose detail merely contains a warning word', () => {
    expect(parseHowTo('Movement: avoid bouncing at the bottom')[0].isWarning).toBe(false)
    expect(parseHowTo('Tip: watch out for your breathing')[0].isWarning).toBe(false)
  })

  it('tolerates CRLF line endings (the seed file is CRLF on Windows checkouts)', () => {
    expect(parseHowTo('Setup: A.\r\nCommon mistake: B.\r\n')).toEqual([
      { label: 'Setup', detail: 'A.', isWarning: false },
      { label: 'Common mistake', detail: 'B.', isWarning: true },
    ])
  })
})
