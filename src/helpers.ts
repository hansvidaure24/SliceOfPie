export const COLORS = [
  '#C0392B', '#2E86C1', '#D4A017', '#27AE60',
  '#8E44AD', '#16A085', '#D35400', '#2C3E50',
] as const;

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
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

const ZERO_DECIMAL = new Set(['¥', '₩', '₫', 'CL$', 'Ft', 'Rp']);

// Currencies whose receipts usually print dates month-first (03/04 = March 4)
const MONTH_FIRST = new Set(['$', '₱']);

// Hints for reading a scanned receipt in the user's currency
export function receiptHints(): { zeroDecimal: boolean; monthFirst: boolean } {
  return { zeroDecimal: ZERO_DECIMAL.has(currencySymbol), monthFirst: MONTH_FIRST.has(currencySymbol) };
}

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

export function confirmDialog(msg: string, sub = '', labels: { yes?: string; no?: string } = {}): Promise<boolean> {
  return openDialog(msg, sub, labels, null).then(result => result !== null);
}

// The same sheet with a text field; resolves to the text, or null when cancelled
export function promptDialog(msg: string, value: string, labels: { yes?: string; no?: string } = {}): Promise<string | null> {
  return openDialog(msg, '', labels, value);
}

function openDialog(msg: string, sub: string, labels: { yes?: string; no?: string }, value: string | null): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = $('confirmOverlay');
    const box = overlay.querySelector('.confirm-box') as HTMLElement;
    const yesBtn = $('confirmYes');
    const noBtn = $('confirmNo');
    const input = $('confirmInput') as HTMLInputElement;
    yesBtn.textContent = labels.yes ?? 'Confirm';
    noBtn.textContent = labels.no ?? 'Cancel';
    // An empty label means there's nothing to choose, just a message to close
    noBtn.hidden = labels.no === '';
    $('confirmMsg').textContent = msg;
    $('confirmSub').textContent = sub;
    $('confirmSub').style.display = sub ? '' : 'none';
    input.hidden = value === null;
    input.value = value ?? '';
    overlay.classList.toggle('prompt', value !== null);
    box.setAttribute('role', value === null ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'confirmMsg');
    box.setAttribute('aria-describedby', 'confirmSub');
    overlay.classList.add('show');
    if (value === null) {
      (noBtn.hidden ? yesBtn : noBtn).focus();
    } else {
      input.focus();
      input.select();
    }
    const focusable = [value === null ? null : input, noBtn.hidden ? null : noBtn, yesBtn].filter(Boolean) as HTMLElement[];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        cleanup(input.value);
        return;
      }
      if (e.key !== 'Tab') return;
      const idx = focusable.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      focusable[(idx + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    };
    overlay.addEventListener('keydown', onKey);
    // Tapping the dimmed area outside the sheet cancels
    const onScrim = (e: MouseEvent) => { if (e.target === overlay) cleanup(null); };
    overlay.addEventListener('click', onScrim);
    const cleanup = (result: string | null) => {
      overlay.classList.remove('show');
      overlay.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onScrim);
      yesBtn.onclick = null;
      noBtn.onclick = null;
      resolve(result);
    };
    yesBtn.onclick = () => cleanup(input.value);
    noBtn.onclick = () => cleanup(null);
  });
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
  return months[d.getMonth()] + ' ' + d.getDate() + ' bill';
}
