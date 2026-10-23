import type { Person, Item, Bill, Payer, SplitMode, TipBase, PaymentSettings } from './types';

function safeParse(key: string, fallback: unknown = {}): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function loadPayment(): PaymentSettings {
  const p = safeParse('sp_payment') as Record<string, string | boolean | undefined>;
  return {
    name: String(p.name ?? ''),
    venmo: String(p.venmo ?? ''),
    zelle: String(p.zelle ?? ''),
    cashApp: String(p.cashApp ?? ''),
    otherLabel: String(p.otherLabel ?? ''),
    otherValue: String(p.otherValue ?? ''),
    togVenmo: p.togVenmo !== false,
    togZelle: p.togZelle !== false,
    togCashApp: p.togCashApp !== false,
    togOther: p.togOther !== false,
  };
}

const payment = loadPayment();

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
  tipPct: parseFloat(localStorage.getItem('sp_tip') ?? '') || 18,
  tipBase: 'pre' as TipBase,
  taxIncluded: true,
  roundUp: false,
  payer: 'me' as Payer,
  imPartOfBill: true,
  history: [] as Bill[],
  viewingBillId: null as number | null,
  billSavedThisSession: false,
  deleteArmed: false,
  deleteTimer: null as ReturnType<typeof setTimeout> | null,
  payment,
  payToggles: {
    Venmo: payment.togVenmo,
    Zelle: payment.togZelle,
    CashApp: payment.togCashApp,
    Other: payment.togOther,
  },
  tipPresets: (safeParse('sp_tipPresets', null) || [15, 18, 20]) as number[],
};

export function getBillTotals() {
  const sub = state.splitMode === 'even'
    ? state.quickTotalAmt
    : state.items.reduce((s, it) => s + (it.price || 0), 0);
  const tax = state.splitMode === 'even' ? state.quickTaxAmt : state.taxAmt;
  const tipOn = state.tipBase === 'post' ? sub + tax : sub;
  const tip = tipOn * (state.tipPct / 100);
  return { sub, tax, tip, total: sub + tax + tip };
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
