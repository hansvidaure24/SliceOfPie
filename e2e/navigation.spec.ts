import { test, expect } from '@playwright/test';
import { open, people, items, screen, TACO_NIGHT, expectFocus } from './helpers';

test('system back walks back one step at a time', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine']);
  await items(page, [{ name: 'Tacos', price: '12', who: [0] }]);
  await expect(page).toHaveURL(/#items$/);

  await page.goBack();
  await expect(screen(page)).toHaveId('screenCapture');
  await page.goBack();
  await expect(screen(page)).toHaveId('screenPeople');
  await page.goBack();
  await expect(screen(page)).toHaveId('screenWelcome');
});

test('back from an unsaved bill asks first; Escape keeps the bill', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await expect(screen(page)).toHaveId('screenSummary');

  await page.click('#appBack');
  const dialog = page.locator('#confirmDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'alertdialog');
  await expectFocus(page, '#confirmNo');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(screen(page)).toHaveId('screenSummary');

  await page.goBack();
  await expect(dialog).toBeVisible();
  await page.click('#confirmYes');
  await expect(screen(page)).toHaveId('screenQuick');
});

test('a reload picks up the bill on the same screen', async ({ page }) => {
  await open(page);
  await people(page, 'item', ['Carmine', 'Jo']);
  await items(page, TACO_NIGHT.slice(0, 2), '1.50');

  await page.reload();
  await expect(screen(page)).toHaveId('screenItems');
  await expect(page.locator('#toast')).toHaveText('Picked up where you left off');
  await expect(page.locator('[data-item-name="1"]')).toHaveValue('Elote');
  await expect(page.locator('#taxInput')).toHaveValue('1.5');
  await expect(page.locator('[data-assign="1-1"]')).toHaveAttribute('aria-pressed', 'true');

  // ...and back still works after the reload
  await page.goBack();
  await expect(screen(page)).toHaveId('screenCapture');
});

test('Add again and Last group bring back people from saved bills', async ({ page }) => {
  await open(page);
  await people(page, 'even', ['Carmine', 'Jo']);
  await page.fill('#quickTotal', '30');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('#saveBillBtn');
  await page.click('#confirmYes');
  await page.click('#appNewBill');

  await page.click('[data-action=startSplit][data-arg=item]');
  // A fresh bill starts with Me and Person 1; "Add again" offers the saved names
  await expect(page.locator('[data-action="addRecentName"]')).toHaveText(['Carmine', 'Jo']);
  await page.click('[data-action="addRecentName"][data-arg="Jo"]');
  await expect(page.locator('[data-person="1"]')).toHaveValue('Jo');

  await page.click('[data-action="loadLastGroup"]');
  await expect(page.locator('#peopleCount')).toHaveText('3');
  await expect(page.locator('[data-person="1"]')).toHaveValue('Carmine');
  await expect(page.locator('[data-person="2"]')).toHaveValue('Jo');
  await expect(page.locator('#btnMinus')).toBeEnabled();
});

test('the step bar names the steps of the kind of split', async ({ page }) => {
  await open(page);
  await page.click('[data-action=startSplit][data-arg=even]');
  await expect(page.locator('#appSteps li')).toHaveText(['People', 'Total', 'Bill']);
  await page.click('#modeItem');
  await expect(page.locator('#appSteps li')).toHaveText(['People', 'Scan', 'Items', 'Bill']);
  await expect(page.locator('#appSteps li[aria-current]')).toHaveText('People');
});
