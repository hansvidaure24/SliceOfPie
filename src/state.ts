import type { Person, Item, Bill, Payer, SplitMode, TipBase, PaymentSettings, ReceiptInfo } from './types';
import { load, loadJSON } from './storage';

function loadPayment(): PaymentSettings {
  const p = loadJSON<Record<string, string | boolean | undefined>>('sp_payment', {}) ?? {};
  return {
    name: String(p.name ?? ''),
    venmo: String(p.venmo ?? ''),
    zelle: String(p.zelle ?? ''),
    cashApp: String(p.cashApp ?? ''),
    otherLabel: String(p.otherLabel ?? ''),
    otherValue: String(p.otherValue ?? ''),
    togVenmo: p.togVenmo === true,
    togZelle: p.togZelle === true,
    togCashApp: p.togCashApp === true,
    togOther: p.togOther === true,
  };
}

const payment = loadPayment();

// The tip last picked, which a new bill starts with
export function savedTipPct(): number {
  return parseFloat(load('sp_tip') ?? '') || 18;
}

export const state = {
  people: [
    { name: payment.name || 'Me', isMe: true },
    { name: 'Person 1' },
  ] as Person[],
  splitMode: 'even' as SplitMode,
  items: [] as Item[],
  taxAmt: 0,
  quickTotalAmt: 0,
  quickTaxAmt: 0,
  tipPct: savedTipPct(),
  tipBase: 'pre' as TipBase,
  receipt: null as ReceiptInfo | null,
  // Use the tip printed on the scanned receipt instead of a percentage
  useReceiptTip: false,
  taxIncluded: true,
  roundUp: false,
  payer: 'me' as Payer,
  imPartOfBill: true,
  history: [] as Bill[],
  // The saved bill open on the detail screen
  viewingBillId: null as number | null,
  billSavedThisSession: false,
  // The name it was saved under; empty until saved
  billLabel: '',
  payment,
  payToggles: {
    Venmo: payment.togVenmo,
    Zelle: payment.togZelle,
    CashApp: payment.togCashApp,
    Other: payment.togOther,
  },
  tipPresets: loadJSON<number[] | null>('sp_tipPresets', null) || [15, 18, 20],
};

export function getBillTotals() {
  const sub = state.splitMode === 'even'
    ? state.quickTotalAmt
    : state.items.reduce((s, it) => s + (it.price || 0), 0);
  const tax = state.splitMode === 'even' ? state.quickTaxAmt : state.taxAmt;
  const tipOn = state.tipBase === 'post' ? sub + tax : sub;
  const tip = receiptTip() ?? tipOn * (state.tipPct / 100);
  return { sub, tax, tip, total: sub + tax + tip };
}

// The printed tip, when the user is going with it
export function receiptTip(): number | null {
  return state.useReceiptTip ? state.receipt?.tip ?? null : null;
}

export function tipLabel(): string {
  return receiptTip() !== null ? 'Tip (from receipt)' : 'Tip (' + state.tipPct + '%)';
}

// Tip as a percentage for the history record, even when it came from the receipt
export function effectiveTipPct(): number {
  const tip = receiptTip();
  if (tip === null) return state.tipPct;
  const { sub, tax } = getBillTotals();
  const tipOn = state.tipBase === 'post' ? sub + tax : sub;
  return tipOn > 0 ? Math.round((tip / tipOn) * 1000) / 10 : 0;
}

export function getPayerName(): string {
  if (state.payer === 'me') {
    const me = state.people.find(p => p.isMe);
    return me ? me.name : (state.payment.name || 'Me');
  }
  return state.people[state.payer]?.name || 'Someone';
}

export function isPayer(personIndex: number): boolean {
  return (state.payer === 'me' && !!state.people[personIndex]?.isMe)
    || state.payer === personIndex;
}

export function findBill(id: number): Bill | undefined {
  return state.history.find(b => b.id === id);
}
