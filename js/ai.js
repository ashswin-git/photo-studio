// On-device AI: background removal (IMG.LY), object removal (LaMa), upscaling (Real-ESRGAN).
// Everything is lazy-loaded the first time a tool is used.
import { mk } from './render.js';

const IMGLY = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const ORT_VER = '1.31.1';
const ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/ort.wasm.min.mjs`;
export const LAMA_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
export const ESRGAN_URL = 'https://huggingface.co/JoPmt/Real_Esrgan_x2_Onnx_Tflite_Tfjs/resolve/main/ano_test/realesr-general-x4v3.onnx';
const threads = () => (self.crossOriginIsolated ? Math.min(8, Math.max(2, (navigator.hardwareConcurrency || 4) - 1)) : 1);

// ---------- background removal ----------
let imgly = null;
export async function cutout(blob, progress) {
  imgly = imgly || await import(IMGLY);
  const out = await imgly.removeBackground(blob, {
    progress: (k, c, t) => progress && progress(k.startsWith('fetch') ? 'Downloading background-removal model' : 'Removing background', t ? c / t : 0),
    output: { format: 'image/png' }
  });
  return out;
}

// ---------- onnx runtime + cached model download ----------
let ortP = null;
async function getOrt() {
  if (!ortP) ortP = import(ORT).then(ort => { ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`; ort.env.wasm.numThreads = threads(); return ort; });
  return ortP;
}
async function fetchModel(url, label, progress) {
  let cache = null; try { cache = await caches.open('ps-models-v1'); const hit = await cache.match(url); if (hit) { progress && progress(`Loading ${label} (cached)`, 1); return new Uint8Array(await hit.arrayBuffer()); } } catch (e) { cache = null; }
  const res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw new Error(`${label} download failed (${res.status})`);
  const total = +res.headers.get('content-length') || 0, rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; progress && progress(`Downloading ${label} (one time) ${(got / 1048576).toFixed(0)}${total ? ' / ' + (total / 1048576).toFixed(0) : ''} MB`, total ? got / total : 0); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  if (cache) { try { await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) { /* quota: fine */ } }
  return buf;
}
const sessions = {};
async function session(key, url, label, progress) {
  if (!sessions[key]) sessions[key] = (async () => {
    const ort = await getOrt(); const bytes = await fetchModel(url, label, progress);
    progress && progress(`Starting ${label}…`, 1);
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch(e => { delete sessions[key]; throw e; });
  return sessions[key];
}
export const preloadLama = p => session('lama', LAMA_URL, 'object-remover AI', p);

// ---------- helpers ----------
function toCHW(id, n) { const d = id.data, f = new Float32Array(3 * n); for (let i = 0; i < n; i++) { f[i] = d[i * 4] / 255; f[n + i] = d[i * 4 + 1] / 255; f[2 * n + i] = d[i * 4 + 2] / 255; } return f; }
export function alphaBox(c, th = 0) {
  const x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data; let a = c.width, b = c.height, r = -1, t = -1;
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) if (d[(y * c.width + X) * 4 + 3] > th) { if (X < a) a = X; if (X > r) r = X; if (y < b) b = y; if (y > t) t = y; }
  return r < 0 ? null : { x: a, y: b, w: r - a + 1, h: t - b + 1 };
}

// ---------- LaMa object removal ----------
// img: canvas (opaque photo). strokes: canvas same size, painted (alpha>0) where to erase.
export async function inpaint(img, strokes, progress) {
  const bb = alphaBox(strokes); if (!bb) return img;
  const s = await session('lama', LAMA_URL, 'object-remover AI', progress);
  progress && progress('Removing object…', 1);
  const W = img.width, H = img.height, N = 512;
  const side = Math.min(Math.max(W, H), Math.max(Math.max(bb.w, bb.h) * 2.2, Math.min(512, Math.max(W, H))));
  const rw = Math.min(W, side), rh = Math.min(H, side);
  let rx = Math.round(bb.x + bb.w / 2 - rw / 2), ry = Math.round(bb.y + bb.h / 2 - rh / 2);
  rx = Math.max(0, Math.min(W - rw, rx)); ry = Math.max(0, Math.min(H - rh, ry));
  const ic = mk(N, N), ix = ic.getContext('2d', { willReadFrequently: true }); ix.drawImage(img, rx, ry, rw, rh, 0, 0, N, N);
  const mc = mk(N, N), mx = mc.getContext('2d', { willReadFrequently: true }); mx.filter = 'blur(3px)'; mx.drawImage(strokes, rx, ry, rw, rh, 0, 0, N, N);
  const md = mx.getImageData(0, 0, N, N).data, mf = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) mf[i] = md[i * 4 + 3] > 8 ? 1 : 0;
  const ort = await getOrt();
  const out = await s.run({ image: new ort.Tensor('float32', toCHW(ix.getImageData(0, 0, N, N), N * N), [1, 3, N, N]), mask: new ort.Tensor('float32', mf, [1, 1, N, N]) });
  const o = out[Object.keys(out)[0]].data, od = new ImageData(N, N), n = N * N;
  for (let i = 0; i < n; i++) { od.data[i * 4] = o[i]; od.data[i * 4 + 1] = o[n + i]; od.data[i * 4 + 2] = o[2 * n + i]; od.data[i * 4 + 3] = 255; }
  const rc = mk(N, N); rc.getContext('2d').putImageData(od, 0, 0);
  // paste back only inside a feathered mask at full resolution
  const patch = mk(rw, rh), px = patch.getContext('2d'); px.imageSmoothingQuality = 'high'; px.drawImage(rc, 0, 0, rw, rh);
  const fm = mk(rw, rh), fx = fm.getContext('2d'); const f = Math.max(2, Math.round(Math.max(rw, rh) / N * 3));
  fx.filter = `blur(${f}px)`; fx.drawImage(strokes, rx, ry, rw, rh, 0, 0, rw, rh); fx.filter = 'none'; fx.globalCompositeOperation = 'source-over'; fx.drawImage(strokes, rx, ry, rw, rh, 0, 0, rw, rh);
  px.globalCompositeOperation = 'destination-in'; px.drawImage(fm, 0, 0);
  const res = mk(W, H), rcx = res.getContext('2d'); rcx.drawImage(img, 0, 0); rcx.drawImage(patch, rx, ry);
  return res;
}

