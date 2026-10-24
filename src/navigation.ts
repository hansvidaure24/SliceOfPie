import { $, esc, fmt, setToggle, showToast, confirmDialog, dialogOpen, announce } from './helpers';
import { state, getBillTotals } from './state';
import { renderNames, updateCounterState } from './people';
import { renderTipRow } from './tip';
import { renderAssign, updateItemsCta, unassignedCount, showFirstUnassigned } from './assign';
import { renderHistory, renderSaveButton } from './history';
import { goToSummary } from './summary';
import { saveDraft, clearDraft } from './draft';
import { setAside, renderLiveSummary } from './layout';
import { renderScannerStatus, warmScannerIfReady } from './scanner-status';

const HOME = 'screenWelcome';

// Shown in the address bar, so a reload or a shared link names the screen
const SLUGS: Record<string, string> = {
  screenWelcome: '',
  screenSettings: 'settings',
  screenHistory: 'history',
  screenDetail: 'saved-bill',
  screenPeople: 'people',
  screenQuick: 'total',
  screenCapture: 'scan',
  screenCamera: 'camera',
  screenItems: 'items',
  screenSummary: 'bill',
};

export function screenForSlug(slug: string): string | null {
  return Object.keys(SLUGS).find(id => SLUGS[id] === slug) ?? null;
}

// What Back does on each screen: the app's Back buttons, Escape, and the
// system back gesture all run this
const BACK: Record<string, () => void | Promise<void>> = {
  screenSettings: () => goTo(HOME),
  screenHistory: () => goTo(HOME),
  screenDetail: () => goTo('screenHistory'),
  screenPeople: () => goTo(HOME),
  screenQuick: () => goTo('screenPeople'),
  screenCapture: () => captureBack(),
  screenCamera: () => goTo('screenCapture'),
  screenItems: () => goTo('screenCapture'),
  screenSummary: () => goBackFromSummary(),
};

// What surrounds each screen: the bottom tabs, the top bar, or nothing (camera)
type Chrome = 'tabs' | 'bar' | 'flow' | 'none';
const CHROME: Record<string, Chrome> = {
  screenWelcome: 'tabs',
  screenHistory: 'tabs',
  screenSettings: 'tabs',
  screenDetail: 'bar',
  screenPeople: 'flow',
  screenQuick: 'flow',
  screenCapture: 'flow',
  screenItems: 'flow',
  screenSummary: 'flow',
  screenCamera: 'none',
};
const BAR_TITLES: Record<string, string> = { screenDetail: 'Saved bill' };

// The steps of each kind of split, as shown in the top bar
const STEPS: Record<'even' | 'item', [string, string[]][]> = {
  even: [['People', ['screenPeople']], ['Total', ['screenQuick', 'screenCapture']], ['Bill', ['screenSummary']]],
  item: [['People', ['screenPeople']], ['Scan', ['screenCapture']], ['Items', ['screenItems']], ['Bill', ['screenSummary']]],
};

let lastAnnounced = '';

function renderChrome(id: string): void {
  const chrome = CHROME[id] ?? 'bar';
  document.body.dataset.chrome = chrome;
  setAside(id);
  $('appTitle').textContent = BAR_TITLES[id] ?? '';
  $('appNewBill').hidden = id !== 'screenSummary';

  const steps = chrome === 'flow' ? STEPS[state.splitMode] : [];
  const at = steps.findIndex(([, screens]) => screens.includes(id));
  $('appSteps').innerHTML = steps.map(([label], i) =>
    `<li class="${i < at ? 'done' : ''}"${i === at ? ' aria-current="step"' : ''}>${esc(label)}</li>`
  ).join('');
  $('appSteps').setAttribute('aria-label', at >= 0 ? `Step ${at + 1} of ${steps.length}` : 'Progress');
  if (at >= 0 && id !== lastAnnounced) announce(`Step ${at + 1} of ${steps.length}: ${steps[at][0]}`);
  lastAnnounced = id;

  document.querySelectorAll<HTMLElement>('#tabBar [data-tab]').forEach(tab => {
    if (tab.dataset.tab === id) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

// Home's two ways in: scan for a by-item split, or type the total for an even one
export function startSplit(mode: 'even' | 'item'): void {
  state.splitMode = mode;
  $('modeEven').classList.toggle('active', mode === 'even');
  $('modeItem').classList.toggle('active', mode === 'item');
  goTo('screenPeople');
}

// The Total screen's bottom bar
export function updateQuickCta(): void {
  $('quickCtaTotal').textContent = fmt(state.quickTotalAmt + (state.taxIncluded ? 0 : state.quickTaxAmt));
  renderLiveSummary();
}

export function currentScreen(): string {
  return document.querySelector('.screen.active')?.id ?? HOME;
}

// Redraw the top bar without changing screens, e.g. after the split mode
// changes the steps from People/Total/Bill to People/Scan/Items/Bill
export function refreshSteps(): void {
  renderChrome(currentScreen());
}

export async function goBack(): Promise<void> {
  await BACK[currentScreen()]?.();
}

// Cleanup to run when a screen is left (e.g. releasing the camera)
const leaveHandlers: Record<string, () => void> = {};
export function onLeaveScreen(id: string, fn: () => void): void {
  leaveHandlers[id] = fn;
}

export function goTo(id: string): void {
  if (id === 'screenPeople') { updateCounterState(); renderNames(); }

  // Reset capture screen state when navigating to it
  if (id === 'screenCapture') resetCapture();

  const current = document.querySelector('.screen.active') as HTMLElement | null;
  if (current && current.id !== id) document.body.classList.add('navigated');
  if (current && current.id !== id) {
    leaveHandlers[current.id]?.();
    document.body.classList.add('transitioning');
    current.classList.remove('active');
    current.classList.add('leaving');
    const cleanup = () => {
      current.classList.remove('leaving');
      document.body.classList.remove('transitioning');
    };
    current.addEventListener('animationend', cleanup, { once: true });
    // Safety: if reduced-motion kills the animation, clean up after a frame
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (current.classList.contains('leaving')) cleanup();
    }));
  } else if (current) {
    current.classList.remove('active');
  }

  const target = $(id);
  target.classList.add('active');
  window.scrollTo(0, 0);

  // Focus heading for screen readers
  const heading = target.querySelector('h1') as HTMLElement | null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  if (id === 'screenItems') renderAssign();
  if (id === 'screenHistory') renderHistory();
  if (id === 'screenSettings' || id === 'screenCapture') void renderScannerStatus();
  if (id === 'screenCapture') void warmScannerIfReady();

  renderChrome(id);
  syncHistory(id);
  saveDraft(id);
}

