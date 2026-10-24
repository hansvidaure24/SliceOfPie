import { $, esc } from './helpers';
import type { Breakdown } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 160;
const CX = 80;
const CY = 80;
const RADIUS = 70;
const START_ANGLE = -Math.PI / 2;
const DURATION = 600;

function arcPath(startAngle: number, endAngle: number): string {
  const x1 = CX + RADIUS * Math.cos(startAngle);
  const y1 = CY + RADIUS * Math.sin(startAngle);
  const x2 = CX + RADIUS * Math.cos(endAngle);
  const y2 = CY + RADIUS * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${CX},${CY} L${x1},${y1} A${RADIUS},${RADIUS} 0 ${large},1 ${x2},${y2} Z`;
}

interface Slice extends Breakdown {
  frac: number;
}

let animFrame = 0;

export function renderPieChart(breakdown: Breakdown[]): void {
  cancelAnimationFrame(animFrame);
  const total = breakdown.reduce((sum, b) => sum + b.amount, 0);
  if (total === 0) { $('pieChartWrap').innerHTML = ''; return; }

  const slices: Slice[] = breakdown
    .filter(b => b.amount > 0)
    .map(b => ({ ...b, frac: b.amount / total }));

  // Cumulative angle offsets for each slice
  const offsets: number[] = [];
  let cumulative = 0;
  for (const slice of slices) {
    offsets.push(cumulative);
    cumulative += slice.frac;
  }

  const labelsSvg = slices.map((slice, i) => {
    if (slice.frac <= 0.08) return '';
    const midAngle = START_ANGLE + (offsets[i] + slice.frac / 2) * Math.PI * 2;
    const labelRadius = RADIUS * 0.55;
    const lx = CX + labelRadius * Math.cos(midAngle);
    const ly = CY + labelRadius * Math.sin(midAngle);
    return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central"
      fill="#fff" font-size="11" font-weight="700" style="pointer-events:none;opacity:0"
      class="pie-label">${Math.round(slice.frac * 100)}%</text>`;
  }).join('');

  const legendHtml = slices.map(slice =>
    `<span class="pie-legend-item"><span class="pie-legend-dot" style="background:${slice.color}"></span>${esc(slice.name)}</span>`
  ).join('');

  // Single-person: no animation needed, just a circle
  if (slices.length === 1) {
    $('pieChartWrap').innerHTML = `
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
        <circle cx="${CX}" cy="${CY}" r="${RADIUS}" fill="${slices[0].color}" class="pie-slice-circle"/>
        ${labelsSvg}
      </svg>
      <div class="pie-legend">${legendHtml}</div>`;
    setTimeout(() => {
      $('pieChartWrap').querySelectorAll<SVGTextElement>('.pie-label').forEach(el => el.style.opacity = '1');
    }, DURATION);
    return;
  }

  // Multi-slice: animate a clockwise sweep
  const pathEls: SVGPathElement[] = [];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(SIZE));
  svg.setAttribute('height', String(SIZE));
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('aria-hidden', 'true');

  for (const slice of slices) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', slice.color);
    path.setAttribute('d', `M${CX},${CY} Z`);
    svg.appendChild(path);
    pathEls.push(path);
  }

  // Labels go in a separate group so they render on top
  const labelGroup = document.createElementNS(SVG_NS, 'g');
  labelGroup.innerHTML = labelsSvg;
  svg.appendChild(labelGroup);

  const wrap = $('pieChartWrap');
  wrap.innerHTML = '';
  wrap.appendChild(svg);

  const legendDiv = document.createElement('div');
  legendDiv.className = 'pie-legend';
  legendDiv.innerHTML = legendHtml;
  wrap.appendChild(legendDiv);

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    for (let i = 0; i < slices.length; i++) {
      const sliceStart = START_ANGLE + offsets[i] * Math.PI * 2;
      const sliceEnd = START_ANGLE + (offsets[i] + slices[i].frac) * Math.PI * 2;
      pathEls[i].setAttribute('d', arcPath(sliceStart, sliceEnd));
    }
    svg.querySelectorAll<SVGTextElement>('.pie-label').forEach(el => el.style.opacity = '1');
    return;
  }

  let startTime: number | null = null;

  function animate(timestamp: number): void {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / DURATION, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const sweep = ease * Math.PI * 2;

    for (let i = 0; i < slices.length; i++) {
      const sliceStart = START_ANGLE + offsets[i] * Math.PI * 2;
      const sliceEnd = START_ANGLE + (offsets[i] + slices[i].frac) * Math.PI * 2;
      const currentEnd = Math.min(START_ANGLE + sweep, sliceEnd);
      const currentStart = Math.min(sliceStart, START_ANGLE + sweep);

      if (currentStart >= currentEnd) {
        pathEls[i].setAttribute('d', `M${CX},${CY} Z`);
      } else {
        pathEls[i].setAttribute('d', arcPath(currentStart, currentEnd));
      }
    }

    if (progress < 1) {
      animFrame = requestAnimationFrame(animate);
    } else {
      svg.querySelectorAll<SVGTextElement>('.pie-label').forEach(el => el.style.opacity = '1');
    }
  }

  animFrame = requestAnimationFrame(animate);
}
