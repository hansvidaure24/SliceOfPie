import { $ } from './helpers';
import { confirmDialog } from './dialog';
import { showToast } from './notify';
import { load } from './storage';
import { onEnterScreen } from './router';
import type { PaddleEngine } from './scan/engine-paddle';

// The scanner's code is its own chunk, loaded the first time anything here needs it
let engine: Promise<PaddleEngine> | null = null;
const getEngine = () => (engine ??= import('./scan/engine-paddle').then(m => m.paddleEngine));

const sizeMb = (e: PaddleEngine) => Math.round(e.downloadBytes / 1e6);
let busy = false;

function preferredEngineIsTesseract(): boolean {
  return load('sp_ocrEngine') === 'tesseract';
}

// Settings shows whether the scanner is saved for offline use; the scan screen says what the first scan costs
export async function renderScannerStatus(): Promise<void> {
  const e = await getEngine();
  if (!e.isAvailable()) {
    $('scannerCard').hidden = true;
    $('captureScannerNote').textContent = '';
    return;
  }
  if (busy) return;
  const cached = await e.isCached();
  $('scannerState').textContent = cached ? 'Ready offline' : 'Not downloaded yet';
  $('scannerState').classList.toggle('ok', cached);
  $('scannerDetail').textContent = cached
    ? `Saved on this device (about ${sizeMb(e)} MB).`
    : `About ${sizeMb(e)} MB, once. After that, scanning works with no signal.`;
  $('scannerBtn').textContent = cached ? 'Remove' : 'Download';
  $('captureScannerNote').textContent = cached
    ? 'Scanner ready offline'
    : navigator.onLine
      ? `Your first scan downloads the scanner (about ${sizeMb(e)} MB)`
      : 'Scanning needs a connection the first time. You can enter items by hand.';
  $('captureScannerNote').classList.toggle('ok', cached);
}

// On the scan screen, start the scanner in the background if it's already
// downloaded, so the photo doesn't wait for it to load
export async function warmScannerIfReady(): Promise<void> {
  if (preferredEngineIsTesseract()) return;
  const e = await getEngine();
  if (e.isAvailable() && await e.isCached()) e.warm().catch(() => {});
}

async function onScannerButton(): Promise<void> {
  if (busy) return;
  const e = await getEngine();
  if (await e.isCached()) {
    if (!(await confirmDialog('Remove the receipt scanner?', `This frees about ${sizeMb(e)} MB. Your next scan downloads it again.`, { yes: 'Remove', warn: true }))) return;
    await e.forget();
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
    await e.prefetch(p => {
      if (p.phase === 'download') fill.style.width = p.pct + '%';
    });
    // Say what actually happened: a private window or full storage can refuse to keep it
    showToast(await e.isCached()
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
  if (preferredEngineIsTesseract() || !navigator.onLine) return true;
  const e = await getEngine();
  if (!e.isAvailable() || await e.isCached()) return true;
  return confirmDialog(
    'Download the receipt scanner?',
    `It's about ${sizeMb(e)} MB, once. After that, scanning works with no signal.`,
    { yes: 'Download and scan', no: 'Type it in' },
  );
}

export function initScannerStatus(): void {
  $('scannerBtn').addEventListener('click', () => void onScannerButton());
  onEnterScreen('screenSettings', () => void renderScannerStatus());
  onEnterScreen('screenCapture', () => {
    void renderScannerStatus();
    void warmScannerIfReady();
  });
}
