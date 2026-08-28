/**
 * Storage wrapper — every read/write of small persisted values (not the
 * content cache, see db.ts) goes through here instead of calling
 * `localStorage` directly.
 *
 * The payoff: porting to Capacitor means swapping this one file's
 * implementation for `@capacitor/preferences` (and the Keychain/Keystore
 * for anything sensitive, like a cached auth token) without touching any
 * call site. See calisthenics-app-stack memory.
 */
export interface Storage {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
}

const memoryFallback = new Map<string, string>()

function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__groundwork_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return true
  } catch {
    // Private browsing / disabled storage / non-browser (SSR-ish) context.
    return false
  }
}

const backend = isLocalStorageAvailable() ? window.localStorage : null

export const storage: Storage = {
  get<T>(key: string): T | null {
    const raw = backend ? backend.getItem(key) : (memoryFallback.get(key) ?? null)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value)
    if (backend) backend.setItem(key, raw)
    else memoryFallback.set(key, raw)
  },
  remove(key: string): void {
    if (backend) backend.removeItem(key)
    else memoryFallback.delete(key)
  },
}
