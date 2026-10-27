import { load, save } from './storage';

export type ThemePref = 'system' | 'light' | 'dark';

export function getThemePref(): ThemePref {
  return (load('sp_theme') as ThemePref) || 'system';
}

export function setThemePref(pref: ThemePref): void {
  save('sp_theme', pref);
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
  if (metaTheme) metaTheme.setAttribute('content', resolved === 'light' ? '#F5EDE4' : '#3A2418');
}
