import { registerSW } from 'virtual:pwa-register';
import { $ } from './helpers';
import { currentScreen, onEnterScreen } from './router';

// How a new deploy reaches the app. The service worker waits (see sw.ts) until
// it's told to take over, and this decides when:
// - away from a bill (Home, History, Settings): straight away, one quick reload
// - in the middle of a bill: offer "A new version is ready", and apply it on
//   Reload or once the user is back away from the bill
// A draft survives a reload, but an open camera or a running scan doesn't.

const SAFE_SCREENS = ['screenWelcome', 'screenHistory', 'screenSettings'];

export function initUpdates(): void {
  let waiting = false;

  const updateSW = registerSW({
    onNeedRefresh() {
      if (SAFE_SCREENS.includes(currentScreen())) {
        void updateSW(true);
      } else {
        waiting = true;
        $('updateToast').hidden = false;
      }
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Home Screen apps usually resume rather than relaunch, which skips the
      // browser's own update check, so check when the app comes back too
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - lastCheck < 60_000) return;
        lastCheck = Date.now();
        registration.update().catch(() => {});
      });
    },
  });

  // Tells the waiting service worker to take over; the page reloads once it has
  $('updateReload').addEventListener('click', () => void updateSW(true));
  for (const id of SAFE_SCREENS) {
    onEnterScreen(id, () => { if (waiting) void updateSW(true); });
  }
}
