import { $ } from './helpers';
import { confirmDialog } from './dialog';
import { copyText } from './share';

// An iPhone Home Screen app that draws under the status bar opens with the
// page laid out one status bar short of the screen, and stays that way until
// the first scroll makes iOS measure again (bottom bars float above the bottom
// edge). Scrolling a pixel and back does what that first scroll does. Recorded
// on an iPhone, a single nudge once the page had loaded fixed it 2-4 s after
// opening, and not always all the way, so it nudges at once and a few more
// times while the app settles.

const installedOnIos = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;

interface Sizes { window: string; visible: string; dvh: number; safeTop: number; safeBottom: number }
let atLaunch: Sizes | null = null;
const opened = performance.now();
// The window height after each nudge, to see when iOS put it right
const heights: string[] = [];

function measure(): Sizes {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const sizes = {
    window: innerWidth + '×' + innerHeight,
    visible: visualViewport ? Math.round(visualViewport.width) + '×' + Math.round(visualViewport.height) : '?',
    dvh: Math.round(parseFloat(style.height)),
    safeTop: Math.round(parseFloat(style.paddingTop)),
    safeBottom: Math.round(parseFloat(style.paddingBottom)),
  };
  probe.remove();
  return sizes;
}

let nudging = false;
function nudge(): void {
  // One at a time, or the second would take the first one's height for the real one
  if (nudging) return;
  nudging = true;
  const root = document.documentElement;
  const before = root.style.minHeight;
  // Something to scroll, even on a screen that fits
  root.style.minHeight = 'calc(100% + 2px)';
  scrollBy(0, 1);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollBy(0, -1);
    root.style.minHeight = before;
    nudging = false;
    if (heights.length < 12) heights.push(`${((performance.now() - opened) / 1000).toFixed(1)}s ${innerHeight}`);
  }));
}

// Now, then again while the launch animation and the first render finish
function settleSoon(): void {
  requestAnimationFrame(nudge);
  for (const ms of [600, 1500, 3000]) setTimeout(nudge, ms);
}

export function initLaunchViewport(): void {
  atLaunch = measure();
  $('appVersion').textContent = 'SliceOfPie ' + __APP_VERSION__;
  if (!installedOnIos()) return;
  settleSoon();
  if (document.readyState !== 'complete') addEventListener('load', () => requestAnimationFrame(nudge), { once: true });
  // Coming back from the app switcher can bring the short layout back
  addEventListener('pageshow', e => { if (e.persisted) settleSoon(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settleSoon(); });
}

// Settings → the version line: which build is running and how big the screen is,
// for a screenshot when something looks off on a particular phone
export async function showAppInfo(): Promise<void> {
  const now = measure();
  const line = (s: Sizes) => `window ${s.window}, visible ${s.visible}, 100dvh ${s.dvh}, safe area ${s.safeTop}/${s.safeBottom}`;
  const details = [
    'Screen ' + screen.width + '×' + screen.height + (installedOnIos() ? ', installed (iOS)' : matchMedia('(display-mode: standalone)').matches ? ', installed' : ', browser tab'),
    'At launch: ' + (atLaunch ? line(atLaunch) : '?'),
    'Now: ' + line(now),
    ...(heights.length ? ['Window height after each nudge: ' + heights.join(', ')] : []),
  ].join('\n');
  if (await confirmDialog('SliceOfPie ' + __APP_VERSION__, details, { yes: 'Copy', no: 'Close' })) {
    await copyText('SliceOfPie ' + __APP_VERSION__ + '\n' + details + '\n' + navigator.userAgent);
  }
}
