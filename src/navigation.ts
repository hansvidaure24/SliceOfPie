import { $, setToggle, showToast } from './helpers';
import { state } from './state';
import { renderNames } from './people';
import { renderTipRow } from './tip';
import { renderAssign } from './assign';
import { renderHistory } from './history';
import { goToSummary } from './summary';

export function goTo(id: string): void {
  // Reset capture screen state when navigating to it
  if (id === 'screenCapture') {
    ($('previewImg') as HTMLImageElement).style.display = 'none';
    $('progressWrap').style.display = 'none';
    ($('progressFill') as HTMLElement).style.width = '0%';
    ($('photoInput') as HTMLInputElement).value = '';
  }

  const current = document.querySelector('.screen.active') as HTMLElement | null;
  if (current && current.id !== id) {
    document.body.classList.add('transitioning');
    current.classList.remove('active');
    current.classList.add('leaving');
    current.addEventListener('animationend', () => {
      current.classList.remove('leaving');
      document.body.classList.remove('transitioning');
    }, { once: true });
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

  if (id === 'screenItems') {
    $('assignSection').style.display = state.splitMode === 'item' ? 'block' : 'none';
    if (state.splitMode === 'item') renderAssign();
  }
  if (id === 'screenHistory') renderHistory();
}

export function quickNext(): void {
  if (state.quickTotalAmt <= 0) { showToast('Enter a total first'); return; }
  goToSummary();
}

export function itemsNext(): void {
  const subtotal = state.items.reduce((sum, item) => sum + (item.price || 0), 0);
  if (subtotal <= 0) { showToast('Add at least one item'); return; }

  if (state.splitMode === 'item') {
    const unassigned = state.items.filter(item =>
      (item.price || 0) > 0 && (!item.assignees || item.assignees.length === 0)
    );
    const warn = $('unassignedWarn');

    // First tap shows warning, second tap proceeds anyway
    if (unassigned.length > 0) {
      if (!warn.classList.contains('show')) {
        warn.classList.add('show');
        warn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast(unassigned.length + ' item(s) unassigned');
        return;
      }
    }
    warn.classList.remove('show');
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
  state.taxIncluded = true;
  state.roundUp = false;
  state.tipBase = 'pre';
  state.payer = 'me';
  state.imPartOfBill = true;
  state.billSavedThisSession = false;
}

function resetUI(): void {
  setToggle('roundToggle', false);
  setToggle('taxIncToggle', true);
  $('peopleCount').textContent = '2';
  $('quickTaxCard').style.display = 'none';
  ($('quickTotal') as HTMLInputElement).value = '';
  ($('quickTax') as HTMLInputElement).value = '';
  ($('taxInput') as HTMLInputElement).value = '';
  $('modeEven').classList.add('active');
  $('modeItem').classList.remove('active');
  $('tipPreTax').classList.add('active');
  $('tipPostTax').classList.remove('active');
  $('unassignedWarn').classList.remove('show');
  ($('previewImg') as HTMLImageElement).style.display = 'none';
  $('progressWrap').style.display = 'none';
  ($('progressFill') as HTMLElement).style.width = '0%';
  ($('photoInput') as HTMLInputElement).value = '';
  $('saveBillBtn').innerHTML = '<span class="bill-icon" style="margin-right:6px"></span>Save Bill';
  ($('saveBillBtn') as HTMLElement).style.opacity = '1';
  $('saveLabelWrap').classList.remove('show');
}

export function goToNextFromPeople(): void {
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenCapture');
}

export function goBackFromSummary(): void {
  goTo(state.splitMode === 'even' ? 'screenQuick' : 'screenItems');
}

export function newBill(): void {
  resetState();
  resetUI();
  renderTipRow();
  renderNames();
  goTo('screenWelcome');
}
