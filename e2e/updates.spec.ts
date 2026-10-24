import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, extname } from 'node:path';
import type { AddressInfo } from 'node:net';
import { open, people, screen, withServiceWorker } from './helpers';

// A real update: the built app, then a new service worker "deployed" under it.
// vite preview keeps each file's size from when it started, so a changed sw.js
// would look unchanged; this small server reads every file fresh instead.

const original = readFileSync('dist/sw.js', 'utf8');
let served = original;
// Each deploy's worker answers 'version' with its name, so the test can tell which one is in charge
const deploy = (name: string) => {
  served = original + `\nself.addEventListener('message',e=>{if(e.data==='version')e.source.postMessage('${name}')});\n`;
};

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
};

let server: Server;
let base = '';
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (path === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' });
      res.end(served);
      return;
    }
    let file = join('dist', path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join('dist', 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  base = 'http://localhost:' + (server.address() as AddressInfo).port;
});
test.afterAll(() => server.close());
test.beforeEach(() => { served = original; });

// The worker in charge: 'first' for the build as shipped, else the deploy's name
const version = (page: Page) => page.evaluate(() => new Promise<string>(resolve => {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return resolve('none');
  navigator.serviceWorker.addEventListener('message', e => resolve(String(e.data)), { once: true });
  worker.postMessage('version');
  setTimeout(() => resolve('first'), 1000);
}));
const checkForUpdate = (page: Page) => page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });

test('on a first visit, a new version on Home takes over with one reload', async ({ page }) => {
  await open(page, base + '/');
  // The first worker claims this page part-way through the visit
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => version(page)).toBe('first');

  deploy('second');
  const reloaded = page.waitForEvent('load');
  await checkForUpdate(page);
  await reloaded;
  await expect(page.locator('#screenWelcome')).toHaveClass(/active/);
  await expect.poll(() => version(page)).toBe('second');
});

test('mid-bill a new version waits for Reload, and the bill survives it', async ({ page }) => {
  await open(page, base + '/');
  await withServiceWorker(page);
  // A later visit: the page opens already under the service worker
  await page.reload();

  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '42');
  deploy('second');
  await checkForUpdate(page);
  await expect(page.locator('#updateToast')).toBeVisible();
  // Nothing swaps in under the bill
  await page.waitForTimeout(1000);
  expect(await version(page)).toBe('first');
  await expect(screen(page)).toHaveId('screenQuick');

  const reloaded = page.waitForEvent('load');
  await page.click('#updateReload');
  await reloaded;
  await expect.poll(() => version(page)).toBe('second');
  await expect(screen(page)).toHaveId('screenQuick');
  await expect(page.locator('#quickTotal')).toHaveValue('42');
});
