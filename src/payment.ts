import { $, setToggle } from './helpers';
import { state } from './state';

const PAY_FIELDS: [keyof typeof state.payment, string][] = [
  ['name', 'payName'],
  ['venmo', 'payVenmo'],
  ['zelle', 'payZelle'],
  ['cashApp', 'payCashApp'],
  ['otherLabel', 'payOtherLabel'],
  ['otherValue', 'payOtherValue'],
];

export function restorePaymentFields(): void {
  PAY_FIELDS.forEach(([key, id]) => {
    const val = state.payment[key];
    if (val) ($(id) as HTMLInputElement).value = String(val);
  });
}

export function savePayment(): void {
  const data = {} as Record<string, string | boolean>;
  PAY_FIELDS.forEach(([key, id]) => data[key] = ($(id) as HTMLInputElement).value.trim());
  Object.entries(state.payToggles).forEach(([k, v]) => data['tog' + k] = v);
  state.payment = data as unknown as typeof state.payment;
  localStorage.setItem('sp_payment', JSON.stringify(state.payment));
  const me = state.people.find(p => p.isMe);
  if (me && state.payment.name) me.name = state.payment.name;
}

export function togglePay(key: keyof typeof state.payToggles): void {
  state.payToggles[key] = !state.payToggles[key];
  setToggle('tog' + key, state.payToggles[key]);
  savePayment();
}

export function getPaymentLines(): string[] {
  const pay = state.payment;
  const tog = state.payToggles;
  const lines: string[] = [];

  if (tog.Venmo && pay.venmo) lines.push('Venmo: ' + pay.venmo);
  if (tog.Zelle && pay.zelle) lines.push('Zelle: ' + pay.zelle);
  if (tog.CashApp && pay.cashApp) lines.push('Cash App: ' + pay.cashApp);
  if (tog.Other && pay.otherLabel && pay.otherValue) lines.push(pay.otherLabel + ': ' + pay.otherValue);

  if (lines.length === 0) return [];
  const sendTo = pay.name ? 'Send to ' + pay.name + ':' : 'Send to:';
  return ['', sendTo, ...lines];
}
