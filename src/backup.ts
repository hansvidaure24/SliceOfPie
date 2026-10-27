import { $ } from './helpers';
import { showToast } from './notify';
import { prefersCopy } from './share';
import { state } from './state';
import { putBill, keepDataOnDevice } from './db';
import { updateHistoryBadge } from './history';
import { onEnterScreen } from './router';
import { readBackup, writeBackup } from './backup-format';
import type { Bill } from './types';

// Saved bills live only on this device; these move them to a file and back,
// for a new phone or a cleared browser.

export function renderBackupCount(): void {
  const n = state.history.length;
  $('backupCount').textContent = n === 0 ? 'No saved bills yet.' : n === 1 ? '1 saved bill.' : n + ' saved bills.';
}

export function exportBills(): void {
  if (!state.history.length) { showToast('No saved bills to export'); return; }
  const body = writeBackup(state.history);
  const name = 'sliceofpie-bills-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([body], name, { type: 'application/json' });
  // Phones offer the share sheet (Save to Files, Drive, a chat); computers download it
  if (!prefersCopy() && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(err => {
      if ((err as DOMException)?.name !== 'AbortError') download(file);
    });
    return;
  }
  download(file);
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast('Bills exported');
}

export function importBills(): void {
  ($('importInput') as HTMLInputElement).click();
}

export function initBackup(): void {
  onEnterScreen('screenSettings', renderBackupCount);
  const input = $('importInput') as HTMLInputElement;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let bills: Bill[];
    try {
      bills = readBackup(await file.text());
    } catch {
      showToast("That file isn't a SliceOfPie export");
      return;
    }
    const known = new Set(state.history.map(b => b.id));
    const added = bills.filter(b => !known.has(b.id));
    try {
      await Promise.all(added.map(putBill));
    } catch {
      showToast('Could not import. Storage may be full or blocked.');
      return;
    }
    state.history = [...state.history, ...added].sort((a, b) => b.id - a.id);
    updateHistoryBadge();
    renderBackupCount();
    if (added.length) keepDataOnDevice();
    showToast(added.length
      ? 'Imported ' + added.length + (added.length === 1 ? ' bill' : ' bills')
      : 'Those bills are already here');
  });
}
