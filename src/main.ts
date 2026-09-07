import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { ensureContentSeeded } from './lib/devContentSeed'
import { router } from './router'
import { restoreIntakeSnapshotIfPresent } from './stores/intake'
import { useSessionStore } from './stores/session'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Resolve the auth session before mount so the first render already knows
// whether someone's signed in, instead of flashing a signed-out state.
// Content seeding needs that same resolved session too now — real content
// requires an authenticated read (RLS), so it can't decide "local file vs
// real pull" until session.init() has actually settled — but it still
// doesn't BLOCK mount on itself once that shared wait is done: a slow or
// failed content pull shouldn't hold the whole app off-screen.
const session = useSessionStore()
const sessionReady = session.init()
sessionReady.finally(() => app.mount('#app'))
sessionReady.finally(() => {
  ensureContentSeeded(session.session?.user.id ?? null).catch((err) => console.error('[devContentSeed] failed:', err))

  // The other half of IntakeView's sign-up-gate safety net: a fresh
  // sign-up's email-confirmation link redirects here as a real page load,
  // landing on the project's configured Site URL — not necessarily back
  // on /intake — so a restored snapshot needs an explicit navigation, not
  // just trusting the current route.
  if (session.session && restoreIntakeSnapshotIfPresent()) {
    router.isReady().then(() => router.push('/intake'))
  }
})
