// On-device AI: background removal (IMG.LY).
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

export function alphaBox(c, th = 0) {
  const x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data; let a = c.width, b = c.height, r = -1, t = -1;
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) if (d[(y * c.width + X) * 4 + 3] > th) { if (X < a) a = X; if (X > r) r = X; if (y < b) b = y; if (y > t) t = y; }
  return r < 0 ? null : { x: a, y: b, w: r - a + 1, h: t - b + 1 };
}

