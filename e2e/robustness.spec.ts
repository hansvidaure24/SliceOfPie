import { test, expect } from '@playwright/test';
import { open, people, screen } from './helpers';

test('$100 three ways: the shares add up to what comes back to you', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine', 'Jo']);
  await page.fill('#quickTotal', '100');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.fill('#customTip', '0');

  // You paid, so you carry the leftover cent: $33.34, and the others $33.33 each
  await expect(page.locator('#resultLabel')).toHaveText('You paid $100.00');
  await expect(page.locator('#resultAmt')).toHaveText('$66.66');
  await expect(page.locator('#resultSub')).toHaveText('owed back to you by 2 people · $33.33 each');
  await expect(page.locator('#breakdownList .owe-amt')).toHaveText(['paid the bill', '$33.33', '$33.33']);

  // Carmine paid: they carry the cent, and your share is a plain third
  await page.click('[data-action="setPayer"][data-arg="1"]');
  await expect(page.locator('#resultAmt')).toHaveText('$33.33');
  await expect(page.locator('#breakdownList .owe-amt')).toHaveText(['$33.33', 'paid the bill', '$33.33']);
});

test('starts and splits a bill when the browser blocks site data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // What "block all cookies" does: touching localStorage throws
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: deny });
  });
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '50');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('[data-action="setTip"][data-arg="20"]');
  await expect(page.locator('#resultLabel')).toHaveText('You paid $60.00');
  await expect(page.locator('#resultAmt')).toHaveText('$30.00');
  expect(errors).toEqual([]);
});

test('a change to a saved bill that cannot be stored is put back, and says so', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('#saveBillBtn');
  await page.fill('#confirmInput', 'Lunch');
  await page.keyboard.press('Enter');
  await expect(page.locator('#saveBillBtn')).toHaveText('Saved!');

  await page.click('#appNewBill');
  await page.click('#owedList .owed-card');
  await expect(screen(page)).toHaveId('screenDetail');

  // From here on the database refuses every write, as when the disk is full
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  });
  const carmine = page.locator('[data-action="togglePaid"][data-arg="1"]');
  await carmine.click();
  await expect(page.locator('#toast')).toHaveText('Could not save that change');
  await expect(carmine).toHaveAttribute('aria-pressed', 'false');
});

test('swiping a saved bill left offers to delete it', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('#saveBillBtn');
  await page.fill('#confirmInput', 'Lunch');
  await page.keyboard.press('Enter');
  await page.click('#appNewBill');
  await page.click('[data-tab=screenHistory]');
  await expect(page.locator('.history-card')).toHaveCount(1);

  // A finger moving 150px left across the card
  await page.locator('.history-card').evaluate((card) => {
    const at = (x: number) => [new Touch({ identifier: 1, target: card, clientX: x, clientY: 100 })];
    card.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: at(300) }));
    for (const x of [280, 220, 150]) card.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: at(x) }));
    card.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
  });
  await expect(page.locator('#confirmMsg')).toHaveText('Delete this bill?');
  await page.click('#confirmYes');
  await expect(page.locator('.history-card')).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('Deleted');
});

test('pinch zoom stays on in a browser tab and is off once installed', async ({ page }) => {
  const viewport = () => page.locator('meta[name=viewport]').getAttribute('content');
  await open(page);
  expect(await viewport()).not.toContain('maximum-scale');

  // Launched from the home screen
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      const list = real(q);
      if (!q.includes('display-mode: standalone')) return list;
      return new Proxy(list, {
        get: (target, key) => key === 'matches' ? true : typeof Reflect.get(target, key) === 'function'
          ? Reflect.get(target, key).bind(target)
          : Reflect.get(target, key),
      });
    };
  });
  await page.reload();
  await expect(page.locator('#screenWelcome')).toHaveClass(/active/);
  expect(await viewport()).toContain('maximum-scale=1, user-scalable=no');
});

test('text fields are at least 16px on a touch screen, so iOS does not zoom into them', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'touch screens only');
  await open(page);
  await page.click('[data-tab=screenSettings]');
  const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), select')]
    .map(el => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(5);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
});

