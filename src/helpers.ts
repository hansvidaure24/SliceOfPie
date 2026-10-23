export const COLORS = [
  '#C0392B', '#2E86C1', '#D4A017', '#27AE60',
  '#8E44AD', '#16A085', '#D35400', '#2C3E50',
] as const;

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export function fmt(n: number): string {
  return '$' + n.toFixed(2);
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function setToggle(id: string, on: boolean): void {
  const el = $(id);
  el.classList.toggle('on', on);
  el.setAttribute('aria-checked', String(on));
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

export function defaultLabel(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  return months[d.getMonth()] + ' ' + d.getDate() + ' food';
}
