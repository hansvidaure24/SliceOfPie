/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { OCR_CACHE, SHARE_CACHE, SHARED_RECEIPT_URL } from './scan/cache-name';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// OCR models, the ONNX Runtime wasm and the OCR worker chunk (~36 MB) are only
// needed once someone scans, so cache them on first use instead of on install.
// Their URLs are versioned or content-hashed, so cache-first never goes stale.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin
    && (url.pathname.startsWith('/ocr/') || /\/assets\/(paddle\.worker-[\w-]+\.js|ort-wasm[\w.-]+\.wasm)$/.test(url.pathname)),
  new CacheFirst({
    cacheName: OCR_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

// "Share → SliceOfPie" from the photo gallery (Android, desktop Chrome) posts the
// image here. Park it in a cache and open the app, which picks it up and scans it.
registerRoute(
  ({ url }) => url.pathname === '/share-target',
  async ({ request }) => {
    const form = await request.formData();
    const file = form.get('receipt');
    if (file instanceof File && file.type.startsWith('image/')) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARED_RECEIPT_URL, new Response(file, { headers: { 'Content-Type': file.type } }));
    }
    return Response.redirect('/?shared=receipt', 303);
  },
  'POST',
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const stale = (await caches.keys()).filter(k => k.startsWith('ocr-') && k !== OCR_CACHE);
    await Promise.all(stale.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
