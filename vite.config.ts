import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: https://lcnrrn.github.io/cybertruck-order-manager/
// 로컬/다른 호스트에서는 base를 '/'로 바꿔도 됩니다.
export default defineConfig({
  base: '/cybertruck-order-manager/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '사이버트럭 주문 관리',
        short_name: '주문관리',
        description: '3D 프린트 Cybertruck 악세서리 주문 관리 (localStorage · Google Sheets 동기화)',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ko',
        start_url: '/cybertruck-order-manager/',
        scope: '/cybertruck-order-manager/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
