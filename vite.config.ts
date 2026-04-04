import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['eden-logo-v2.png', 'mp-logo-v2.png', 'favicon.ico'],
        manifest: {
          name: 'ÉDEN — De Volta ao Princípio',
          short_name: 'ÉDEN',
          description: 'Plataforma inteligente de estudo bíblico com IA',
          theme_color: '#388e3c',
          background_color: '#f5f1e8',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'eden-logo-v2.png', sizes: '192x192', type: 'image/png' },
            { src: 'eden-logo-v2.png', sizes: '512x512', type: 'image/png' },
            { src: 'eden-logo-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              // Cache de assets estáticos (fontes, imagens)
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              // Cache de CDN do Font Awesome
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-assets',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        }
      })
    ],
    // API Key removida do frontend para evitar vazamento
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
