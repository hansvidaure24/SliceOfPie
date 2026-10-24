import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;

// End-to-end tests run against the production build (`npm run build` first),
// served by `vite preview` with the same security headers as Vercel
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // Playwright's own Chromium, here and in CI (`npx playwright install chromium`).
    // Headless it runs as the windowless shell, so no test windows show up in Alt+Tab.
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !ci,
  },
});
