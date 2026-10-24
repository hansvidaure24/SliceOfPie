import { $ } from './helpers';
import { dialogOpen } from './dialog';
import { renderChrome } from './chrome';
import { saveDraft } from './draft';

// Which screen is showing, the address bar, and the system back gesture.
// Screens hook in with onEnterScreen / onLeaveScreen / setBackRoutes, so this
// module doesn't need to know what's on them.

export const HOME = 'screenWelcome';

// Shown in the address bar, so a reload or a shared link names the screen
const SLUGS: Record<string, string> = {
  screenWelcome: '',
  screenSettings: 'settings',
  screenHistory: 'history',
  screenDetail: 'saved-bill',
  screenPeople: 'people',
  screenQuick: 'total',
  screenCapture: 'scan',
  screenCamera: 'camera',
  screenItems: 'items',
  screenSummary: 'bill',
};

export function screenForSlug(slug: string): string | null {
  return Object.keys(SLUGS).find(id => SLUGS[id] === slug) ?? null;
}

// What Back does on each screen: the app's Back buttons, Escape, and the
// system back gesture all run this
type BackRoute = () => void | Promise<void>;
const backRoutes: Record<string, BackRoute> = {};
export function setBackRoutes(routes: Record<string, BackRoute>): void {
  Object.assign(backRoutes, routes);
}

export function currentScreen(): string {
  return document.querySelector('.screen.active')?.id ?? HOME;
}

// Redraw the top bar without changing screens, e.g. after the split mode
// changes the steps from People/Total/Bill to People/Scan/Items/Bill
export function refreshSteps(): void {
  renderChrome(currentScreen());
}

export async function goBack(): Promise<void> {
  await backRoutes[currentScreen()]?.();
}

// What a screen does as it's shown (fill itself in) and left (e.g. release the camera)
const enterHandlers: Record<string, (() => void)[]> = {};
const leaveHandlers: Record<string, () => void> = {};
export function onEnterScreen(id: string, fn: () => void): void {
  (enterHandlers[id] ??= []).push(fn);
}
export function onLeaveScreen(id: string, fn: () => void): void {
  leaveHandlers[id] = fn;
}

export function goTo(id: string): void {
  const current = document.querySelector('.screen.active') as HTMLElement | null;
  if (current && current.id !== id) {
    document.body.classList.add('navigated');
    leaveHandlers[current.id]?.();
    document.body.classList.add('transitioning');
    current.classList.remove('active');
    current.classList.add('leaving');
    const cleanup = () => {
      current.classList.remove('leaving');
      document.body.classList.remove('transitioning');
    };
    current.addEventListener('animationend', cleanup, { once: true });
    // Safety: if reduced-motion kills the animation, clean up after a frame
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (current.classList.contains('leaving')) cleanup();
    }));
  } else if (current) {
    current.classList.remove('active');
  }

  const target = $(id);
  enterHandlers[id]?.forEach(fn => fn());
  target.classList.add('active');
  window.scrollTo(0, 0);

  // Focus heading for screen readers
  const heading = target.querySelector('h1') as HTMLElement | null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  renderChrome(id);
  syncHistory(id);
  saveDraft(id);
}

// Away from home an extra history entry (our "guard") sits on top, so the
// system back gesture lands in popstate below instead of leaving the app.
// Each guard gets its own id: arriving on ours again means Forward, arriving
// anywhere else means Back.
type GuardState = { guard?: number } | null;
// After a reload the entry we're on may already be a guard; adopt it
let guardId: number | null = (history.state as GuardState)?.guard ?? null;
let droppingGuard = false;

// Start-up landed on home: turn the entry we're on back into a plain one
export function settleHomeLocation(): void {
  renderChrome(HOME);
  guardId = null;
  history.replaceState(null, '', location.pathname + location.search);
}

function syncHistory(id: string): void {
  const url = location.pathname + location.search + (SLUGS[id] ? '#' + SLUGS[id] : '');
  if (id === HOME) {
    if (guardId !== null) {
      guardId = null;
      droppingGuard = true;
      history.back();
    } else {
      history.replaceState(null, '', url);
    }
  } else if (guardId !== null) {
    history.replaceState({ guard: guardId }, '', url);
  } else {
    guardId = Date.now();
    history.pushState({ guard: guardId }, '', url);
  }
}

window.addEventListener('popstate', async (e) => {
  if (droppingGuard) {
    droppingGuard = false;
    history.replaceState(null, '', location.pathname + location.search);
    // A goTo may have run while the back was in flight
    if (currentScreen() !== HOME) syncHistory(currentScreen());
    return;
  }
  const arrived = (e.state as GuardState)?.guard;
  // Browser Forward re-entered our guard entry; nothing to do
  if (arrived !== undefined && arrived === guardId) return;
  guardId = null;
  if (dialogOpen()) $('confirmNo').click();
  else await goBack();
  // Back may have been cancelled (e.g. keeping an unsaved bill)
  if (currentScreen() !== HOME) syncHistory(currentScreen());
});
