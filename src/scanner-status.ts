import { $, confirmDialog, showToast } from './helpers';
import { paddleEngine } from './scan/engine-paddle';

const sizeMb = () => Math.round(paddleEngine.downloadBytes / 1e6);
let busy = false;

// Settings shows whether the scanner is saved for offline use; the scan screen says what the first scan costs
export async function renderScannerStatus(): Promise<void> {
  if (!paddleEngine.isAvailable()) {
    $('scannerCard').hidden = true;
    $('captureScannerNote').textContent = '';
    return;
  }
  if (busy) return;
  const cached = await paddleEngine.isCached();
  $('scannerState').textContent = cached ? 'Ready offline' : 'Not downloaded yet';
  $('scannerState').classList.toggle('ok', cached);
  $('scannerDetail').textContent = cached
    ? `Saved on this device (about ${sizeMb()} MB).`
    : `About ${sizeMb()} MB, once. After that, scanning works with no signal.`;
  $('scannerBtn').textContent = cached ? 'Remove' : 'Download';
  $('captureScannerNote').textContent = cached
    ? 'Scanner ready offline'
    : navigator.onLine
      ? `Your first scan downloads the scanner (about ${sizeMb()} MB)`
      : 'Scanning needs a connection the first time. You can enter items by hand.';
  $('captureScannerNote').classList.toggle('ok', cached);
}

async function onScannerButton(): Promise<void> {
  if (busy) return;
  if (await paddleEngine.isCached()) {
    if (!(await confirmDialog('Remove the receipt scanner?', `This frees about ${sizeMb()} MB. Your next scan downloads it again.`, { yes: 'Remove', warn: true }))) return;
    await paddleEngine.forget();
    showToast('Scanner removed');
    await renderScannerStatus();
    return;
  }
  busy = true;
  const bar = $('scannerProgress');
  const fill = bar.firstElementChild as HTMLElement;
  bar.hidden = false;
  fill.style.width = '0%';
  ($('scannerBtn') as HTMLButtonElement).disabled = true;
  $('scannerState').textContent = 'Downloading…';
  try {
    await paddleEngine.prefetch(p => {
      if (p.phase === 'download') fill.style.width = p.pct + '%';
    });
    // Say what actually happened: a private window or full storage can refuse to keep it
    showToast(await paddleEngine.isCached()
      ? 'Scanner ready offline'
      : "Downloaded, but this browser didn't keep it for offline use");
  } catch {
    showToast("Couldn't download the scanner. Check your connection.");
  } finally {
    busy = false;
    bar.hidden = true;
    ($('scannerBtn') as HTMLButtonElement).disabled = false;
    await renderScannerStatus();
  }
}

// Asked before the first scan downloads the scanner; false means type it in instead
export async function okToDownloadScanner(): Promise<boolean> {
  if (!paddleEngine.isAvailable() || !navigator.onLine || await paddleEngine.isCached()) return true;
  return confirmDialog(
    'Download the receipt scanner?',
    `It's about ${sizeMb()} MB, once. After that, scanning works with no signal.`,
    { yes: 'Download and scan', no: 'Type it in' },
  );
}

export function initScannerStatus(): void {
  $('scannerBtn').addEventListener('click', () => void onScannerButton());
  void renderScannerStatus();
}
