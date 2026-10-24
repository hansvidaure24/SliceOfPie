import { test, expect } from '@playwright/test';
import { open, people, items, screen, TACO_NIGHT, expectFocus } from './helpers';

test('even split: the bill shows each share and what comes back to you', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine', 'Jo']);
  await expect(page.locator('#screenQuick')).toHaveClass(/active/);
  await page.fill('#quickTotal', '84.20');
  await expect(page.locator('#quickCtaTotal')).toHaveText('$84.20');
  await page.click('#screenQuick [data-action=quickNext]');

  // $84.20 + 18% tip = $99.36, a third each
  await expect(page.locator('#resultLabel')).toHaveText('You paid $99.36');
  await expect(page.locator('#resultAmt')).toHaveText('$66.24');
  await expect(page.locator('#resultSub')).toHaveText('owed back to you by 2 people · $33.12 each');

  await page.click('[data-tip="20"]');
  await expect(page.locator('#resultLabel')).toHaveText('You paid $101.04');
});

test('by item: unassigned items are caught, shares are right, the bill saves', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine', 'Jo']);
  // Horchata is left without anyone at first
  await items(page, TACO_NIGHT.map(i => i.name === 'Horchata' ? { ...i, who: [] } : i), '3.80');
  await expect(page.locator('#itemsCtaNote')).toHaveText('1 item unassigned');

  await page.click('#screenItems [data-action=itemsNext]');
  const dialog = page.locator('#confirmDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#confirmMsg')).toHaveText('1 item has nobody on it');
  await page.click('#confirmNo');
  await expect(screen(page)).toHaveId('screenItems');
  await expect(page.locator('[data-row="2"]')).toHaveClass(/unassigned/);

  await page.click('[data-assign="2-2"]');
  await expect(page.locator('#itemsCtaNote')).toHaveText('Items + tax');
  await page.click('#screenItems [data-action=itemsNext]');
  await expect(screen(page)).toHaveId('screenSummary');

  // Me 24.75, Carmine 6.75, Jo 7.50 of $39; tax and tip follow the same split
  await expect(page.locator('#resultLabel')).toHaveText('You paid $49.82');
  await expect(page.locator('#resultAmt')).toHaveText('$18.20');
  const rows = page.locator('#breakdownList .owe-row');
  await expect(rows.nth(0)).toContainText('paid the bill');
  await expect(rows.nth(1)).toContainText('$8.62');
  await expect(rows.nth(2)).toContainText('$9.58');
  await expect(page.locator('#pieChartWrap')).toHaveAttribute('aria-label', 'Share of the bill: Me 63%, Carmine 17%, Jo 19%');

  // Someone else paid: the headline is your share
  await page.click('[data-payer="1"]');
  await expect(page.locator('#resultLabel')).toHaveText('Carmine paid $49.82');
  await expect(page.locator('#resultAmt')).toHaveText('$31.62');
  await page.click('[data-payer="me"]');

  await page.click('#saveBillBtn');
  await expectFocus(page, '#confirmInput');
  await page.fill('#confirmInput', 'Taco Tuesday');
  await page.keyboard.press('Enter');
  await expect(page.locator('#saveBillBtn')).toHaveText('Saved!');

  await page.click('#appNewBill');
  await expect(screen(page)).toHaveId('screenWelcome');
  const owed = page.locator('#owedList .owed-card').first();
  await expect(owed).toContainText('Taco Tuesday');
  await expect(owed).toContainText('$18.20');
  await expect(owed).toContainText('1 of 3 paid');

  await owed.click();
  await expect(screen(page)).toHaveId('screenDetail');
  await expect(page.locator('#detailTitle')).toContainText('Taco Tuesday');
  await page.click('[data-toggle-paid$="-1"]');
  await expect(page.locator('[data-toggle-paid$="-1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a discount line comes off the shares it is assigned to', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine']);
  await items(page, [
    { name: 'Burger', price: '20', who: [0] },
    { name: 'Salad', price: '10', who: [1] },
    { name: 'Discount', price: '-6', who: 'all' },
  ]);
  await page.click('#screenItems [data-action=itemsNext]');
  await page.click('[data-tip="15"]');
  // Items 17 / 7 of 24; 15% tip on 24 = 3.60
  await expect(page.locator('#resultLabel')).toHaveText('You paid $27.60');
  await expect(page.locator('#breakdownList .owe-row').nth(1)).toContainText('$8.05');
});

test('rounding up and the post-tax tip are applied to the bill', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine', 'Jo']);
  await page.fill('#quickTotal', '100');
  await page.click('#taxIncToggle');
  await page.fill('#quickTax', '10');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('[data-tip="20"]');
  await page.locator('.more-options summary').click();
  await page.click('#tipPostTax');
  // 100 + 10 tax + 20% of 110 = 132, a third each = 44
  await expect(page.locator('#resultSub')).toContainText('$44.00 each');
  await page.click('#roundToggle');
  await expect(page.locator('#resultSub')).toContainText('$44.00 each');
  await page.click('[data-tip="18"]');
  // 100 + 10 + 19.80 = 129.80 → 43.27 → rounded up to 44
  await expect(page.locator('#resultSub')).toContainText('$44.00 each');
  await expect(page.locator('.more-options summary')).toContainText('Tip on post-tax · rounded up');
});
