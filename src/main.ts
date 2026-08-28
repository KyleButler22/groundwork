import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { ensureContentSeeded } from './lib/devContentSeed'
import { router } from './router'
import { useSessionStore } from './stores/session'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Resolve the auth session before mount so the first render already knows
// whether someone's signed in, instead of flashing a signed-out state.
// Content seeding runs alongside it, not blocking mount on it — a slow or
// failed seed shouldn't hold the whole app off-screen.
useSessionStore()
  .init()
  .finally(() => app.mount('#app'))

ensureContentSeeded().catch((err) => console.error('[devContentSeed] failed:', err))