// ---------- Real-ESRGAN upscale ----------
export async function upscale(src, factor, progress, cancelled) {
  const s = await session('esr', ESRGAN_URL, 'upscaler AI', progress); const ort = await getOrt();
  const W = src.width, H = src.height, T = 160, P = 12, f = factor, S4 = 4;
  const out = mk(W * f, H * f), ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high';
  // alpha: smooth upscale separately
  const sx = src.getContext('2d', { willReadFrequently: true });
  const tiles = []; for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) tiles.push([x, y]);
  let k = 0;
  for (const [x, y] of tiles) {
    if (cancelled && cancelled()) throw new Error('cancelled');
    const x0 = Math.max(0, x - P), y0 = Math.max(0, y - P), x1 = Math.min(W, x + T + P), y1 = Math.min(H, y + T + P), tw = x1 - x0, th = y1 - y0;
    const id = sx.getImageData(x0, y0, tw, th);
    const r = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', toCHW(id, tw * th), [1, 3, th, tw]) });
    const o = r[s.outputNames[0]].data, OW = tw * S4, OH = th * S4, n = OW * OH, od = new ImageData(OW, OH);
    for (let i = 0; i < n; i++) { od.data[i * 4] = o[i] * 255; od.data[i * 4 + 1] = o[n + i] * 255; od.data[i * 4 + 2] = o[2 * n + i] * 255; od.data[i * 4 + 3] = 255; }
    const tc = mk(OW, OH); tc.getContext('2d').putImageData(od, 0, 0);
    const cx = (x - x0) * S4, cy = (y - y0) * S4, cw = Math.min(T, W - x) * S4, chh = Math.min(T, H - y) * S4;
    ox.drawImage(tc, cx, cy, cw, chh, x * f, y * f, cw * f / S4, chh * f / S4);
    progress && progress(`Upscaling ${f}× with Real-ESRGAN… tile ${++k}/${tiles.length}`, k / tiles.length);
    await new Promise(r => setTimeout(r, 0));
  }
  // restore alpha channel
  const a = mk(W * f, H * f), ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(src, 0, 0, W * f, H * f);
  ox.globalCompositeOperation = 'destination-in'; ox.drawImage(a, 0, 0);
  return out;
}
