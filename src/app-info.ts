import { $ } from './helpers';
import { confirmDialog } from './dialog';
import { copyText } from './share';

// Settings ends with the version and build. Tapping it shows the screen and
// window sizes when the app opened and now, for a screenshot when the layout
// looks off on a particular phone (it's how the iPhone launch bug in
// index.html's status bar setting was pinned down).

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

export function initAppInfo(): void {
  atLaunch = measure();
  $('appVersion').textContent = 'SliceOfPie ' + __APP_VERSION__;
}

export async function showAppInfo(): Promise<void> {
  const line = (s: Sizes) => `window ${s.window}, visible ${s.visible}, 100dvh ${s.dvh}, safe area ${s.safeTop}/${s.safeBottom}`;
  const details = [
    'Screen ' + screen.width + '×' + screen.height + (installedOnIos() ? ', installed (iOS)' : matchMedia('(display-mode: standalone)').matches ? ', installed' : ', browser tab'),
    'At launch: ' + (atLaunch ? line(atLaunch) : '?'),
    'Now: ' + line(measure()),
  ].join('\n');
  if (await confirmDialog('SliceOfPie ' + __APP_VERSION__, details, { yes: 'Copy', no: 'Close' })) {
    await copyText('SliceOfPie ' + __APP_VERSION__ + '\n' + details + '\n' + navigator.userAgent);
  }
}
