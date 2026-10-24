import { test, expect } from '@playwright/test';
import { open, people, items, screen, syntheticReceipt, TACO_NIGHT, expectFocus } from './helpers';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout only');
});

test('the rail, the person grid and the live summary', async ({ page }) => {
  await open(page);
  await expect(page.locator('.rail-logo')).toBeVisible();
  await people(page, 'item', ['Carmine', 'Jo']);
  await items(page, TACO_NIGHT, '3.80');

  await expect(page.locator('.items-head')).toBeVisible();
  await expect(page.locator('#liveSummary')).toBeVisible();
  await expect(page.locator('#liveTotals')).toContainText('$49.82');
  await expect(page.locator('#livePeople .owe-row').nth(2)).toContainText('$9.58');

  // Alt+number toggles a person on the item being edited
  await page.click('[data-item-name="0"]');
  await page.keyboard.press('Alt+3');
  await expect(page.locator('[data-assign="0-2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#liveNote')).toHaveText('');
});

test('Enter moves name → price → next item, adding one at the end', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine']);
  await page.click('[data-action=skipToManual]');
  await page.fill('[data-item-name="0"]', 'Soup');
  await page.keyboard.press('Enter');
  await expectFocus(page, '[data-item-price="0"]');
  await page.keyboard.type('6');
  await page.keyboard.press('Enter');
  await expectFocus(page, '[data-item-name="1"]');
});

test('dropping or pasting a receipt photo starts a scan', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine']);
  await expect(screen(page)).toHaveId('screenQuick');
  const png = await syntheticReceipt(page, ['Total 12.00']);

  const shown = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'r.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    const overlay = document.getElementById('dropOverlay')!.classList.contains('show');
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
    return overlay;
  }, png.toString('base64'));
  expect(shown).toBe(true);
  await expect(screen(page)).toHaveId('screenCapture');
  await expect(page.locator('#previewImg')).toBeVisible();
});

test('Copy puts the bill on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await expect(page.locator('#shareBtn')).toHaveText('Copy');
  await page.click('#shareBtn');
  await expect(page.locator('#toast')).toHaveText('Copied. Paste it into any chat.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Total: $47.20');
  expect(text).toContain('Carmine owes: $23.60');
});

test('a saved bill opens with the list of bills beside it', async ({ page }) => {
  await open(page);
  for (const total of ['30', '45']) {
    await people(page, 'even', ['Carmine']);
    await page.fill('#quickTotal', total);
    await page.click('#screenQuick [data-action=quickNext]');
    await page.click('#saveBillBtn');
    await page.click('#confirmYes');
    await page.click('#appNewBill');
  }
  await page.click('[data-tab=screenHistory]');
  await page.locator('.history-card .history-open').first().click();
  await expect(page.locator('#billsPane')).toBeVisible();
  await expect(page.locator('.pane-bill')).toHaveCount(2);
  await expect(page.locator('.pane-bill.current')).toHaveAttribute('aria-current', 'true');
  await page.locator('.pane-bill:not(.current)').click();
  await expect(page.locator('#detailSummaryCard')).toContainText('$35.40');
});
