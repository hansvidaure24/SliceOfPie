// Downloads the pinned OCR models into public/ocr/ so the app never fetches
// them from a third-party CDN at runtime, and checks the installed ONNX Runtime
// matches ocr-assets.json (Vite bundles its wasm into dist/assets).
// Runs before dev and build. Pass --bench to also fetch the benchmark-only models.
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(await readFile(join(root, 'src/scan/ocr-assets.json'), 'utf8'));
const bench = process.argv.includes('--bench');

const ortPkg = JSON.parse(await readFile(join(root, 'node_modules/onnxruntime-web/package.json'), 'utf8'));
if (ortPkg.version !== assets.ortVersion) {
  console.error(`[ocr] onnxruntime-web ${ortPkg.version} is installed but ocr-assets.json pins ${assets.ortVersion}`);
  process.exit(1);
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function fetchModel(name, dir) {
  const { sha256: want } = assets.models[name];
  const dest = join(dir, name + '.tar');
  if (await exists(dest) && await sha256(dest) === want) return;

  const url = `${assets.modelBaseUrl}${name}_onnx_infer.tar`;
  console.log(`[ocr] downloading ${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`${name}: sha256 mismatch (got ${got})`);
  await mkdir(dir, { recursive: true });
  await writeFile(dest, buf);
}

const wasmSrc = join(root, 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
// The app sizes its first-download progress bar from this number
if ((await stat(wasmSrc)).size !== assets.ortWasmBytes) {
  console.error(`[ocr] ort-wasm-simd-threaded.wasm size changed; update ortWasmBytes in ocr-assets.json`);
  process.exit(1);
}

const modelsDir = join(root, 'public/ocr/models');
await fetchModel(assets.app.det, modelsDir);
await fetchModel(assets.app.rec, modelsDir);

if (bench) {
  for (const set of assets.bench) {
    await fetchModel(set.det, join(root, 'bench/models'));
    await fetchModel(set.rec, join(root, 'bench/models'));
  }
}
