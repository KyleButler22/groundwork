import { createRouter, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Renders without App.vue's SidebarNav/BottomNav/content shell — for
     *  a self-contained flow (see the /intake route's own comment) that
     *  builds its own full-screen layout rather than sitting inside the
     *  standard app frame. */
    fullscreen?: boolean
  }
}

/**
 * SPA history mode only — no server-side rendering, ever. See AGENTS.md:
 * this is the constraint that keeps the Capacitor port a packaging step
 * instead of a rewrite. `import.meta.env.BASE_URL` keeps this correct
 * whether the app is served from `/` (web/PWA) or a Capacitor asset root.
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/intake',
      name: 'intake',
      component: () => import('@/views/IntakeView.vue'),
      // A focused, linear wizard, not "another page in the app" — it
      // already builds its own header (IntakeProgress) and footer
      // (Back/Next) and handles its own safe-area insets independently
      // (pt-safe/pb-safe on those, not inherited from App.vue), which
      // only makes sense standalone. Nested inside the normal shell,
      // its own `mx-auto max-w-2xl` centering was fighting App.vue's
      // sidebar + max-w-4xl content wrapper instead of the actual
      // viewport — correct math, wrong frame of reference, which is
      // exactly what read as "not centered" (see App.vue's own note).
      meta: { fullscreen: true },
    },
    {
      path: '/workouts',
      name: 'workouts',
      component: () => import('@/views/WorkoutsView.vue'),
    },
    {
      path: '/meals',
      name: 'meals',
      component: () => import('@/views/MealsView.vue'),
    },
    {
      path: '/grocery',
      name: 'grocery',
      component: () => import('@/views/GroceryView.vue'),
    },
    {
      path: '/recipes/:recipeId',
      name: 'recipe',
      component: () => import('@/views/RecipeView.vue'),
    },
    {
      path: '/exercises/:exerciseId',
      name: 'exercise',
      component: () => import('@/views/ExerciseView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
  ],
})
