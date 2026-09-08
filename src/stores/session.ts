import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'

import { claimLocalDataIfNeeded } from '@/lib/claimLocalData'
import { supabase } from '@/lib/supabase'

/**
 * Auth session state. Thin on purpose — it mirrors whatever Supabase Auth
 * already tracks rather than duplicating it, and every other store/view
 * reads `userId` from here instead of calling `supabase.auth.getUser()`
 * itself.
 */
export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(null)
  const isReady = ref(false)

  const authError = ref<string | null>(null)
  const authPending = ref(false)

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    isReady.value = true

    supabase.auth.onAuthStateChange((event, next) => {
      session.value = next
      // Fire-and-forget on purpose — claiming shouldn't hold up the auth
      // state update itself, same "don't block on a best-effort sync"
      // rule every other write path in this app already follows. Only a
      // genuine new sign-in (not the initial "here's your existing
      // session" event on page load, not a token refresh) should ever
      // trigger this; claimLocalDataIfNeeded's own eligibility check
      // (does this account already have real data?) is the real
      // safety net either way, so a spurious extra call here is a wasted
      // no-op query, never a correctness risk.
      if (event === 'SIGNED_IN' && next) {
        claimLocalDataIfNeeded(next.user.id).catch((err) => console.error('[claimLocalData] failed:', err))
      }
    })
  }

  /**
   * Returns 'signed_in' when sign-up produced an active session directly,
   * or 'confirm_email' when the project has email confirmation on (the
   * default for a new Supabase project) — signUp() then succeeds but
   * returns no session until the user clicks the link it emails them.
   * ProfileView branches its post-submit message on which of these came
   * back rather than assuming success always means "logged in now."
   */
  async function signUp(email: string, password: string): Promise<'signed_in' | 'confirm_email' | false> {
    authError.value = null
    authPending.value = true
    try {
      // Without an explicit emailRedirectTo, Supabase falls back to the
      // project's dashboard-configured Site URL — which is easy to leave
      // on its placeholder default (http://localhost:3000) and forget,
      // since nothing local ever exercises the email link to notice. This
      // makes the confirmation link always point back to wherever sign-up
      // actually happened (Amplify, a preview URL, local dev, all of it)
      // instead of depending on one static dashboard setting. Supabase
      // still requires this exact origin to be on the project's Redirect
      // URLs allow-list — an unlisted origin is silently ignored in favor
      // of the broken default, not rejected with an error.
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) {
        authError.value = error.message
        return false
      }
      session.value = data.session
      return data.session ? 'signed_in' : 'confirm_email'
    } catch (err) {
      authError.value = (err as Error).message
      return false
    } finally {
      authPending.value = false
    }
  }

  async function signInWithPassword(email: string, password: string): Promise<boolean> {
    authError.value = null
    authPending.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        authError.value = error.message
        return false
      }
      session.value = data.session
      return true
    } catch (err) {
      authError.value = (err as Error).message
      return false
    } finally {
      authPending.value = false
    }
  }

  async function resetPasswordForEmail(email: string): Promise<boolean> {
    authError.value = null
    authPending.value = true
    try {
      // Same reasoning as signUp's emailRedirectTo above — this call takes
      // its redirect as a sibling `redirectTo` field, not nested under an
      // `options` object the way signUp's is; easy to get wrong by pattern-
      // matching the other call, so worth this note.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) {
        authError.value = error.message
        return false
      }
      return true
    } catch (err) {
      authError.value = (err as Error).message
      return false
    } finally {
      authPending.value = false
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, isReady, authError, authPending, init, signUp, signInWithPassword, resetPasswordForEmail, signOut }
})
