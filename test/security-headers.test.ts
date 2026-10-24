import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// vercel.json can't import JSON, so its copy of the policies is checked here
const headers = JSON.parse(readFileSync('security-headers.json', 'utf8'));
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const valueFor = (source: string, key: string) =>
  vercel.headers.find(h => h.source === source)?.headers.find(h => h.key === key)?.value;

describe('security headers', () => {
  it('ship the same page policy on Vercel as in local preview', () => {
    expect(valueFor(String.raw`/((?!assets/paddle\.worker-).*)`, 'Content-Security-Policy')).toBe(headers.page);
  });

  it('ship the same OCR worker policy on Vercel as in local preview', () => {
    expect(valueFor('/assets/paddle.worker-(.*)', 'Content-Security-Policy')).toBe(headers.ocrWorker);
  });

  it('ship the same common headers on Vercel as in local preview', () => {
    for (const [key, value] of Object.entries(headers.common)) {
      expect(valueFor('/(.*)', key)).toBe(value);
    }
  });

  it('keep the page itself free of eval', () => {
    expect(headers.page).not.toContain("'unsafe-eval'");
    expect(headers.page).toContain("object-src 'none'");
  });
});
