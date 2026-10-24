import { $, setToggle, tap } from './helpers';
import { state } from './state';
import { insertPersonInItems, removePersonFromItems } from './bill';
import { renderNames, updateCounterState } from './people';
import { updateSummary } from './summary';
import { updateQuickCta, refreshSteps } from './navigation';

export function setSplitMode(mode: 'even' | 'item'): void {
  state.splitMode = mode;
  $('modeEven').classList.toggle('active', mode === 'even');
  $('modeItem').classList.toggle('active', mode === 'item');
  // Even and by-item splits have different steps in the top bar
  refreshSteps();
}

export function toggleTaxInc(): void {
  tap();
  state.taxIncluded = !state.taxIncluded;
  setToggle('taxIncToggle', state.taxIncluded);
  $('quickTaxCard').classList.toggle('hidden', state.taxIncluded);
  if (state.taxIncluded) {
    state.quickTaxAmt = 0;
    ($('quickTax') as HTMLInputElement).value = '';
  }
  updateQuickCta();
}

export function toggleRound(): void {
  tap();
  state.roundUp = !state.roundUp;
  setToggle('roundToggle', state.roundUp);
  updateSummary();
}

export function togglePartOfBill(): void {
  tap();
  state.imPartOfBill = !state.imPartOfBill;

  if (state.imPartOfBill) {
    if (!state.people[0]?.isMe) {
      state.people.unshift({ name: state.payment.name || 'Me', isMe: true });
      insertPersonInItems(state.items, 0);
    }
    state.payer = 'me';
  } else {
    if (state.people[0]?.isMe) {
      state.people.splice(0, 1);
      removePersonFromItems(state.items, 0);
    }
    if (state.people.length === 0) state.people.push({ name: 'Person 1' });
    state.payer = 0;
  }

  $('peopleCount').textContent = String(state.people.length);
  $('peopleCount').setAttribute('aria-label', state.people.length + ' people splitting');
  updateCounterState();
  renderNames();
}
