import assets from '../src/scan/ocr-assets.json';
import { createPaddleEngine, modelsFromAssets, paddleEngine } from '../src/scan/engine-paddle';
import { tesseractEngine } from '../src/scan/engine-tesseract';
import { linesToText, parseReceipt } from '../src/scan/parse';
import type { OcrEngine } from '../src/scan/engine';

const texts = import.meta.glob<string>('../test/fixtures/receipts/*.txt', { query: '?raw', import: 'default', eager: true });

interface Sample { fixture: string; variant: string; truth: string; blob: Blob }
interface Row { engine: string; fixture: string; variant: string; cer: number; parseOk: boolean; amountsOk: boolean; priceRecall: number; ms: number; text: string }

const $ = (id: string) => document.getElementById(id)!;

// Deterministic noise so runs are comparable
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function normalize(text: string): string {
  return text.replace(/\r/g, '').split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

type Variant = { name: string; font: number; ink: string; paper: string; angle: number; blur: number; noise: number; quality: number; table: boolean };

// Font sizes are text height in image pixels. A phone photo of a receipt
// filling the frame gives roughly 40–50px; 18px is a downscaled or distant shot.
const VARIANTS: Variant[] = [
  { name: 'clean', font: 32, ink: '#111', paper: '#fff', angle: 0, blur: 0, noise: 0, quality: 0.95, table: false },
  { name: 'photo', font: 44, ink: '#222', paper: '#f4f1ea', angle: 3.5, blur: 1.2, noise: 18, quality: 0.75, table: true },
  { name: 'faded', font: 44, ink: '#777', paper: '#e2ded5', angle: -6, blur: 1.6, noise: 30, quality: 0.6, table: true },
  { name: 'small', font: 18, ink: '#333', paper: '#f4f1ea', angle: 2, blur: 0.6, noise: 12, quality: 0.7, table: true },
];

async function render(text: string, v: Variant, seed: number): Promise<Blob> {
  const lines = text.replace(/\r/g, '').split('\n');
  const font = `${v.font}px "Courier New", monospace`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const paperW = Math.ceil(Math.max(...lines.map(l => measure.measureText(l).width))) + v.font * 2;
  const lineH = Math.round(v.font * 1.35);
  const paperH = lines.length * lineH + v.font * 2;

  const pad = v.table ? Math.round(paperW * 0.25) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = paperW + pad * 2;
  canvas.height = paperH + pad * 2;
  const g = canvas.getContext('2d')!;

  // Wooden-ish table with an uneven light falloff
  g.fillStyle = v.table ? '#6b5444' : v.paper;
  g.fillRect(0, 0, canvas.width, canvas.height);

  g.save();
  g.translate(canvas.width / 2, canvas.height / 2);
  g.rotate((v.angle * Math.PI) / 180);
  g.translate(-paperW / 2, -paperH / 2);
  g.fillStyle = v.paper;
  g.fillRect(0, 0, paperW, paperH);
  g.filter = v.blur ? `blur(${v.blur}px)` : 'none';
  g.fillStyle = v.ink;
  g.font = font;
  g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, v.font, v.font + i * lineH));
  g.restore();

  if (v.table) {
    const light = g.createRadialGradient(canvas.width * 0.3, canvas.height * 0.2, 0, canvas.width * 0.3, canvas.height * 0.2, canvas.width * 1.2);
    light.addColorStop(0, 'rgba(255,255,255,0.12)');
    light.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = light;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (v.noise) {
    const rand = rng(seed);
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * v.noise * 2;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  }

  return new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', v.quality));
}

// Every price and the tax match, ignoring item names (what actually changes who owes what)
function amountsOk(ocrText: string, truthText: string): boolean {
  const got = parseReceipt(ocrText), want = parseReceipt(truthText);
  const prices = (r: typeof got) => r.items.map(i => i.price).sort((a, b) => a - b).join();
  return prices(got) === prices(want) && got.tax === want.tax;
}

function priceRecall(ocrText: string, truthText: string): number {
  const want = parseReceipt(truthText).items.map(i => i.price);
  if (!want.length) return 1;
  const got = parseReceipt(ocrText).items.map(i => i.price);
  let hit = 0;
  for (const p of want) {
    const k = got.indexOf(p);
    if (k >= 0) { hit++; got.splice(k, 1); }
  }
  return hit / want.length;
}

async function runEngine(name: string, engine: OcrEngine, samples: Sample[], rows: Row[]): Promise<{ name: string; warmMs: number }> {
  $('status').textContent = `Starting ${name}...`;
  let warmMs = 0;
  if ('warm' in engine) {
    const t = performance.now();
    await (engine as { warm(): Promise<number> }).warm();
    warmMs = performance.now() - t;
  } else {
    // Tesseract loads its worker and language data on first recognize; time a throwaway run
    const t = performance.now();
    await engine.recognize(samples[0].blob);
    warmMs = performance.now() - t;
  }
  for (const [i, s] of samples.entries()) {
    $('status').textContent = `${name}: ${i + 1}/${samples.length}`;
    const t = performance.now();
    const text = linesToText(await engine.recognize(s.blob));
    const ms = performance.now() - t;
    const truth = normalize(s.truth);
    const got = normalize(text);
    rows.push({
      engine: name,
      fixture: s.fixture,
      variant: s.variant,
      cer: levenshtein(got, truth) / truth.length,
      parseOk: JSON.stringify(parseReceipt(text)) === JSON.stringify(parseReceipt(s.truth)),
      amountsOk: amountsOk(text, s.truth),
      priceRecall: priceRecall(text, s.truth),
      ms,
      text: got,
    });
  }
  return { name, warmMs };
}

