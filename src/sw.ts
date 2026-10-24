/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { OCR_CACHE } from './scan/cache-name';

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
