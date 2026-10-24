import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stand-ins for the plugin's registerSW, the router and the page
const sw = vi.hoisted(() => ({
  options: null as null | { onNeedRefresh?: () => void; onRegisteredSW?: (url: string, r?: { update: () => Promise<void> }) => void },
  updateSW: vi.fn(async (_reload?: boolean) => {}),
}));
const router = vi.hoisted(() => ({ screen: 'screenWelcome', enter: {} as Record<string, (() => void)[]> }));
const page = vi.hoisted(() => ({ toast: { hidden: true }, reloadClick: null as null | (() => void), visibility: null as null | (() => void), hidden: false }));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: typeof sw.options) => { sw.options = opts; return sw.updateSW; },
}));
vi.mock('../src/router', () => ({
  currentScreen: () => router.screen,
  onEnterScreen: (id: string, fn: () => void) => { (router.enter[id] ??= []).push(fn); },
}));
vi.mock('../src/helpers', () => ({
  $: (id: string) => id === 'updateToast'
    ? page.toast
    : { addEventListener: (_: string, fn: () => void) => { page.reloadClick = fn; } },
}));
vi.stubGlobal('document', {
  get hidden() { return page.hidden; },
  addEventListener: (type: string, fn: () => void) => { if (type === 'visibilitychange') page.visibility = fn; },
});

const { initUpdates } = await import('../src/update');

beforeEach(() => {
  sw.updateSW.mockClear();
  page.toast.hidden = true;
  router.screen = 'screenWelcome';
  for (const k of Object.keys(router.enter)) delete router.enter[k];
  initUpdates();
});

describe('applying a new version', () => {
  it('applies it straight away when no bill is in progress', () => {
    router.screen = 'screenHistory';
    sw.options!.onNeedRefresh!();
    expect(sw.updateSW).toHaveBeenCalledWith(true);
    expect(page.toast.hidden).toBe(true);
  });

  it('only offers it in the middle of a bill', () => {
    router.screen = 'screenItems';
    sw.options!.onNeedRefresh!();
    expect(sw.updateSW).not.toHaveBeenCalled();
    expect(page.toast.hidden).toBe(false);
  });

  it('applies it when Reload is tapped', () => {
    router.screen = 'screenSummary';
    sw.options!.onNeedRefresh!();
    page.reloadClick!();
    expect(sw.updateSW).toHaveBeenCalledWith(true);
  });

  it('applies a held-back update once the user is back on Home', () => {
    router.screen = 'screenCamera';
    sw.options!.onNeedRefresh!();
    expect(sw.updateSW).not.toHaveBeenCalled();
    router.enter.screenWelcome.forEach(fn => fn());
    expect(sw.updateSW).toHaveBeenCalledWith(true);
  });

  it('does nothing on Home when there is no update', () => {
    router.enter.screenWelcome.forEach(fn => fn());
    expect(sw.updateSW).not.toHaveBeenCalled();
  });
});

describe('checking for a new version', () => {
  it('checks again when the app comes back, at most once a minute', () => {
    vi.useFakeTimers();
    const update = vi.fn(async () => {});
    sw.options!.onRegisteredSW!('/sw.js', { update });
    page.hidden = false;
    page.visibility!();
    expect(update).not.toHaveBeenCalled();          // just registered
    vi.advanceTimersByTime(61_000);
    page.visibility!();
    expect(update).toHaveBeenCalledTimes(1);
    page.visibility!();
    expect(update).toHaveBeenCalledTimes(1);        // throttled
    page.hidden = true;
    vi.advanceTimersByTime(61_000);
    page.visibility!();
    expect(update).toHaveBeenCalledTimes(1);        // going to the background doesn't check
    vi.useRealTimers();
  });
});
