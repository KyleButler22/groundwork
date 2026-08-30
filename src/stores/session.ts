import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'

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

    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next
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
      const { data, error } = await supabase.auth.signUp({ email, password })
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
      const { error } = await supabase.auth.resetPasswordForEmail(email)
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
