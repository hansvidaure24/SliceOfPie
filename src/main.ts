import { $, setToggle, CURRENCIES, getCurrency, setCurrency, getThemePref, setThemePref, applyTheme, confirmDialog, showToast } from './helpers';
import type { ThemePref } from './helpers';
import { state } from './state';
import { restorePaymentFields, savePayment, togglePay } from './payment';
import { renderPresets, addPreset, setTipBase } from './tip';
import { changePeople } from './people';
import { setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill } from './toggles';
import { updateItemsCta, initAssign } from './assign';
import { takePhotoNative, uploadPhoto, skipToManual, addItem, scanPhoto, updateRunning, enterItemsScreen } from './items';
import { takePhoto, closeCamera, shootPhoto, toggleTorch } from './camera';
import { updateHistoryBadge, startSaveBill, deleteBill } from './history';
import { goTo, goBack, quickNext, itemsNext, newBill, goToNextFromPeople, goBackFromSummary, captureBack, screenForSlug, syncBillUI, settleHomeLocation, startSplit, updateQuickCta } from './navigation';
import { goToSummary } from './summary';
import { restoreDraft } from './draft';
import { doShare, reshareDetail } from './share';
import { exportImage } from './export-image';
import { loadHistory } from './db';
import { registerSW } from 'virtual:pwa-register';

// Vite bundles as ESM — expose handlers for inline onclick attributes
Object.assign(window, {
  goTo, goBack, goToNextFromPeople, goBackFromSummary, captureBack,
  changePeople, setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill,
  takePhoto, takePhotoNative, uploadPhoto, skipToManual, addItem,
  closeCamera, shootPhoto, toggleTorch,
  quickNext, itemsNext,
  setTipBase,
  doShare, reshareDetail, newBill,
  startSaveBill, deleteBill, startSplit,
  savePayment, togglePay, addPreset,
  exportImage,
});

function renderThemeToggle(): void {
  const current = getThemePref();
  $('themeToggle').querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(btn => {
    const selected = btn.dataset.theme === current;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-checked', String(selected));
  });
}

$('themeToggle').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-theme]');
  if (!btn) return;
  setThemePref(btn.dataset.theme as ThemePref);
  renderThemeToggle();
});

function renderCurrencySelect(): void {
  const current = getCurrency();
  const select = $('currencySelect') as HTMLSelectElement;
  select.innerHTML = CURRENCIES.map(c =>
    `<option value="${c.symbol}" ${c.symbol === current ? 'selected' : ''}>${c.symbol} - ${c.name} (${c.code})</option>`
  ).join('');
  select.addEventListener('change', () => {
    setCurrency(select.value);
    updateCurrencySymbols();
  });
  updateCurrencySymbols();
}

function updateCurrencySymbols(): void {
  const sym = getCurrency();
  ['quickTotalSymbol', 'quickTaxSymbol', 'taxSymbol'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
  updateQuickCta();
  updateItemsCta();
}

// Restore saved state
applyTheme();
renderThemeToggle();
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (getThemePref() === 'system') applyTheme();
});
renderCurrencySelect();
restorePaymentFields();
Object.entries(state.payToggles).forEach(([key, on]) => setToggle('tog' + key, on));
renderPresets();

// Pick up a bill in progress, or open the screen named in the address bar
const draftScreen = restoreDraft();
syncBillUI();
const RESUME: Record<string, () => void> = {
  screenPeople: () => goTo('screenPeople'),
  screenQuick: () => goTo('screenQuick'),
  screenCapture: () => goTo('screenCapture'),
  screenCamera: () => goTo('screenCapture'),
  screenItems: () => enterItemsScreen(),
  screenSummary: () => goToSummary(),
};
const linked = screenForSlug(location.hash.slice(1));
if (draftScreen && RESUME[draftScreen]) {
  RESUME[draftScreen]();
  showToast('Picked up where you left off');
} else if (linked === 'screenHistory' || linked === 'screenSettings') {
  goTo(linked);
} else {
  settleHomeLocation();
}

loadHistory().then(bills => {
  state.history = bills;
  updateHistoryBadge();
}).catch(() => {});

initAssign();

// Photo input — preview and OCR
($('photoInput') as HTMLInputElement).addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void scanPhoto(file);
});

// Bind numeric inputs to state
($('quickTotal') as HTMLInputElement).addEventListener('input', (e) => {
  state.quickTotalAmt = parseFloat((e.target as HTMLInputElement).value) || 0;
  updateQuickCta();
});
($('quickTax') as HTMLInputElement).addEventListener('input', (e) => {
  state.quickTaxAmt = parseFloat((e.target as HTMLInputElement).value) || 0;
  updateQuickCta();
});
($('taxInput') as HTMLInputElement).addEventListener('input', (e) => {
  state.taxAmt = parseFloat((e.target as HTMLInputElement).value) || 0;
  updateRunning();
});

// Auto-scroll inputs into view on mobile keyboards
document.addEventListener('focusin', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('input[type="number"],input[type="text"],.item-name,.item-price,.pay-input,.person-name-input')) {
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }
});

// Enter key advances screens with numeric inputs
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const focused = document.activeElement as HTMLElement | null;
  if (focused?.classList.contains('person-name-input')) return;
  const active = document.querySelector('.screen.active') as HTMLElement | null;
  if (!active) return;
  const id = active.id;
  if (id === 'screenQuick') quickNext();
  else if (id === 'screenPeople') goToNextFromPeople();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('confirmOverlay');
  if (overlay?.classList.contains('show')) {
    document.getElementById('confirmNo')?.click();
    return;
  }
  if (document.activeElement instanceof HTMLInputElement) {
    document.activeElement.blur();
    return;
  }
  void goBack();
});

registerSW({
  async onNeedRefresh() {
    if (await confirmDialog('New version available. Update now?')) location.reload();
  },
});
