// localStorage throws when the browser blocks site data (e.g. "block all
// cookies") or the quota is full. Everything kept here is a convenience
// (settings, the bill in progress), so a failure falls back to the default
// instead of stopping the app.

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// False when it couldn't be kept
export function save(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* nothing we can do, and nothing to lose */ }
}

// A saved JSON value, or the fallback when it's missing or unreadable
export function loadJSON<T>(key: string, fallback: T): T {
  const raw = load(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    remove(key);
    return fallback;
  }
}
