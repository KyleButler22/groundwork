import { createRouter, createWebHistory } from 'vue-router'

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
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
  ],
})
