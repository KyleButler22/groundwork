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

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    isReady.value = true

    supabase.auth.onAuthStateChange((_event, next) => {
      session.value = next
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
  }

  return { session, isReady, init, signOut }
})
