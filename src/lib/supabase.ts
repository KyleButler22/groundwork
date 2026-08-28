import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

/**
 * The single Supabase client for the whole app. Every network call goes
 * through this module — never instantiate a second client, and never call
 * `fetch` against a hardcoded relative path elsewhere in the codebase.
 *
 * Why this matters more than it looks: on the web this origin is whatever
 * domain the app is served from, but inside a Capacitor shell the app's
 * origin is `capacitor://localhost`, so a relative `fetch('/api/...')`
 * silently breaks on-device. Routing everything through one client with an
 * absolute URL from env means the mobile port touches zero call sites.
 *
 * Auth is JWT-based (Supabase default), not cookie-session — cookies behave
 * inconsistently across the capacitor:// origin, so we never introduce one.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  // createClient() throws synchronously on an empty/invalid URL — which
  // means an unconfigured project doesn't just fail queries, it white-
  // screens the entire app at import time, before main.ts even runs.
  // A placeholder URL lets the SDK construct normally; real calls then
  // fail at the network layer (visible, catchable) instead of at boot.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — ' +
      'using a placeholder client. Every Supabase call will fail until you ' +
      'copy .env.example to .env.local with a real project.',
  )
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Detecting an OAuth redirect in the URL only makes sense on the web;
      // on native, the redirect lands on a custom scheme and Capacitor's
      // App plugin hands it back to us instead. Centralizing that handoff
      // here (later) keeps every call site the same on both platforms.
      detectSessionInUrl: true,
    },
  },
)
