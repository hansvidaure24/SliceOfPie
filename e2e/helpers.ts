import { expect, type Page } from '@playwright/test';

export const screen = (page: Page) => page.locator('.screen.active');

// The page's own focus, which doesn't depend on which test window the OS has in front
export async function expectFocus(page: Page, selector: string): Promise<void> {
  await expect.poll(() => page.evaluate(sel => document.activeElement === document.querySelector(sel), selector)).toBe(true);
}

export async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#screenWelcome')).toHaveClass(/active/);
}

// Waits until the service worker controls the page, so offline and the share target work
export async function withServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
}

export async function people(page: Page, mode: 'item' | 'even', others: string[]): Promise<void> {
  await page.click(`[data-action=startSplit][data-arg=${mode}]`);
  await expect(page.locator('#screenPeople')).toHaveClass(/active/);
  for (let i = 1; i < others.length; i++) await page.click('#btnPlus');
  for (const [i, name] of others.entries()) await page.fill(`[data-person="${i + 1}"]`, name);
  await page.click('#screenPeople [data-action=goToNextFromPeople]');
}

export interface ItemSpec { name: string; price: string; who: number[] | 'all' }

// From the scan screen: type the items in by hand and put people on them
export async function items(page: Page, list: ItemSpec[], tax?: string): Promise<void> {
  await page.click('[data-action=skipToManual]');
  await expect(page.locator('#screenItems')).toHaveClass(/active/);
  for (const [i, item] of list.entries()) {
    if (i > 0) await page.click('#screenItems [data-action=addItem]');
    await page.fill(`[data-item-name="${i}"]`, item.name);
    await page.fill(`[data-item-price="${i}"]`, item.price);
    if (item.who === 'all') await page.click(`[data-assign-all="${i}"]`);
    else for (const p of item.who) await page.click(`[data-assign="${i}-${p}"]`);
  }
  if (tax) await page.fill('#taxInput', tax);
}

// A bill with known answers: $39 of items, $3.80 tax, 18% tip on $39 → $49.82
export const TACO_NIGHT: ItemSpec[] = [
  { name: 'Carnitas tacos', price: '18', who: [0] },
  { name: 'Elote', price: '7.50', who: [0, 1] },
  { name: 'Horchata', price: '4.50', who: [2] },
  { name: 'Chips & guac', price: '9', who: 'all' },
];

// Draws a plain printed receipt in the page and returns it as a PNG
export async function syntheticReceipt(page: Page, lines: string[]): Promise<Buffer> {
  const b64 = await page.evaluate(async (text) => {
    const font = 36;
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    g.font = `${font}px "Courier New", monospace`;
    const width = Math.ceil(Math.max(...text.map(l => g.measureText(l).width))) + font * 2;
    canvas.width = width;
    canvas.height = text.length * Math.round(font * 1.4) + font * 2;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#111';
    g.font = `${font}px "Courier New", monospace`;
    g.textBaseline = 'top';
    text.forEach((l, i) => g.fillText(l, font, font + i * Math.round(font * 1.4)));
    return canvas.toDataURL('image/png').split(',')[1];
  }, lines);
  return Buffer.from(b64, 'base64');
}
