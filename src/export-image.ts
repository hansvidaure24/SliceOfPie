import { fmt, showToast, prefersCopy } from './helpers';
import { state, getBillTotals, isPayer, tipLabel } from './state';
import { calcOwes } from './bill';
import { billLabel } from './history';

const PAD = 40;

function getColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return { bg: v('--bg2'), surface: v('--surface'), cherry: v('--cherry'), crust: v('--crust'), cream: v('--text'), muted: v('--muted') };
}

interface Line { text: string; color: string; size: number; bold: boolean; y: number }

export async function exportImage(): Promise<void> {
  await document.fonts.ready;
  const COLORS = getColors();
  const { sub, tax, tip, total: rawTotal } = getBillTotals();
  const breakdown = calcOwes();
  const total = state.roundUp ? breakdown.reduce((s, e) => s + e.amount, 0) : rawTotal;
  const label = billLabel();

  const lines: Line[] = [];
  let y = PAD + 10;

  const add = (text: string, opts: { color?: string; size?: number; bold?: boolean; gap?: number } = {}) => {
    lines.push({ text, color: opts.color || COLORS.cream, size: opts.size || 16, bold: opts.bold ?? false, y });
    y += (opts.size || 16) + (opts.gap ?? 8);
  };

  add('SliceOfPie', { color: COLORS.crust, size: 22, bold: true, gap: 4 });
  add(label, { color: COLORS.muted, size: 14, gap: 20 });

  add('Subtotal  ' + fmt(sub), { size: 15 });
  if (tax > 0) add('Tax  ' + fmt(tax), { size: 15 });
  add(tipLabel() + '  ' + fmt(tip), { size: 15, gap: 12 });

  y += 4;
  add('Total  ' + fmt(total), { color: COLORS.cream, size: 20, bold: true, gap: 20 });

  breakdown.forEach((entry, i) => {
    const paid = isPayer(i);
    const owes = paid ? '(paid)' : 'owes ' + fmt(entry.amount);
    add(entry.name + '  ' + owes, { color: entry.color, size: 15, gap: 6 });
  });

  y += 16;
  add('slice-of-pie-xi.vercel.app', { color: COLORS.muted, size: 12, gap: 0 });

  // Measure max text width to auto-size canvas
  const measure = document.createElement('canvas').getContext('2d')!;
  let maxW = 0;
  for (const line of lines) {
    measure.font = (line.bold ? '700 ' : '400 ') + line.size + 'px Inter, system-ui, sans-serif';
    maxW = Math.max(maxW, measure.measureText(line.text).width);
  }
  const W = Math.ceil(maxW) + PAD * 2 + 32;

  const H = y + PAD;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  ctx.fillStyle = COLORS.bg;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  ctx.fillStyle = COLORS.surface;
  roundRect(ctx, PAD - 10, PAD - 10, W - 2 * PAD + 20, H - 2 * PAD + 20, 16);
  ctx.fill();

  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = (line.bold ? '700 ' : '400 ') + line.size + 'px Inter, system-ui, sans-serif';
    ctx.fillText(line.text, PAD + 8, line.y + line.size);
  }

  canvas.toBlob(async blob => {
    if (!blob) { showToast('Export failed'); return; }
    // Phones share the picture; computers copy it, like the text
    if (navigator.share && !prefersCopy()) {
      try {
        await navigator.share({ files: [new File([blob], 'bill.png', { type: 'image/png' })] });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Image copied. Paste it into any chat.');
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bill.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast('Image downloaded');
    }
  }, 'image/png');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
