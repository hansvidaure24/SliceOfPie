import { personColor } from './colors';
import type { Bill, BillPerson } from './types';

// The bill export file, kept free of the page so it can be tested on its own

const FORMAT = 'sliceofpie-bills';

export function writeBackup(bills: Bill[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), bills }, null, 2);
}

// The bills in an export file, checked field by field. Throws if it isn't one.
// Names and labels are escaped wherever they're shown; colors go into a style,
// so anything that isn't a plain hex color is replaced.
export function readBackup(text: string): Bill[] {
  const data = JSON.parse(text) as { format?: unknown; bills?: unknown };
  if (data?.format !== FORMAT || !Array.isArray(data.bills)) throw new Error('not an export');
  return data.bills.flatMap((raw): Bill[] => {
    const b = raw as Record<string, unknown>;
    if (!Number.isFinite(b.id) || typeof b.date !== 'string' || isNaN(Date.parse(b.date))
      || typeof b.label !== 'string' || !Number.isFinite(b.total) || !Array.isArray(b.people)) return [];
    const people = (b.people as Record<string, unknown>[]).flatMap((p, i): BillPerson[] =>
      typeof p?.name === 'string' && Number.isFinite(p.amount)
        ? [{
          name: p.name.slice(0, 40),
          amount: p.amount as number,
          color: typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : personColor(i),
          paid: p.paid === true,
        }]
        : []);
    if (!people.length) return [];
    return [{
      id: b.id as number,
      date: b.date,
      label: b.label.slice(0, 80),
      total: b.total as number,
      tipPct: Number.isFinite(b.tipPct) ? b.tipPct as number : 0,
      splitMode: b.splitMode === 'item' ? 'item' : 'even',
      ...(typeof b.merchant === 'string' ? { merchant: b.merchant.slice(0, 80) } : {}),
      ...(typeof b.receiptDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.receiptDate) ? { receiptDate: b.receiptDate } : {}),
      payerName: typeof b.payerName === 'string' ? b.payerName.slice(0, 40) : people[0].name,
      people,
    }];
  });
}
