import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path for GitHub Pages: https://<username>.github.io/<repository>/
// Set VITE_BASE_PATH="/<repository>/" when building for a project page.
// Left as "/" for local dev and for a user/organization root page (<username>.github.io).
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Ganesh Navarathri Manager',
        short_name: 'GN Manager',
        description: 'Donation & expense management for Ganesh Navarathri celebrations',
        theme_color: '#ea580c',
        background_color: '#fff7ed',
        display: 'standalone',
        start_url: basePath,
        scope: basePath,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Data lives in IndexedDB, not the cache — this only caches the app shell so it boots offline.
        navigateFallbackDenylist: [/^\/oauth2/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    // No test currently renders a component (only pure logic + a fake IndexedDB), so the
    // lighter 'node' environment is used deliberately — it avoids a jsdom dependency, which
    // pulls in Node-18-only internals incompatible with this project's Node 16 baseline.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
