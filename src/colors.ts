// One color per person, in seat order. Chosen so every pair stays distinct
// with deuteranopia and protanopia too, and every color shows on both themes.
export const COLORS = [
  '#C0392B', '#6C5CE7', '#17BECF', '#E69F00',
  '#C2185B', '#1F77B4', '#7F8C8D', '#D35400',
] as const;

export function personColor(i: number): string {
  return COLORS[i % COLORS.length];
}

// Black or white, whichever reads better on a person's color
export function inkOn(hex: string): string {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l = lum(hex);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / (lum('#1A0E08') + 0.05)) ? '#fff' : '#1A0E08';
}
