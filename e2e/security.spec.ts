import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, people, items, TACO_NIGHT } from './helpers';

const headers = JSON.parse(readFileSync('security-headers.json', 'utf8'));

test('the page and the OCR worker are served with their policies', async ({ request }) => {
  const page = await request.get('/');
  expect(page.headers()['content-security-policy']).toBe(headers.page);
  expect(page.headers()['x-content-type-options']).toBe('nosniff');

  // vite preview and Vercel both match the worker by its hashed file name
  const worker = await request.get('/assets/paddle.worker-check.js');
  expect(worker.headers()['content-security-policy']).toBe(headers.ocrWorker);

  const html = await page.text();
  expect(html).not.toMatch(/\son(click|input|change)=/);
  expect(html).toContain('<style>');
});

test('a full split runs without a single policy violation', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', msg => {
    if (/Content Security Policy|Refused to/.test(msg.text())) violations.push(msg.text());
  });
  await open(page);
  await people(page, 'item', ['Carmine', 'Jo']);
  await items(page, TACO_NIGHT, '3.80');
  await page.click('#screenItems [data-action=itemsNext]');
  await page.click('#saveBillBtn');
  await page.click('#confirmYes');
  expect(violations).toEqual([]);
});
