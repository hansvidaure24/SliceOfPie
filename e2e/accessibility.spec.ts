import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, people, items, TACO_NIGHT, expectFocus } from './helpers';

async function noViolations(page: Page, label: string): Promise<void> {
  // Let entrance animations finish so colors are measured at rest
  await page.waitForTimeout(500);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map(v => `${label}: ${v.id} (${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

for (const colorScheme of ['dark', 'light'] as const) {
  test(`every screen passes axe in ${colorScheme} mode`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme });
    await open(page);
    await noViolations(page, 'home');

    await people(page, 'item', ['Carmine', 'Jo']);
    await noViolations(page, 'scan');
    await items(page, TACO_NIGHT, '3.80');
    await noViolations(page, 'items');
    await page.click('#screenItems [data-action=itemsNext]');
    await noViolations(page, 'bill');
    await page.locator('.more-options summary').click();
    await noViolations(page, 'bill, options open');

    await page.click('#saveBillBtn');
    await noViolations(page, 'name sheet');
    await page.click('#confirmYes');

    await page.click('#appNewBill');
    await noViolations(page, 'home with unpaid bills');
    await page.click('[data-tab=screenHistory]');
    await noViolations(page, 'history');
    await page.click('[data-bill] .history-open');
    await noViolations(page, 'saved bill');
    // On a phone the saved bill has a back button instead of tabs
    if (!(await page.locator('[data-tab=screenSettings]').isVisible())) await page.goBack();
    await page.click('[data-tab=screenSettings]');
    await noViolations(page, 'settings');

    await page.click('[data-tab=screenWelcome]');
    await people(page, 'even', ['Carmine']);
    await page.fill('#quickTotal', '20');
    await noViolations(page, 'total');
  });
}

test('screen readers hear the step, the headline and the pie as text', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine', 'Jo']);
  await expect(page.locator('#announcer')).toHaveText('Step 2 of 4: Scan');
  await items(page, TACO_NIGHT, '3.80');
  await expect(page.locator('#itemsCtaNote')).toHaveAttribute('aria-live', 'polite');
  await page.click('#screenItems [data-action=itemsNext]');
  await expect(page.locator('#announcer')).toHaveText('Step 4 of 4: Bill');
  await expect(page.locator('.result-head')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#pieChartWrap')).toHaveAttribute('role', 'img');
});

test('person chips are toggle buttons that keep focus when pressed', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine']);
  await items(page, [{ name: 'Tacos', price: '12', who: [] }]);
  const chip = page.locator('[data-assign="0-1"]');
  await chip.focus();
  await page.keyboard.press('Space');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expectFocus(page, '[data-assign="0-1"]');
});

test('nothing runs off its card with text at 200%', async ({ page }) => {
  await open(page);
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  const overflow = () => page.evaluate(() => {
    const out: string[] = [];
    for (const box of document.querySelectorAll('.screen.active .card, .app-bar, .cta-bar')) {
      const r = box.getBoundingClientRect();
      if (!r.width) continue;
      for (const el of box.querySelectorAll('*')) {
        const e = el.getBoundingClientRect();
        if (e.width && getComputedStyle(el).visibility !== 'hidden' && (e.right > r.right + 1 || e.left < r.left - 1)) out.push(el.className || el.tagName);
      }
    }
    return out;
  });
  expect(await overflow()).toEqual([]);
  await page.click('[data-tab=screenSettings]');
  expect(await overflow()).toEqual([]);
  await page.click('[data-tab=screenWelcome]');
  await people(page, 'item', ['Carmine', 'Jo']);
  await items(page, TACO_NIGHT, '3.80');
  expect(await overflow()).toEqual([]);
  await page.click('#screenItems [data-action=itemsNext]');
  expect(await overflow()).toEqual([]);
});
