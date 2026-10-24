import { $ } from './helpers';
import { confirmDialog } from './dialog';
import { copyText } from './share';

// An iPhone Home Screen app that draws under the status bar opens with the
// page laid out one status bar short of the screen, and stays that way until
// the first scroll makes iOS measure again (bottom bars float above the bottom
// edge). Scrolling a pixel and back right after opening does what that first
// scroll does.

const installedOnIos = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;

interface Sizes { window: string; visible: string; dvh: number; safeTop: number; safeBottom: number }
let atLaunch: Sizes | null = null;

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

function nudge(): void {
  const root = document.documentElement;
  const before = root.style.minHeight;
  // Something to scroll, even on a screen that fits
  root.style.minHeight = 'calc(100% + 2px)';
  scrollBy(0, 1);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollBy(0, -1);
    root.style.minHeight = before;
  }));
}

export function initLaunchViewport(): void {
  atLaunch = measure();
  $('appVersion').textContent = 'SliceOfPie ' + __APP_VERSION__;
  if (!installedOnIos()) return;
  const settle = () => requestAnimationFrame(nudge);
  if (document.readyState === 'complete') settle();
  else addEventListener('load', settle, { once: true });
  // Coming back from the app switcher can bring the short layout back
  addEventListener('pageshow', e => { if (e.persisted) settle(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
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
  ].join('\n');
  if (await confirmDialog('SliceOfPie ' + __APP_VERSION__, details, { yes: 'Copy', no: 'Close' })) {
    await copyText('SliceOfPie ' + __APP_VERSION__ + '\n' + details + '\n' + navigator.userAgent);
  }
}
