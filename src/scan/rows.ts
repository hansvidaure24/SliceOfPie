import type { OcrLine } from './engine';

export interface OcrSegment {
  poly: [number, number][];
  text: string;
  score: number;
}

type Box = [number, number, number, number];

function bounds(poly: [number, number][]): Box {
  const xs = poly.map(p => p[0]);
  const ys = poly.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Angle of the quad's longest edge, folded into (-45°, 45°], with its length.
// Detection boxes hug the text, so this is the text's baseline tilt.
function tilt(poly: [number, number][]): { angle: number; len: number } {
  let best = { angle: 0, len: 0 };
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > best.len) {
      let angle = Math.atan2(y1 - y0, x1 - x0);
      while (angle > Math.PI / 4) angle -= Math.PI / 2;
      while (angle <= -Math.PI / 4) angle += Math.PI / 2;
      best = { angle, len };
    }
  }
  return best;
}

// Length-weighted median tilt across segments, so a few odd boxes don't skew it
function receiptTilt(polys: [number, number][][]): number {
  const tilts = polys.map(tilt).filter(t => t.len > 0).sort((a, b) => a.angle - b.angle);
  const half = tilts.reduce((s, t) => s + t.len, 0) / 2;
  let acc = 0;
  for (const t of tilts) {
    acc += t.len;
    if (acc >= half) return t.angle;
  }
  return 0;
}

// Detection models return one box per text run, so "Burger ....... 12.50" can
// arrive as two segments. Undo the photo's tilt, then group segments whose
// vertical centers sit within half a line height of each other into one line,
// read left to right. Without the tilt correction, a few degrees of rotation
// across a wide receipt is enough to pair a price with the wrong item.
export function mergeRows(segments: OcrSegment[]): OcrLine[] {
  const kept = segments.filter(s => s.text.trim() && s.poly.length);
  const angle = receiptTilt(kept.map(s => s.poly));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const placed = kept.map(s => {
    // Rotate the quad by -angle so text runs horizontally
    const flat = s.poly.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos] as [number, number]);
    const [fx0, fy0, , fy1] = bounds(flat);
    return { ...s, box: bounds(s.poly), x: fx0, cy: (fy0 + fy1) / 2, h: fy1 - fy0 };
  }).sort((a, b) => a.cy - b.cy);

  const rows: { cy: number; h: number; parts: typeof placed }[] = [];
  for (const seg of placed) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(seg.cy - row.cy) < Math.min(seg.h, row.h) / 2) {
      row.parts.push(seg);
      // Running average absorbs any leftover curl in the paper
      row.cy = (row.cy * (row.parts.length - 1) + seg.cy) / row.parts.length;
      row.h = Math.max(row.h, seg.h);
    } else {
      rows.push({ cy: seg.cy, h: seg.h, parts: [seg] });
    }
  }

  return rows.map(({ parts }) => {
    parts.sort((a, b) => a.x - b.x);
    return {
      text: parts.map(p => p.text.trim()).join(' '),
      score: Math.min(...parts.map(p => p.score)),
      box: [
        Math.min(...parts.map(p => p.box[0])),
        Math.min(...parts.map(p => p.box[1])),
        Math.max(...parts.map(p => p.box[2])),
        Math.max(...parts.map(p => p.box[3])),
      ],
    };
  });
}
