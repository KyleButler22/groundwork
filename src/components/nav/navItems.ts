import { ChefHat, House, ShoppingCart, User, Dumbbell } from '@lucide/vue'
import type { Component } from 'vue'

/**
 * The app's 5 top-level destinations — one source of truth for both
 * BottomNav.vue (mobile, below `lg`) and SidebarNav.vue (desktop, `lg`
 * and up), so the two never drift out of sync with each other.
 */
export interface NavItem {
  to: string
  label: string
  icon: Component
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: House },
  { to: '/workouts', label: 'Train', icon: Dumbbell },
  { to: '/meals', label: 'Meals', icon: ChefHat },
  { to: '/grocery', label: 'Grocery', icon: ShoppingCart },
  { to: '/profile', label: 'Profile', icon: User },
]
