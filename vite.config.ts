import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'symbol.png'],
      manifest: {
        name: 'UNIDA ONE',
        short_name: 'Unida One',
        description: 'A plataforma da Igreja Unida da Graça para quem serve.',
        lang: 'pt-BR',
        theme_color: '#07110E',
        background_color: '#07110E',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
    }),
  ],
})
