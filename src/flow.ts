import { $, setToggle } from './helpers';
import { fmt } from './money';
import { showToast } from './notify';
import { confirmDialog } from './dialog';
import { state, getBillTotals, savedTipPct } from './state';
import { renderNames } from './people';
import { renderTipRow } from './tip';
import { updateItemsCta, unassignedCount, showFirstUnassigned } from './assign';
import { renderSaveButton } from './history';
import { renderPayerRow, updateSummary } from './summary';
import { clearDraft } from './draft';
import { renderLiveSummary } from './layout';
import { HOME, goTo, onEnterScreen, setBackRoutes } from './router';

// Moving through a split: People → Total or Scan → Items → Bill, and starting over

setBackRoutes({
  screenSettings: () => goTo(HOME),
  screenHistory: () => goTo(HOME),
  screenDetail: () => goTo('screenHistory'),
  screenPeople: () => goTo(HOME),
  screenQuick: () => goTo('screenPeople'),
  screenCapture: () => captureBack(),
  screenCamera: () => goTo('screenCapture'),
  screenItems: () => goBackFromItems(),
  screenSummary: () => goBackFromSummary(),
});

onEnterScreen('screenCapture', resetCapture);
onEnterScreen('screenQuick', () => {
  if (!state.quickTotalAmt) setTimeout(() => ($('quickTotal') as HTMLInputElement).focus(), 300);
  const scanBtn = $('scanTotalBtn');
  if (state.receipt) {
    scanBtn.innerHTML = '<span class="camera-icon"></span>Rescan receipt';
  } else {
    scanBtn.innerHTML = '<span class="camera-icon"></span>Scan receipt';
  }
  const merchant = state.receipt?.merchant;
  $('quickMerchant').textContent = merchant || '';
  $('quickMerchant').hidden = !merchant;
});

// Home's two ways in: scan for a by-item split, or type the total for an even one
export function startSplit(mode: 'even' | 'item'): void {
  state.splitMode = mode;
  $('modeEven').classList.toggle('active', mode === 'even');
  $('modeItem').classList.toggle('active', mode === 'item');
  $('modeEven').setAttribute('aria-pressed', String(mode === 'even'));
  $('modeItem').setAttribute('aria-pressed', String(mode === 'item'));
  goTo('screenPeople');
}

// The Total screen's bottom bar
export function updateQuickCta(): void {
  const total = state.quickTotalAmt + (state.taxIncluded ? 0 : state.quickTaxAmt);
  $('quickCtaTotal').textContent = fmt(total);
  const note = $('quickCtaNote');
  if (total > 0 && state.people.length > 1) {
    const perPerson = total / state.people.length;
    note.textContent = '~' + fmt(perPerson) + ' each before tip';
  } else {
    note.textContent = 'Bill total';
  }
  renderLiveSummary();
}

function resetCapture(): void {
  ($('previewImg') as HTMLImageElement).style.display = 'none';
  ($('previewImg') as HTMLImageElement).setAttribute('aria-hidden', 'true');
  $('progressWrap').style.display = 'none';
  ($('progressFill') as HTMLElement).style.width = '0%';
  $('progressFill').parentElement!.setAttribute('aria-valuenow', '0');
  $('progressFill').parentElement!.classList.remove('indeterminate');
  ($('photoInput') as HTMLInputElement).value = '';
}

export function goToSummary(): void {
  renderTipRow();
  renderPayerRow();
  updateSummary();
  const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
  $('saveKbdHint').innerHTML = `<kbd>${mod}</kbd>+<kbd>S</kbd> to save`;
  goTo('screenSummary');
}

export function quickNext(): void {
  if (state.quickTotalAmt <= 0) { showToast('Enter a total first'); return; }
  goToSummary();
}

export async function itemsNext(): Promise<void> {
  const subtotal = state.items.reduce((sum, item) => sum + (item.price || 0), 0);
  if (subtotal <= 0) { showToast('Add at least one item'); return; }

  const unassigned = unassignedCount();
  if (unassigned > 0) {
    const proceed = await confirmDialog(
      unassigned === 1 ? '1 item has nobody on it' : unassigned + ' items have nobody on them',
      "They won't count toward anyone's share.",
      { yes: 'Continue anyway', no: 'Assign them', warn: true },
    );
    if (!proceed) { showFirstUnassigned(); return; }
  }

  goToSummary();
}

