import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// 배포마다 바뀌는 빌드 id (시간순 비교 가능) — 옛 버전 앱 감지용
const BUILD_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const versionFile = {
  name: 'version-file',
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
};

// GitHub Pages: https://lcnrrn.github.io/cybertruck-order-manager/
// 로컬/다른 호스트에서는 base를 '/'로 바꿔도 됩니다.
export default defineConfig({
  base: '/cybertruck-order-manager/',
  // 구매자용 주문·조회 페이지 (order.html, lookup.html) — 주문 관리 앱과 별개 화면
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), order: resolve(__dirname, 'order.html'), lookup: resolve(__dirname, 'lookup.html') } } },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    versionFile,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // index.html 은 미리 저장(precache)하지 않음 → 옛 화면이 캐시에서 뜨는 일 없음
        globPatterns: ['**/*.{js,css,png,svg,ico,webmanifest}'],
        navigateFallback: null,
        runtimeCaching: [
          // 화면(HTML): 항상 네트워크 먼저, 오프라인일 때만 저장본
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst', options: { cacheName: 'html', networkTimeoutSeconds: 5 } },
          // 버전 파일: 절대 캐시 안 씀
          { urlPattern: /version\.json/, handler: 'NetworkOnly' },
        ],
      },
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
