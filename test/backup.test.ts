import { describe, it, expect } from 'vitest';
import { readBackup, writeBackup } from '../src/backup-format';
import { COLORS } from '../src/colors';
import type { Bill } from '../src/types';

const lunch: Bill = {
  id: 1729700000000,
  date: '2026-10-23T18:30:00.000Z',
  label: 'Taco Tuesday',
  total: 49.82,
  tipPct: 18,
  splitMode: 'item',
  merchant: 'Taqueria',
  receiptDate: '2026-10-23',
  payerName: 'Me',
  people: [
    { name: 'Me', amount: 31.62, color: '#C0392B', paid: true },
    { name: 'Carmine', amount: 8.62, color: '#6C5CE7', paid: false },
  ],
};

const file = (bills: unknown[]) => JSON.stringify({ format: 'sliceofpie-bills', version: 1, bills });

describe('the bills export file', () => {
  it('reads back exactly what was written', () => {
    expect(readBackup(writeBackup([lunch]))).toEqual([lunch]);
  });

  it('turns down anything that is not an export', () => {
    expect(() => readBackup('not json')).toThrow();
    expect(() => readBackup(JSON.stringify({ bills: [lunch] }))).toThrow();
    expect(() => readBackup(JSON.stringify({ format: 'sliceofpie-bills', bills: 'nope' }))).toThrow();
  });

  it('skips bills that are missing what the app needs', () => {
    const broken = [{ ...lunch, id: 'x' }, { ...lunch, date: 'whenever' }, { ...lunch, people: [] }, { ...lunch, total: null }];
    expect(readBackup(file([...broken, lunch]))).toEqual([lunch]);
  });

  it('never lets a color be anything but a plain hex color', () => {
    const sneaky = { ...lunch, people: [{ name: 'Jo', amount: 5, color: 'red;background:url(https://evil.example)', paid: false }] };
    expect(readBackup(file([sneaky]))[0].people[0].color).toBe(COLORS[0]);
  });

  it('fills in optional fields and trims overlong text', () => {
    const { merchant: _m, receiptDate: _r, tipPct: _t, ...bare } = lunch;
    const bill = readBackup(file([{ ...bare, label: 'x'.repeat(500), splitMode: 'weird', payerName: 42 }]))[0];
    expect(bill.label).toHaveLength(80);
    expect(bill.tipPct).toBe(0);
    expect(bill.splitMode).toBe('even');
    expect(bill.payerName).toBe('Me');
    expect(bill).not.toHaveProperty('merchant');
  });
});
