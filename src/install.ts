import { $ } from './helpers';
import { confirmDialog } from './dialog';
import { load, save } from './storage';

// Chrome, Edge and Android hand over their install prompt; iOS Safari has none,
// so there the button explains Add to Home Screen instead
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

const standalone = () => matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function canInstall(): boolean {
  return !standalone() && (deferred !== null || ios());
}

function render(): void {
  const show = canInstall();
  $('installCard').hidden = !show;
  $('railInstall').hidden = !show;
}

export async function install(): Promise<void> {
  if (deferred) {
    const prompt = deferred;
    deferred = null;
    await prompt.prompt();
    await prompt.userChoice;
    render();
    return;
  }
  if (ios()) {
    await confirmDialog('Add SliceOfPie to your Home Screen', 'In Safari, tap the Share button, then “Add to Home Screen”.', { yes: 'Got it', no: '' });
  }
}

// Once, after the first saved bill, when the app has just proved useful
export async function maybeNudgeInstall(): Promise<void> {
  // Storage that can't remember asking means never asking, not asking every time
  if (!canInstall() || load('sp_installNudged') || !save('sp_installNudged', '1')) return;
  if (await confirmDialog('Keep SliceOfPie on your home screen?', 'It opens instantly and works with no signal.', { yes: 'Install', no: 'Not now' })) {
    await install();
  }
}

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    render();
  });
  $('installBtn').addEventListener('click', () => void install());
  $('railInstall').addEventListener('click', () => void install());
  render();
}
