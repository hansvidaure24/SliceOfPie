export interface Person {
  name: string;
  isMe?: boolean;
}

export interface Item {
  name: string;
  price: number;
  assignees?: number[];
}

export interface BillPerson {
  name: string;
  amount: number;
  color: string;
  paid: boolean;
}

export interface Bill {
  id: number;
  date: string;
  label: string;
  total: number;
  tipPct: number;
  splitMode: 'even' | 'item';
  // From a scanned receipt, when found
  merchant?: string;
  receiptDate?: string;
  payerName: string;
  people: BillPerson[];
}

// What a scanned receipt said beyond the items, kept for the current bill
export interface ReceiptInfo {
  merchant: string | null;
  // ISO yyyy-mm-dd
  date: string | null;
  total: number | null;
  tip: number | null;
}

export interface Breakdown {
  name: string;
  amount: number;
  color: string;
}

export interface PaymentSettings {
  name: string;
  venmo: string;
  zelle: string;
  cashApp: string;
  otherLabel: string;
  otherValue: string;
  togVenmo: boolean;
  togZelle: boolean;
  togCashApp: boolean;
  togOther: boolean;
}

export type Payer = 'me' | number;
export type SplitMode = 'even' | 'item';
export type TipBase = 'pre' | 'post';
