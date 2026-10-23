import { $, setToggle } from './helpers';
import { state } from './state';
import { renderNames } from './people';
import { updateSummary } from './summary';

export function setSplitMode(mode: 'even' | 'item'): void {
  state.splitMode = mode;
  $('modeEven').classList.toggle('active', mode === 'even');
  $('modeItem').classList.toggle('active', mode === 'item');
}

export function toggleTaxInc(): void {
  state.taxIncluded = !state.taxIncluded;
  setToggle('taxIncToggle', state.taxIncluded);
  $('quickTaxCard').style.display = state.taxIncluded ? 'none' : 'block';
  if (state.taxIncluded) {
    state.quickTaxAmt = 0;
    ($('quickTax') as HTMLInputElement).value = '';
  }
}

export function toggleRound(): void {
  state.roundUp = !state.roundUp;
  setToggle('roundToggle', state.roundUp);
  updateSummary();
}

export function togglePartOfBill(): void {
  state.imPartOfBill = !state.imPartOfBill;

  if (state.imPartOfBill) {
    if (!state.people[0]?.isMe) {
      state.people.unshift({ name: state.payment.name || 'Me', isMe: true });
    }
    state.payer = 'me';
  } else {
    if (state.people[0]?.isMe) state.people.splice(0, 1);
    if (state.people.length === 0) state.people.push({ name: 'Person 1' });
    state.payer = 0;
  }

  $('peopleCount').textContent = String(state.people.length);
  renderNames();
}
