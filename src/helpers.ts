// Small page helpers shared by every screen

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
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

export function defaultLabel(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  return months[d.getMonth()] + ' ' + d.getDate() + ' bill';
}
