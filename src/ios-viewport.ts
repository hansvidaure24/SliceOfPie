// An iPhone Home Screen app that draws under the status bar opens with
// position:fixed laid out one status bar short of the screen, so bars pinned to
// the bottom float that far up until the first scroll puts them right. This
// measures where "bottom: 0" really lands and hands the difference to the CSS
// as --launch-gap, which the bottom bars move down by. It's 0 everywhere else.

export interface Measure {
  portrait: boolean;
  screenW: number;
  screenH: number;
  innerW: number;
  // Where an element at position:fixed; bottom:0 ends up
  fixedBottom: number;
}

// iOS reports the screen in portrait whichever way the phone is held
export function launchGap(m: Measure): number {
  const fullH = m.portrait ? Math.max(m.screenW, m.screenH) : Math.min(m.screenW, m.screenH);
  const fullW = m.portrait ? Math.min(m.screenW, m.screenH) : Math.max(m.screenW, m.screenH);
  // Only a full-screen app: in iPad split view the window is meant to be shorter
  if (Math.abs(m.innerW - fullW) > 1) return 0;
  const gap = Math.round(fullH - m.fixedBottom);
  // A status bar's worth at most; anything else isn't this bug
  return gap > 0 && gap <= 80 ? gap : 0;
}

export function initIosViewport(): void {
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.append(probe);

  const update = () => {
    const gap = launchGap({
      portrait: matchMedia('(orientation: portrait)').matches,
      screenW: screen.width,
      screenH: screen.height,
      innerW: innerWidth,
      fixedBottom: probe.getBoundingClientRect().bottom,
    });
    document.documentElement.style.setProperty('--launch-gap', gap + 'px');
  };
  update();
  // iOS fixes itself on the first scroll or rotation; follow it back to 0
  for (const type of ['scroll', 'resize', 'orientationchange', 'pageshow']) addEventListener(type, update, { passive: true });
  visualViewport?.addEventListener('resize', update);
  document.addEventListener('visibilitychange', update);
}
