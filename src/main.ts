import { $, setToggle, CURRENCIES, getCurrency, setCurrency, getThemePref, setThemePref, applyTheme } from './helpers';
import type { ThemePref } from './helpers';
import { state } from './state';
import { restorePaymentFields, savePayment, togglePay } from './payment';
import { renderPresets, addPreset, renderTipRow, setTipBase } from './tip';
import { changePeople, renderNames } from './people';
import { setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill } from './toggles';
import { takePhoto, uploadPhoto, skipToManual, addItem, runOCR, updateRunning } from './items';
import { updateHistoryBadge, startSaveBill, confirmSave, deleteBill, renderHistory } from './history';
import { goTo, quickNext, itemsNext, newBill, goToNextFromPeople, goBackFromSummary } from './navigation';
import { doShare, reshareDetail } from './share';
import { exportImage } from './export-image';
import { loadHistory } from './db';
import { registerSW } from 'virtual:pwa-register';

// Vite bundles as ESM — expose handlers for inline onclick attributes
Object.assign(window, {
  goTo, goToNextFromPeople, goBackFromSummary,
  changePeople, setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill,
  takePhoto, uploadPhoto, skipToManual, addItem,
  quickNext, itemsNext,
  setTipBase,
  doShare, reshareDetail, newBill,
  startSaveBill, confirmSave, deleteBill,
  savePayment, togglePay, addPreset,
  renderHistory,
  exportImage,
});

function renderThemeToggle(): void {
  const current = getThemePref();
  $('themeToggle').querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === current);
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
    `<option value="${c.symbol}" ${c.symbol === current ? 'selected' : ''}>${c.symbol} ${c.code}</option>`
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
renderTipRow();
renderNames();

loadHistory().then(bills => {
  state.history = bills;
  updateHistoryBadge();
}).catch(() => {});

// Photo input — preview and OCR
($('photoInput') as HTMLInputElement).addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const img = $('previewImg') as HTMLImageElement;
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(file);
  img.style.display = 'block';
  $('progressWrap').style.display = 'block';
  await runOCR(file);
});

// Bind numeric inputs to state
($('quickTotal') as HTMLInputElement).addEventListener('input', (e) => {
  state.quickTotalAmt = parseFloat((e.target as HTMLInputElement).value) || 0;
});
($('quickTax') as HTMLInputElement).addEventListener('input', (e) => {
  state.quickTaxAmt = parseFloat((e.target as HTMLInputElement).value) || 0;
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

const ESC_BACK: Record<string, () => void> = {
  screenSettings: () => goTo('screenWelcome'),
  screenHistory: () => goTo('screenWelcome'),
  screenDetail: () => { goTo('screenHistory'); renderHistory(); },
  screenPeople: () => goTo('screenWelcome'),
  screenQuick: () => goTo('screenPeople'),
  screenCapture: () => goTo('screenPeople'),
  screenItems: () => goTo('screenCapture'),
  screenSummary: () => goBackFromSummary(),
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.activeElement instanceof HTMLInputElement) {
    document.activeElement.blur();
    return;
  }
  const active = document.querySelector('.screen.active') as HTMLElement | null;
  if (active && ESC_BACK[active.id]) ESC_BACK[active.id]();
});

registerSW({
  onNeedRefresh() {
    if (confirm('New version available. Update now?')) location.reload();
  },
});