// Away from home an extra history entry (our "guard") sits on top, so the
// system back gesture lands in popstate below instead of leaving the app.
// Each guard gets its own id: arriving on ours again means Forward, arriving
// anywhere else means Back.
type GuardState = { guard?: number } | null;
// After a reload the entry we're on may already be a guard; adopt it
let guardId: number | null = (history.state as GuardState)?.guard ?? null;
let droppingGuard = false;

// Start-up landed on home: turn the entry we're on back into a plain one
export function settleHomeLocation(): void {
  renderChrome(HOME);
  guardId = null;
  history.replaceState(null, '', location.pathname + location.search);
}

function syncHistory(id: string): void {
  const url = location.pathname + location.search + (SLUGS[id] ? '#' + SLUGS[id] : '');
  if (id === HOME) {
    if (guardId !== null) {
      guardId = null;
      droppingGuard = true;
      history.back();
    } else {
      history.replaceState(null, '', url);
    }
  } else if (guardId !== null) {
    history.replaceState({ guard: guardId }, '', url);
  } else {
    guardId = Date.now();
    history.pushState({ guard: guardId }, '', url);
  }
}

window.addEventListener('popstate', async (e) => {
  if (droppingGuard) {
    droppingGuard = false;
    history.replaceState(null, '', location.pathname + location.search);
    // A goTo may have run while the back was in flight
    if (currentScreen() !== HOME) syncHistory(currentScreen());
    return;
  }
  const arrived = (e.state as GuardState)?.guard;
  // Browser Forward re-entered our guard entry; nothing to do
  if (arrived !== undefined && arrived === guardId) return;
  guardId = null;
  if (dialogOpen()) $('confirmNo').click();
  else await goBack();
  // Back may have been cancelled (e.g. keeping an unsaved bill)
  if (currentScreen() !== HOME) syncHistory(currentScreen());
});

function resetCapture(): void {
  ($('previewImg') as HTMLImageElement).style.display = 'none';
  ($('previewImg') as HTMLImageElement).setAttribute('aria-hidden', 'true');
  $('progressWrap').style.display = 'none';
  ($('progressFill') as HTMLElement).style.width = '0%';
  $('progressFill').parentElement!.setAttribute('aria-valuenow', '0');
  $('progressFill').parentElement!.classList.remove('indeterminate');
  ($('photoInput') as HTMLInputElement).value = '';
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
  state.tipPct = parseFloat(localStorage.getItem('sp_tip') ?? '') || 18;
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
  $('tipPreTax').classList.toggle('active', state.tipBase === 'pre');
  $('tipPostTax').classList.toggle('active', state.tipBase === 'post');
  renderSaveButton();
  renderTipRow();
  renderNames();
  updateQuickCta();
  updateItemsCta();
}

function resetUI(): void {
  syncBillUI();
  resetCapture();
}

// The capture screen is reached from People (by item) or from the total screen (even split)
export function captureBack(): void {
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenPeople');
}

export function goToNextFromPeople(): void {
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenCapture');
}

async function confirmLeaveSummary(): Promise<boolean> {
  const { total } = getBillTotals();
  if (total > 0 && !state.billSavedThisSession) {
    return confirmDialog('You have an unsaved bill. Discard it?', '', { yes: 'Discard', warn: true });
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
  resetUI();
  clearDraft();
  goTo(HOME);
}
