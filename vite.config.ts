import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// Imported from 'vitest/config', not 'vite' — that's what merges the `test`
// key's types into UserConfig. Vitest re-exports Vite's own defineConfig
// underneath, so this isn't a second, different config system.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Content (recipes, exercises) is never bundled here — it syncs down
      // from Supabase into IndexedDB at runtime. This precache is app shell only.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Groundwork',
        short_name: 'Groundwork',
        description: 'Personalised calisthenics training and meal plans.',
        theme_color: '#1F6F5C',
        background_color: '#F6F8F7',
        display: 'standalone',
        // Deliberately narrow scope/start_url — keeps this installable as a
        // PWA today and a faithful match for the Capacitor shell later.
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell precached; data goes through the Supabase/Dexie cache
        // layer in src/lib, not the service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/generators/**'],
    },
  },
})