function pct(n: number): string { return (n * 100).toFixed(1) + '%'; }

function report(rows: Row[], warm: { name: string; warmMs: number }[], sizes: Record<string, number>) {
  const engines = warm.map(w => w.name);
  const summary = engines.map(e => {
    const r = rows.filter(x => x.engine === e);
    const by = (v: string) => r.filter(x => x.variant === v);
    const meanCer = (xs: Row[]) => xs.reduce((s, x) => s + x.cer, 0) / xs.length;
    return {
      engine: e,
      modelMB: sizes[e] ? +(sizes[e] / 1e6).toFixed(1) : null,
      warmMs: Math.round(warm.find(w => w.name === e)!.warmMs),
      cer: meanCer(r),
      cerByVariant: Object.fromEntries(VARIANTS.map(v => [v.name, meanCer(by(v.name))])),
      parseOk: r.filter(x => x.parseOk).length + '/' + r.length,
      amountsOk: r.filter(x => x.amountsOk).length + '/' + r.length,
      priceRecall: r.reduce((s, x) => s + x.priceRecall, 0) / r.length,
      medianMs: Math.round(r.map(x => x.ms).sort((a, b) => a - b)[Math.floor(r.length / 2)]),
    };
  });

  $('summary').innerHTML = `<table><tr><th>Engine</th><th>Models</th><th>Start</th><th>CER</th>${VARIANTS.map(v => `<th>CER ${v.name}</th>`).join('')}<th>Parse exact</th><th>Amounts exact</th><th>Price recall</th><th>Median scan</th></tr>${
    summary.map(s => `<tr><td>${s.engine}</td><td>${s.modelMB ?? '-'} MB</td><td>${s.warmMs} ms</td><td>${pct(s.cer)}</td>${
      VARIANTS.map(v => `<td>${pct(s.cerByVariant[v.name])}</td>`).join('')}<td>${s.parseOk}</td><td>${s.amountsOk}</td><td>${pct(s.priceRecall)}</td><td>${s.medianMs} ms</td></tr>`).join('')
  }</table>`;

  $('detail').innerHTML = `<table><tr><th>Engine</th><th>Fixture</th><th>Variant</th><th>CER</th><th>Parse</th><th>Amounts</th><th>Prices</th><th>ms</th></tr>${
    rows.map(r => `<tr><td>${r.engine}</td><td>${r.fixture}</td><td>${r.variant}</td><td>${pct(r.cer)}</td><td class="${r.parseOk ? 'good' : 'bad'}">${r.parseOk ? 'yes' : 'no'}</td><td class="${r.amountsOk ? 'good' : 'bad'}">${r.amountsOk ? 'yes' : 'no'}</td><td>${pct(r.priceRecall)}</td><td>${Math.round(r.ms)}</td></tr>`).join('')
  }</table>`;

  (window as unknown as { __bench: unknown }).__bench = { summary, rows };
}

async function run() {
  ($('run') as HTMLButtonElement).disabled = true;
  const samples: Sample[] = [];
  let seed = 1;
  for (const [path, truth] of Object.entries(texts)) {
    const fixture = path.replace(/^.*\/(.+)\.txt$/, '$1');
    for (const v of VARIANTS) samples.push({ fixture, variant: v.name, truth, blob: await render(truth, v, seed++) });
  }
  $('images').innerHTML = '';
  for (const s of samples) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(s.blob);
    img.title = `${s.fixture} / ${s.variant}`;
    $('images').append(img);
  }

  const tiny = assets.bench[0];
  const tinyEngine = createPaddleEngine(modelsFromAssets(tiny.det, tiny.rec, '/bench/models/'));
  const sizes: Record<string, number> = {
    'PP-OCRv5 mobile + latin': assets.models[assets.app.det as keyof typeof assets.models].bytes + assets.models[assets.app.rec as keyof typeof assets.models].bytes,
    'PP-OCRv6 tiny': assets.models[tiny.det as keyof typeof assets.models].bytes + assets.models[tiny.rec as keyof typeof assets.models].bytes,
  };

  const rows: Row[] = [];
  const warm = [];
  warm.push(await runEngine('PP-OCRv5 mobile + latin', paddleEngine, samples, rows));
  paddleEngine.dispose();
  warm.push(await runEngine('PP-OCRv6 tiny', tinyEngine, samples, rows));
  tinyEngine.dispose();
  if (tesseractEngine.isAvailable()) warm.push(await runEngine('Tesseract 5 (eng)', tesseractEngine, samples, rows));

  report(rows, warm, sizes);
  $('status').textContent = 'Done';
  ($('run') as HTMLButtonElement).disabled = false;
}

$('run').addEventListener('click', () => {
  run().catch(err => { $('status').textContent = 'Failed: ' + (err as Error).message; console.error(err); });
});
