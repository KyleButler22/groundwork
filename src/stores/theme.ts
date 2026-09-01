import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

/**
 * 'system' means "no explicit choice" — style.css's own
 * `@media (prefers-color-scheme: light)` override decides, which is
 * exactly what already happened everywhere before this store existed.
 * 'light'/'dark' set `data-theme` directly, which style.css's three theme
 * blocks already handle: `[data-theme='light']` matches directly, and
 * `data-theme='dark'` needs no block of its own — it just excludes the
 * light media-query override (`:not([data-theme='dark'])`), leaving the
 * base `:root`/`@theme` dark values (already the default) in effect.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'groundwork-theme'

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark'
}

function readStored(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isThemeChoice(stored) ? stored : 'system'
  } catch {
    // Storage can throw in private-browsing/locked-down contexts — falling
    // back to 'system' is the same as if nothing had ever been saved.
    return 'system'
  }
}

function applyToDocument(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = choice
}

export const useThemeStore = defineStore('theme', () => {
  const choice = ref<ThemeChoice>(readStored())
  // index.html's inline script already applies the stored choice before
  // first paint (avoiding a flash of the wrong theme) — this call is a
  // no-op in that case and only does real work if the store gets created
  // some other way (tests, HMR) without that script having run first.
  applyToDocument(choice.value)

  function setChoice(next: ThemeChoice): void {
    choice.value = next
    applyToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Best-effort — the choice still applies for this page load even if
      // it can't be remembered for next time.
    }
  }

  // Resolves 'system' against the OS's actual current preference, kept
  // live via a change listener — for anything that needs to know which
  // theme is genuinely ON SCREEN right now (e.g. picking a light-mode vs.
  // dark-mode logo image), not just what the user's choice is. CSS
  // resolves this on its own via prefers-color-scheme; this exists
  // because choosing an <img> src has no CSS equivalent.
  const osPrefersLight = ref(matchMedia('(prefers-color-scheme: light)').matches)
  const media = matchMedia('(prefers-color-scheme: light)')
  const onOsChange = (e: MediaQueryListEvent): void => {
    osPrefersLight.value = e.matches
  }
  media.addEventListener('change', onOsChange)
  onScopeDispose(() => media.removeEventListener('change', onOsChange))

  const effectiveTheme = computed<'light' | 'dark'>(() => {
    if (choice.value === 'system') return osPrefersLight.value ? 'light' : 'dark'
    return choice.value
  })

  return { choice, setChoice, effectiveTheme }
})
