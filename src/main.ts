import { $, setToggle } from './helpers';
import { state } from './state';
import { restorePaymentFields, savePayment, togglePay } from './payment';
import { renderPresets, addPreset, renderTipRow, setTipBase } from './tip';
import { changePeople, renderNames } from './people';
import { setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill } from './toggles';
import { takePhoto, uploadPhoto, skipToManual, addItem, runOCR, updateRunning } from './items';
import { updateHistoryBadge, startSaveBill, confirmSave, deleteBill, renderHistory } from './history';
import { goTo, quickNext, itemsNext, newBill, goToNextFromPeople, goBackFromSummary } from './navigation';
import { doShare, reshareDetail } from './share';
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
});

// Restore saved state
restorePaymentFields();
Object.entries(state.payToggles).forEach(([key, on]) => setToggle('tog' + key, on));
renderPresets();
renderTipRow();
renderNames();

loadHistory().then(bills => {
  state.history = bills;
  updateHistoryBadge();
});

// Photo input — preview and OCR
($('photoInput') as HTMLInputElement).addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  ($('previewImg') as HTMLImageElement).src = URL.createObjectURL(file);
  ($('previewImg') as HTMLImageElement).style.display = 'block';
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

registerSW({
  onNeedRefresh() {
    if (confirm('New version available. Update now?')) location.reload();
  },
});