function resetState(): void {
  state.people = [{ name: state.payment.name || 'Me', isMe: true }, { name: 'Person 1' }];
  state.splitMode = 'even';
  state.items = [];
  state.taxAmt = 0;
  state.quickTotalAmt = 0;
  state.quickTaxAmt = 0;
  state.tipPct = savedTipPct();
  state.taxIncluded = true;
  state.roundUp = false;
  state.tipBase = 'pre';
  state.payer = 'me';
  state.imPartOfBill = true;
  state.billSavedThisSession = false;
  state.receipt = null;
  state.useReceiptTip = false;
  state.billLabel = '';
}

// Puts the bill's inputs and toggles in line with state, after a reset or a restored draft
export function syncBillUI(): void {
  setToggle('roundToggle', state.roundUp);
  setToggle('taxIncToggle', state.taxIncluded);
  $('peopleCount').textContent = String(state.people.length);
  $('peopleCount').setAttribute('aria-label', state.people.length + ' people splitting');
  $('quickTaxCard').classList.toggle('hidden', state.taxIncluded);
  ($('quickTotal') as HTMLInputElement).value = state.quickTotalAmt ? String(state.quickTotalAmt) : '';
  ($('quickTax') as HTMLInputElement).value = state.quickTaxAmt ? String(state.quickTaxAmt) : '';
  ($('taxInput') as HTMLInputElement).value = state.taxAmt ? String(state.taxAmt) : '';
  $('modeEven').classList.toggle('active', state.splitMode === 'even');
  $('modeItem').classList.toggle('active', state.splitMode === 'item');
  $('modeEven').setAttribute('aria-pressed', String(state.splitMode === 'even'));
  $('modeItem').setAttribute('aria-pressed', String(state.splitMode === 'item'));
  $('tipPreTax').classList.toggle('active', state.tipBase === 'pre');
  $('tipPostTax').classList.toggle('active', state.tipBase === 'post');
  $('tipPreTax').setAttribute('aria-pressed', String(state.tipBase === 'pre'));
  $('tipPostTax').setAttribute('aria-pressed', String(state.tipBase === 'post'));
  renderSaveButton();
  renderTipRow();
  renderNames();
  updateQuickCta();
  updateItemsCta();
}

// The capture screen is reached from People (by item) or from the total screen (even split)
export function captureBack(): void {
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenPeople');
}

export function goToNextFromPeople(): void {
  const names = state.people.map(p => p.name.toLowerCase());
  const dupeIdx = names.findIndex((n, i) => names.indexOf(n) !== i);
  if (dupeIdx >= 0) {
    const name = state.people[dupeIdx].name;
    showToast('"' + name + '" is listed twice');
    const input = $('namesList').querySelector<HTMLInputElement>(`[data-person="${dupeIdx}"]`);
    if (input) {
      input.focus();
      input.select();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenCapture');
}

async function goBackFromItems(): Promise<void> {
  const hasWork = state.items.some(it => it.price > 0);
  if (hasWork && !(await confirmDialog('Discard these items?', '', { yes: 'Discard', warn: true }))) return;
  goTo('screenCapture');
}

async function confirmLeaveSummary(): Promise<boolean> {
  const { total } = getBillTotals();
  if (total > 0 && !state.billSavedThisSession) {
    const label = state.receipt?.merchant || state.billLabel || '';
    const msg = label
      ? 'Discard "' + label + '"?'
      : 'You have an unsaved bill. Discard it?';
    return confirmDialog(msg, 'This bill hasn’t been saved yet.', { yes: 'Discard', warn: true });
  }
  return true;
}

export async function goBackFromSummary(): Promise<void> {
  if (!(await confirmLeaveSummary())) return;
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenItems');
}

export async function newBill(): Promise<void> {
  if (!(await confirmLeaveSummary())) return;
  resetState();
  syncBillUI();
  resetCapture();
  clearDraft();
  goTo(HOME);
}
