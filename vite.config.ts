import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'SliceOfPie',
        short_name: 'SliceOfPie',
        description: 'Everybody gets their slice',
        start_url: '/',
        display: 'standalone',
        background_color: '#24140E',
        theme_color: '#3A2418',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Cached on first scan by a runtime route in sw.ts instead
        globIgnores: ['**/paddle.worker-*.js', 'ocr/**'],
      },
    }),
  ],
})