test('the tabs end at the bottom of the screen, and the total and tax fields fit their card', async ({ page }) => {
  await open(page);
  const tabs = await page.locator('#tabBar').boundingBox();
  const viewport = page.viewportSize()!;
  // The phone's bottom tabs; on a computer it's the side rail, full height
  expect(Math.round(tabs!.y + tabs!.height)).toBe(viewport.height);

  await people(page, 'even', ['Carmine']);
  await page.click('#taxIncToggle');
  for (const id of ['#quickTotal', '#quickTax']) {
    const field = await page.locator(id).boundingBox();
    const card = await page.locator(id).locator('xpath=ancestor::div[contains(@class,"card")][1]').boundingBox();
    expect(field!.x + field!.width).toBeLessThanOrEqual(card!.x + card!.width - 8);
  }
});

test('saved bills export to a file and import into a fresh browser', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'a computer downloads the file; a phone shares it');
  // Saving the first bill asks the browser to keep the app's data
  await page.addInitScript(() => {
    (window as unknown as { persistAsked: boolean }).persistAsked = false;
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => { (window as unknown as { persistAsked: boolean }).persistAsked = true; return true; };
  });
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('#saveBillBtn');
  await page.fill('#confirmInput', 'Lunch');
  await page.keyboard.press('Enter');
  await expect(page.locator('#saveBillBtn')).toHaveText('Saved!');
  expect(await page.evaluate(() => (window as unknown as { persistAsked: boolean }).persistAsked)).toBe(true);

  await page.click('#appNewBill');
  await page.click('[data-tab=screenSettings]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=exportBills]')]);
  expect(download.suggestedFilename()).toMatch(/^sliceofpie-bills-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();

  // A different browser profile: no bills until the file comes in
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await fresh.newPage();
  await open(other);
  await other.click('[data-tab=screenSettings]');
  await other.locator('#importInput').setInputFiles(file);
  await expect(other.locator('#toast')).toHaveText('Imported 1 bill');
  await other.click('[data-tab=screenHistory]');
  await expect(other.locator('.history-card')).toContainText('Lunch');
  // The same file again adds nothing
  await other.click('[data-tab=screenSettings]');
  await other.locator('#importInput').setInputFiles(file);
  await expect(other.locator('#toast')).toHaveText('Those bills are already here');
  await fresh.close();
});

test('a file that is not an export is turned away', async ({ page }) => {
  await open(page);
  await page.click('[data-tab=screenSettings]');
  await page.locator('#importInput').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#toast')).toHaveText("That file isn't a SliceOfPie export");
});

test('a toast shows just above the tabs', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones have the bottom tabs');
  await open(page);
  await page.click('[data-tab=screenSettings]');
  await page.click('[data-action=exportBills]');
  await expect(page.locator('#toast')).toHaveText('No saved bills to export');
  await page.waitForTimeout(400);
  const toast = await page.locator('#toast').boundingBox();
  const tabs = await page.locator('#tabBar').boundingBox();
  expect(toast!.y + toast!.height).toBeLessThan(tabs!.y);
  expect(tabs!.y - (toast!.y + toast!.height)).toBeLessThan(40);
});

test('Settings shows the build, and tapping it shows the screen sizes', async ({ page }) => {
  await open(page);
  await page.click('[data-tab=screenSettings]');
  await expect(page.locator('#appVersion')).toHaveText(/^SliceOfPie \d+\.\d+\.\d+ \(\w+\)$/);
  await page.click('#appVersion');
  await expect(page.locator('#confirmMsg')).toHaveText(/^SliceOfPie /);
  await expect(page.locator('#confirmSub')).toContainText('At launch: window');
  await expect(page.locator('#confirmSub')).toContainText('100dvh');
  await page.click('#confirmNo');
});

test('the installed iPhone app has a solid status bar, so it opens at full height', async ({ page }) => {
  // black-translucent made iOS open the app 62pt short until it resized it seconds later
  await open(page);
  await expect(page.locator('meta[name=apple-mobile-web-app-status-bar-style]')).toHaveAttribute('content', 'black');
});
