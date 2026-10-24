import { $, setToggle } from './helpers';
import { CURRENCIES, getCurrency, setCurrency } from './money';
import { getThemePref, setThemePref, applyTheme, type ThemePref } from './theme';
import { showToast } from './notify';
import { goTo, goBack, screenForSlug, settleHomeLocation, currentScreen } from './router';
import { quickNext, itemsNext, newBill, goToNextFromPeople, syncBillUI, startSplit, updateQuickCta, goToSummary } from './flow';
import { state } from './state';
import { restorePaymentFields, savePayment, togglePay } from './payment';
import { renderPresets, addPreset, removePreset, setTipBase, setTip, chooseReceiptTip, setCustomTip, initTipSettings } from './tip';
import { changePeople, loadLastGroup, pickContacts, addRecentName, initPeople } from './people';
import { setSplitMode, toggleTaxInc, toggleRound, togglePartOfBill } from './toggles';
import { updateItemsCta, initAssign } from './assign';
import { takePhotoNative, uploadPhoto, skipToManual, addItem, scanPhoto, updateRunning, enterItemsScreen } from './items';
// The live camera loads when it's first opened
const camera = () => import('./camera');
import { updateHistoryBadge, startSaveBill, deleteBill, viewBill, askDeleteBill, togglePaid, renameBill, initHistory } from './history';
import { setPayer } from './summary';
import { restoreDraft } from './draft';
import { doShare, reshareDetail, labelShareButtons } from './share';
import { exportImage } from './export-image';
import { loadHistory } from './db';
import { initActions } from './actions';
import { initReceiptDrop } from './layout';
import { initInstall, lockZoomWhenInstalled } from './install';
import { initScannerStatus } from './scanner-status';
import { SHARE_CACHE, SHARED_RECEIPT_URL } from './scan/cache-name';
import { initUpdates } from './update';

// What each data-action in the page does
initActions({
  goTo: id => goTo(id!), goBack, goToNextFromPeople, startSplit: mode => startSplit(mode as 'even' | 'item'),
  changePeople: delta => changePeople(Number(delta)), setSplitMode: mode => setSplitMode(mode as 'even' | 'item'),
  toggleTaxInc, toggleRound, togglePartOfBill,
  takePhoto: () => camera().then(m => m.takePhoto()), takePhotoNative, uploadPhoto, skipToManual, addItem,
  closeCamera: () => camera().then(m => m.closeCamera()),
  shootPhoto: () => camera().then(m => m.shootPhoto()),
  toggleTorch: () => camera().then(m => m.toggleTorch()),
  quickNext, itemsNext,
  setTipBase: base => setTipBase(base as 'pre' | 'post'),
  doShare: mode => doShare(mode as 'auto' | 'alt' | undefined), reshareDetail: mode => reshareDetail(mode as 'auto' | 'alt' | undefined),
  newBill, startSaveBill, deleteBill,
  viewBill: id => viewBill(Number(id)), askDeleteBill: id => askDeleteBill(id!), renameBill,
  togglePaid: person => togglePaid(Number(person)), setPayer: who => setPayer(who!),
  loadLastGroup, pickContacts, addRecentName: name => addRecentName(name!),
  setTip: pct => setTip(pct!), chooseReceiptTip, setCustomTip,
  savePayment, togglePay: method => togglePay(method as Parameters<typeof togglePay>[0]), addPreset,
  removePreset: i => removePreset(i!),
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
lockZoomWhenInstalled();
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
initInstall();
initScannerStatus();
labelShareButtons();

// App shortcuts (long-press the icon) and photos shared from other apps arrive as query params
const launch = new URLSearchParams(location.search);
history.replaceState(history.state, '', location.pathname + location.hash);
const RESUME: Record<string, () => void> = {
  screenPeople: () => goTo('screenPeople'),
  screenQuick: () => goTo('screenQuick'),
  screenCapture: () => goTo('screenCapture'),
  screenCamera: () => goTo('screenCapture'),
  screenItems: () => enterItemsScreen(),
  screenSummary: () => goToSummary(),
};
const linked = screenForSlug(location.hash.slice(1));
if (launch.get('shared') === 'receipt') {
  void openSharedReceipt();
} else if (launch.get('start') === 'scan' || launch.get('start') === 'total') {
  startSplit(launch.get('start') === 'scan' ? 'item' : 'even');
} else if (draftScreen && RESUME[draftScreen]) {
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
initPeople();
initHistory();
initTipSettings();

// A dropped or pasted receipt scans like a photo; the total screen hands off to the scan screen
initReceiptDrop(file => {
  if (currentScreen() !== 'screenCapture') goTo('screenCapture');
  void scanPhoto(file);
});

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
  // An open dialog handles its own Escape
  if (document.querySelector('dialog[open]')) return;
  if (document.activeElement instanceof HTMLInputElement) {
    document.activeElement.blur();
    return;
  }
  void goBack();
});

// A photo shared to SliceOfPie: the service worker parked it in a cache
async function openSharedReceipt(): Promise<void> {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARED_RECEIPT_URL);
    await cache.delete(SHARED_RECEIPT_URL);
    if (!res) { settleHomeLocation(); return; }
    startSplit('item');
    goTo('screenCapture');
    showToast('Scanning the shared photo');
    void scanPhoto(await res.blob());
  } catch {
    settleHomeLocation();
  }
}

// A new version doesn't interrupt; a bill in progress survives the reload as a draft
initUpdates();
