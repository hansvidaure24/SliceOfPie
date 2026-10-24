/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import headers from './security-headers.json'

// `vite preview` sends the same security headers as vercel.json, so the
// production build is tested under the policy it ships with
const OCR_WORKER = /^\/assets\/paddle\.worker-/
// The stylesheet goes inline in index.html, so the first paint doesn't wait
// on a second request (Lighthouse counted ~150 ms on a phone)
type BundleFile = { type: 'asset' | 'chunk'; source?: string | Uint8Array }
const inlineCss = {
  name: 'inline-css',
  apply: 'build' as const,
  enforce: 'post' as const,
  generateBundle(_: unknown, bundle: Record<string, BundleFile>) {
    const html = bundle['index.html']
    if (!html || typeof html.source !== 'string') return
    for (const [name, file] of Object.entries(bundle)) {
      if (!name.endsWith('.css') || file.type !== 'asset') continue
      const href = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const link = new RegExp(`<link rel="stylesheet"[^>]*href="/${href}"[^>]*>`)
      if (!link.test(html.source)) continue
      const css = typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)
      html.source = html.source.replace(link, () => `<style>${css}</style>`)
      delete bundle[name]
    }
  },
}

const securityHeaders = {
  name: 'security-headers',
  configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      for (const [key, value] of Object.entries(headers.common)) res.setHeader(key, value)
      res.setHeader('Content-Security-Policy', OCR_WORKER.test(req.url ?? '') ? headers.ocrWorker : headers.page)
      next()
    })
  },
}

export default defineConfig({
  // Unit tests only; the Playwright suite in e2e/ runs separately
  test: { include: ['test/**/*.test.ts'] },
  resolve: {
    // PaddleOCR imports the default ONNX Runtime build, which pulls in the
    // WebGPU variant and its 25 MB wasm. The wasm-only build needs 12 MB.
    alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }],
  },
  worker: {
    format: 'es',
    plugins: () => [{
      // PaddleOCR references its own prebuilt 11 MB worker for `worker: true`.
      // We run it in our own worker, so keep that file out of the build.
      name: 'drop-paddleocr-prebuilt-worker',
      transform(code, id) {
        if (!id.includes('@paddleocr/paddleocr-js/dist/index.mjs')) return;
        return code.replace(/new URL\("\.\/assets\/worker-entry-[\w-]+\.js", import\.meta\.url\)/, '"data:,"');
      },
    }],
  },
  optimizeDeps: {
    // Pre-bundle up front so the first scan in dev doesn't trigger a reload
    include: ['@paddleocr/paddleocr-js', '@techstark/opencv-js'],
    // Pre-bundling moves ONNX Runtime into .vite/deps, which breaks the
    // relative URL it uses to find its wasm in dev
    exclude: ['onnxruntime-web'],
  },
  plugins: [
    securityHeaders,
    inlineCss,
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        id: '/',
        name: 'SliceOfPie',
        short_name: 'SliceOfPie',
        description: 'Split bills without the awkward math. Scan a receipt, assign items, add tip, and share who owes what, offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        categories: ['finance', 'utilities'],
        // Reopening the app (or a shortcut) reuses its window instead of opening another
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        background_color: '#24140E',
        theme_color: '#3A2418',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Scan a receipt', short_name: 'Scan', description: 'Split a bill by item', url: '/?start=scan', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Enter the total', short_name: 'Total', description: 'Split a bill evenly', url: '/?start=total', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Who owes me', short_name: 'History', description: 'Saved bills and who has paid', url: '/#history', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // Shown in the richer install dialog on Android and desktop Chrome
        screenshots: [
          { src: '/screenshots/phone-items.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Assign each item to the people who had it' },
          { src: '/screenshots/phone-bill.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'See who owes you what' },
          { src: '/screenshots/desktop-items.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Split by item with a live summary' },
        ],
        // Share a receipt photo from the gallery straight into a new split
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'receipt', accept: ['image/*'] }] },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Cached on first scan by a runtime route in sw.ts instead
        globIgnores: ['**/paddle.worker-*.js', 'ocr/**', 'screenshots/**'],
      },
    }),
  ],
})
