import { $, setToggle } from './helpers';
import { state } from './state';
import { save } from './storage';

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
  save('sp_payment', JSON.stringify(state.payment));
  const me = state.people.find(p => p.isMe);
  if (me && state.payment.name) me.name = state.payment.name;
}

export function togglePay(key: keyof typeof state.payToggles): void {
  state.payToggles[key] = !state.payToggles[key];
  setToggle('tog' + key, state.payToggles[key]);
  savePayment();
}

function paymentMethods(withLinks: boolean): string[] {
  const pay = state.payment;
  const tog = state.payToggles;
  const lines: string[] = [];

  if (tog.Venmo && pay.venmo) {
    const handle = pay.venmo.replace(/^@/, '').replace(/^https?:\/\/venmo\.com\/u\//i, '');
    lines.push(withLinks
      ? 'Venmo: https://venmo.com/u/' + encodeURIComponent(handle)
      : 'Venmo: @' + handle);
  }
  if (tog.Zelle && pay.zelle) lines.push('Zelle: ' + pay.zelle);
  if (tog.CashApp && pay.cashApp) {
    const tag = pay.cashApp.replace(/^\$/, '').replace(/^https?:\/\/cash\.app\/\$?/i, '');
    lines.push(withLinks
      ? 'Cash App: https://cash.app/$' + encodeURIComponent(tag)
      : 'Cash App: $' + tag);
  }
  if (tog.Other && pay.otherLabel && pay.otherValue) lines.push(pay.otherLabel + ': ' + pay.otherValue);
  return lines;
}

export function getPaymentLines(): string[] {
  const methods = paymentMethods(true);
  if (!methods.length) return [];
  const sendTo = state.payment.name ? 'Send to ' + state.payment.name + ':' : 'Send to:';
  return ['', sendTo, ...methods];
}

export function getPaymentLinesShort(): string[] {
  const methods = paymentMethods(false);
  if (!methods.length) return [];
  const sendTo = state.payment.name ? 'Send to ' + state.payment.name + ':' : 'Send to:';
  return ['', sendTo, ...methods];
}
