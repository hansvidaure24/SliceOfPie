export const COLORS = [
  '#C0392B', '#2E86C1', '#D4A017', '#27AE60',
  '#8E44AD', '#16A085', '#D35400', '#2C3E50',
] as const;

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'MXN', symbol: 'MX$' },
  { code: 'PHP', symbol: '₱' },
] as const;

export { CURRENCIES };

let currencySymbol = localStorage.getItem('sp_currency') || '$';

export function setCurrency(symbol: string): void {
  currencySymbol = symbol;
  localStorage.setItem('sp_currency', symbol);
}

export function getCurrency(): string {
  return currencySymbol;
}

const ZERO_DECIMAL = new Set(['¥']);

export function fmt(n: number): string {
  return currencySymbol + n.toFixed(ZERO_DECIMAL.has(currencySymbol) ? 0 : 2);
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function setToggle(id: string, on: boolean): void {
  const el = $(id);
  el.classList.toggle('on', on);
  el.setAttribute('aria-checked', String(on));
}

export function tap(): void {
  navigator.vibrate?.(10);
}

// Force reflow between remove/add so the browser sees two distinct states
export function pulse(el: HTMLElement): void {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

export function showToast(msg: string): void {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

export async function shareText(text: string): Promise<void> {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch { /* user cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  } catch {
    showToast('Could not copy');
  }
}

export type ThemePref = 'system' | 'light' | 'dark';

export function getThemePref(): ThemePref {
  return (localStorage.getItem('sp_theme') as ThemePref) || 'system';
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem('sp_theme', pref);
  applyTheme();
}

export function applyTheme(): void {
  const pref = getThemePref();
  let resolved: 'light' | 'dark';
  if (pref === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } else {
    resolved = pref;
  }
  if (resolved === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', resolved === 'light' ? '#FFFFFF' : '#3A2418');
}

export function defaultLabel(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  return months[d.getMonth()] + ' ' + d.getDate() + ' food';
}
