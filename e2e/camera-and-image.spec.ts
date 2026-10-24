import { test, expect } from '@playwright/test';
import { open, people, screen } from './helpers';

// Chromium's built-in test camera (a moving pattern) stands in for a real one
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

test('the live camera shows the picture, takes a photo and lets go of the camera', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the live camera is for phones and tablets');
  await open(page);
  await people(page, 'item', ['Carmine']);
  await page.click('[data-action=takePhoto]');

  await expect(screen(page)).toHaveId('screenCamera');
  await expect(page.locator('#screenCamera')).toHaveAttribute('data-state', 'live');
  await expect.poll(() => page.evaluate(() => (document.getElementById('cameraVideo') as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await expect(page.locator('#cameraShutter')).toBeEnabled();
  // The hint moves on from "Starting camera…" once frames are being read
  await expect(page.locator('#cameraHint')).not.toHaveText('Starting camera…');
  // Full height, measured from the top
  const box = await page.locator('#screenCamera').boundingBox();
  expect(Math.round(box!.y + box!.height)).toBe(page.viewportSize()!.height);

  await page.click('#cameraShutter');
  await expect(screen(page)).toHaveId('screenCapture');
  await expect(page.locator('#previewImg')).toBeVisible();
  // The camera is released once the photo is taken
  expect(await page.evaluate(() => (document.getElementById('cameraVideo') as HTMLVideoElement).srcObject)).toBeNull();
  // First scan: asked before the scanner downloads
  await expect(page.locator('#confirmMsg')).toHaveText('Download the receipt scanner?');
  await page.click('#confirmNo');
  await expect(screen(page)).toHaveId('screenItems');
});

test('a blocked camera says so and offers the camera app instead', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the live camera is for phones and tablets');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await open(page);
  await people(page, 'item', ['Carmine']);
  await page.click('[data-action=takePhoto]');
  await expect(page.locator('#screenCamera')).toHaveAttribute('data-state', 'blocked');
  await expect(page.locator('#cameraBlockedMsg')).toContainText('Camera access is blocked');
  await expect(page.locator('#cameraShutter')).toBeDisabled();
  await page.click('[data-action=closeCamera]');
  await expect(screen(page)).toHaveId('screenCapture');
});

test('the bill as an image: copied on a computer, shared on a phone', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // On a phone, catch what goes to the share sheet
  await page.addInitScript(() => {
    (window as unknown as { shared: File[] }).shared = [];
    navigator.share = async (data?: ShareData) => { (window as unknown as { shared: File[] }).shared.push(...(data?.files ?? [])); };
    navigator.canShare = () => true;
  });
  await open(page);
  await people(page, 'even', ['Carmine']);
  await page.fill('#quickTotal', '40');
  await page.click('#screenQuick [data-action=quickNext]');
  await page.click('#imageBtn');

  if (info.project.name === 'desktop') {
    await expect(page.locator('#toast')).toHaveText('Image copied. Paste it into any chat.');
    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap(item => item.types));
    expect(types).toContain('image/png');
  } else {
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: File[] }).shared.map(f => f.type + ' ' + f.name))).toEqual(['image/png bill.png']);
    // A real picture, not an empty canvas
    expect(await page.evaluate(() => (window as unknown as { shared: File[] }).shared[0].size)).toBeGreaterThan(5000);
  }
});
