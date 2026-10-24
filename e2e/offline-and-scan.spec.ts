import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { open, people, screen, withServiceWorker, syntheticReceipt } from './helpers';

const RECEIPT = ['Burger        12.50', 'Fries          4.00', 'Subtotal      16.50', 'Tax            1.32', 'Total         17.82'];

test('after one visit the app works with no network, fonts included', async ({ page, context }) => {
  await open(page);
  await withServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#screenWelcome')).toHaveClass(/active/);
  expect(await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).sort();
  })).toEqual(['Fraunces', 'Inter']);

  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '50');
  await page.click('#screenQuick [data-action=quickNext]');
  await expect(page.locator('#resultLabel')).toHaveText('You paid $59.00');
});

test('scanning asks before the download, reads the receipt, then works offline', async ({ page, context }) => {
  test.slow();
  await open(page);
  await withServiceWorker(page);
  await people(page, 'item', ['Carmine']);
  await expect(page.locator('#captureScannerNote')).toContainText('first scan downloads');

  const png = await syntheticReceipt(page, RECEIPT);
  await page.setInputFiles('#photoInput', { name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#confirmMsg')).toHaveText('Download the receipt scanner?');
  await page.click('#confirmYes');
  await expect(screen(page)).toHaveId('screenItems', { timeout: 90_000 });
  await expect(page.locator('[data-item-name="0"]')).toHaveValue(/burger/i);
  await expect(page.locator('[data-item-price="1"]')).toHaveValue('4');
  await expect(page.locator('#receiptCheck')).toHaveText('Matches the receipt total of $17.82');

  // Same scan with the network off: no prompt, still read
  await context.setOffline(true);
  await page.goBack();
  await expect(screen(page)).toHaveId('screenCapture');
  await expect(page.locator('#captureScannerNote')).toHaveText('Scanner ready offline');
  await page.setInputFiles('#photoInput', { name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect(screen(page)).toHaveId('screenItems', { timeout: 60_000 });
  await expect(page.locator('#receiptCheck')).toHaveText('Matches the receipt total of $17.82');
});

// Real receipt photos stay out of git; run these when they're on this machine
const PHOTO = 'test/fixtures/receipts/photos/aroma-cafe.jpg';
test('reads a real receipt photo', async ({ page }) => {
  test.skip(!existsSync(PHOTO), 'receipt photos are not in the repo');
  test.slow();
  await open(page);
  await people(page, 'item', ['Carmine']);
  await page.setInputFiles('#photoInput', { name: 'aroma.jpg', mimeType: 'image/jpeg', buffer: readFileSync(PHOTO) });
  await page.click('#confirmYes');
  await expect(screen(page)).toHaveId('screenItems', { timeout: 90_000 });
  for (const [i, name] of ['Americano', 'Almond Scone', '16oz Bottle Water'].entries()) {
    await expect(page.locator(`[data-item-name="${i}"]`)).toHaveValue(name);
  }
  await expect(page.locator('#receiptCheck')).toHaveText('Matches the receipt total of $8.70');
});

test('a photo shared from another app opens straight into scanning', async ({ page }) => {
  await open(page);
  await withServiceWorker(page);
  const png = await syntheticReceipt(page, RECEIPT);
  const status = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const form = new FormData();
    form.append('receipt', new File([bytes], 'receipt.png', { type: 'image/png' }));
    const res = await fetch('/share-target', { method: 'POST', body: form });
    return [res.redirected, new URL(res.url).search];
  }, png.toString('base64'));
  expect(status).toEqual([true, '?shared=receipt']);

  await page.goto('/?shared=receipt');
  await expect(screen(page)).toHaveId('screenCapture');
  await expect(page.locator('#toast')).toHaveText('Scanning the shared photo');
  await expect(page.locator('#previewImg')).toBeVisible();
  await expect(page).not.toHaveURL(/shared=/);
});
