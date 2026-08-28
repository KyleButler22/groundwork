import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import BottomNav from './BottomNav.vue'

// Regression test for the manual check done in the browser during scaffolding
// (2026-08-27): 5 tabs, correct hrefs, 44px minimum tap targets. If this ever
// fails, re-check safe-area / tap-target classes in the component directly —
// don't just loosen the assertion.
describe('BottomNav', () => {
  async function mountNav() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:path*', component: { template: '<div/>' } }],
    })
    router.push('/')
    await router.isReady()
    return mount(BottomNav, { global: { plugins: [router] } })
  }

  it('renders exactly the 5 primary tabs with the expected routes', async () => {
    const wrapper = await mountNav()
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(5)
    expect(links.map((l) => l.attributes('href'))).toEqual([
      '/',
      '/workouts',
      '/meals',
      '/grocery',
      '/profile',
    ])
  })

  it('gives every tab a 44px minimum tap target', async () => {
    const wrapper = await mountNav()
    for (const link of wrapper.findAll('a')) {
      expect(link.classes()).toEqual(expect.arrayContaining(['min-h-11', 'min-w-11']))
    }
  })
})
