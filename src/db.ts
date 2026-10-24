import type { Bill } from './types';
import { load, remove } from './storage';

const DB_NAME = 'sliceofpie';
const DB_VERSION = 1;
const STORE = 'bills';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

export async function getAllBills(): Promise<Bill[]> {
  const store = await getStore('readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const bills = (req.result as Bill[]).sort((a, b) => b.id - a.id);
      resolve(bills);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putBill(bill: Bill): Promise<void> {
  const store = await getStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(bill);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBillFromDB(id: number): Promise<void> {
  const store = await getStore('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// One-time migration: move bills from localStorage to IndexedDB
export async function migrateFromLocalStorage(): Promise<Bill[]> {
  const raw = load('sp_history');
  if (!raw) return [];

  let bills: Bill[];
  try { bills = JSON.parse(raw); }
  catch { remove('sp_history'); return []; }

  if (!Array.isArray(bills) || !bills.length) return [];

  const store = await getStore('readwrite');
  await Promise.all(bills.map(b => new Promise<void>((resolve, reject) => {
    const req = store.put(b);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  })));

  remove('sp_history');
  return bills;
}

export async function loadHistory(): Promise<Bill[]> {
  let bills = await getAllBills();
  if (!bills.length && load('sp_history')) {
    bills = await migrateFromLocalStorage();
  }
  return bills;
}
