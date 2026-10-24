import { load, save } from './storage';

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

let currencySymbol = load('sp_currency') || '$';

export function setCurrency(symbol: string): void {
  currencySymbol = symbol;
  save('sp_currency', symbol);
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

// Digits after the decimal point: 2 for cents, 0 for yen, won and the like
export function currencyDecimals(): number {
  return ZERO_DECIMAL.has(currencySymbol) ? 0 : 2;
}

// An amount in whole cents (or whole yen, won...), half a cent rounding away
// from zero. 178.365 is 178.36499999... as a float, so it's cleaned up before
// rounding; the total line and the shares that add up to it then always agree.
export function toUnits(n: number): number {
  const scaled = Number((Math.abs(n) * 10 ** currencyDecimals()).toFixed(6));
  return Math.sign(n) * Math.round(scaled) || 0;
}

// A discount reads "-$6.00", not "$-6.00"
export function fmt(n: number): string {
  const units = toUnits(n);
  const digits = (Math.abs(units) / 10 ** currencyDecimals()).toFixed(currencyDecimals());
  return (units < 0 ? '-' : '') + currencySymbol + digits;
}
