// Rendering engine: background, scenes, shadows, reflection, outline, subject, overlay layers.
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// ---------- adjustments ----------
export const ADJ_KEYS = [
  ['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'],
  ['saturation', 'Saturation'], ['warmth', 'Warmth'], ['sharpness', 'Sharpness']];
export const PRESETS = {
  None: {}, Vivid: { saturation: 35, contrast: 15 }, Bright: { exposure: 25, contrast: 5 },
  Warm: { warmth: 40, saturation: 10 }, Cool: { warmth: -40, saturation: 5 }, 'B&W': { saturation: -100, contrast: 20 },
  Matte: { contrast: -25, brightness: 10, saturation: -15 }, Vintage: { warmth: 30, saturation: -30, contrast: -10, brightness: 5 },
  Crisp: { sharpness: 60, contrast: 12, saturation: 8 }, Dramatic: { contrast: 40, exposure: -10, saturation: -10 }
};
export function adjKey(a) { return ADJ_KEYS.map(([k]) => a[k] || 0).join(','); }
export function adjust(src, a) {
  if (!ADJ_KEYS.some(([k]) => a[k])) return src;
  const W = src.width, H = src.height, out = mk(W, H), o = out.getContext('2d', { willReadFrequently: true });
  o.drawImage(src, 0, 0);
  const id = o.getImageData(0, 0, W, H), d = id.data;
  let bl = null;
  if (a.sharpness) {
    const b = mk(W, H), bx = b.getContext('2d', { willReadFrequently: true });
    bx.filter = `blur(${Math.max(1, Math.min(W, H) / 700).toFixed(2)}px)`; bx.drawImage(src, 0, 0);
    bl = bx.getImageData(0, 0, W, H).data;
  }
  const ex = Math.pow(2, (a.exposure || 0) / 100 * 1.5), br = (a.brightness || 0) / 100 * 60;
  const C = (a.contrast || 0) * 1.28, cf = (259 * (C + 255)) / (255 * (259 - C));
  const sat = 1 + (a.saturation || 0) / 100, wm = (a.warmth || 0) / 100 * 28, sh = (a.sharpness || 0) / 100 * 1.6;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (bl) { r += sh * (r - bl[i]); g += sh * (g - bl[i + 1]); b += sh * (b - bl[i + 2]); }
    r = r * ex + br; g = g * ex + br; b = b * ex + br;
    r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    r += wm; b -= wm; g += wm * 0.15;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; // Uint8Clamped clamps
  }
  o.putImageData(id, 0, 0);
  return out;
}

// ---------- backgrounds ----------
export const COLORS = ['#ffffff', '#000000', '#f4f1ea', '#e9ecef', '#ffe4e1', '#fde2c4', '#fff3b0', '#d8f3dc', '#dff3ff', '#e5dbff', '#ff5470', '#2b2d42', '#ffb703', '#219ebc'];
export const GRADS = [['#ffd1dc', '#c3b1ff'], ['#a1ffce', '#faffd1'], ['#f6d365', '#fda085'], ['#e0eafc', '#cfdef3'], ['#232526', '#414345'], ['#74ebd5', '#acb6e5'], ['#fbc2eb', '#a6c1ee'], ['#ff9a9e', '#fecfef'], ['#43cea2', '#185a9d'], ['#ee9ca7', '#ffdde1'], ['#fdfbfb', '#ebedee'], ['#0f2027', '#2c5364'], ['#f7971e', '#ffd200'], ['#c79081', '#dfa579']];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function rad(ctx, x, y, r0, r1, stops) { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function podium(ctx, cx, fy, w, top, side, H) {
  const rh = w * 0.13;
  ctx.fillStyle = side; ctx.fillRect(cx - w / 2, fy, w, Math.max(H - fy, rh));
  ctx.beginPath(); ctx.ellipse(cx, fy, w / 2, rh, 0, 0, Math.PI * 2); ctx.fillStyle = top; ctx.fill();
}
// p = {W,H, fy: floor y (subject bottom), cx: subject center x, sw: subject width}
export const TEMPLATES = {
  'Studio white': (c, p) => { c.fillStyle = rad(c, p.W / 2, p.H * .42, 0, Math.max(p.W, p.H) * .8, [[0, '#ffffff'], [1, '#dfe1e6']]); c.fillRect(0, 0, p.W, p.H); c.fillStyle = lin(c, 0, p.fy - p.H * .05, 0, p.H, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.08)']]); c.fillRect(0, 0, p.W, p.H); },
  'Grey sweep': (c, p) => { c.fillStyle = lin(c, 0, 0, 0, p.H, [[0, '#b9bec7'], [.62, '#e6e8ec'], [1, '#c9cdd4']]); c.fillRect(0, 0, p.W, p.H); },
  'Pink podium': (c, p) => { c.fillStyle = lin(c, 0, 0, 0, p.H, [[0, '#f9d5df'], [1, '#f3b9c9']]); c.fillRect(0, 0, p.W, p.H); podium(c, p.cx, p.fy, Math.max(p.sw * 1.5, p.W * .35), '#fde7ee', '#efb1c3', p.H); },
  'Mint podium': (c, p) => { c.fillStyle = lin(c, 0, 0, p.W, p.H, [[0, '#d7f5ea'], [1, '#a9e3d0']]); c.fillRect(0, 0, p.W, p.H); podium(c, p.cx, p.fy, Math.max(p.sw * 1.5, p.W * .35), '#effbf6', '#8fd3bd', p.H); },
  'Sand podium': (c, p) => { c.fillStyle = lin(c, 0, 0, 0, p.H, [[0, '#efe3d3'], [1, '#e2cfb6']]); c.fillRect(0, 0, p.W, p.H); c.beginPath(); c.arc(p.W * .78, p.H * .22, Math.min(p.W, p.H) * .14, 0, 7); c.fillStyle = '#f6c99a'; c.fill(); podium(c, p.cx, p.fy, Math.max(p.sw * 1.5, p.W * .35), '#f8f0e6', '#d6bf9f', p.H); },
  'Wood table': (c, p) => {
    c.fillStyle = lin(c, 0, 0, 0, p.fy, [[0, '#f3ece2'], [1, '#e6dccd']]); c.fillRect(0, 0, p.W, p.H);
    const ty = Math.min(p.fy - (p.H - p.fy) * .2, p.H * .85), r = rng(7);
    c.fillStyle = lin(c, 0, ty, 0, p.H, [[0, '#b07a4f'], [1, '#7a4b2a']]); c.fillRect(0, ty, p.W, p.H - ty);
    c.globalAlpha = .18; c.strokeStyle = '#3b210f'; for (let i = 0; i < 26; i++) { const y = ty + r() * (p.H - ty); c.lineWidth = 1 + r() * p.H / 400; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(p.W * .3, y + (r() - .5) * 20, p.W * .7, y + (r() - .5) * 20, p.W, y + (r() - .5) * 12); c.stroke(); }
    c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, ty, p.W, Math.max(2, p.H / 300));
  },
  Marble: (c, p) => {
    c.fillStyle = lin(c, 0, 0, p.W, p.H, [[0, '#f8f8f6'], [1, '#e9e8e4']]); c.fillRect(0, 0, p.W, p.H);
    const r = rng(11); c.strokeStyle = 'rgba(120,120,130,.35)';
    for (let i = 0; i < 14; i++) { c.lineWidth = .6 + r() * Math.max(p.W, p.H) / 500; c.beginPath(); let x = r() * p.W, y = r() * p.H; c.moveTo(x, y); for (let k = 0; k < 6; k++) { const nx = x + (r() - .3) * p.W * .35, ny = y + (r() - .5) * p.H * .35; c.quadraticCurveTo((x + nx) / 2 + (r() - .5) * 80, (y + ny) / 2 + (r() - .5) * 80, nx, ny); x = nx; y = ny; } c.stroke(); }
  },
  Concrete: (c, p) => {
    c.fillStyle = '#9fa3a8'; c.fillRect(0, 0, p.W, p.H); const r = rng(3), n = Math.round(p.W * p.H / 900);
    for (let i = 0; i < n; i++) { c.fillStyle = r() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)'; const s = 1 + r() * p.W / 300; c.fillRect(r() * p.W, r() * p.H, s, s); }
    c.fillStyle = rad(c, p.W / 2, p.H * .45, 0, Math.max(p.W, p.H) * .75, [[0, 'rgba(255,255,255,.18)'], [1, 'rgba(0,0,0,.25)']]); c.fillRect(0, 0, p.W, p.H);
  },
  Spotlight: (c, p) => { c.fillStyle = '#0d0e12'; c.fillRect(0, 0, p.W, p.H); c.fillStyle = rad(c, p.cx, p.H * .35, 0, Math.max(p.W, p.H) * .6, [[0, 'rgba(255,255,255,.28)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, p.W, p.H); c.save(); c.translate(p.cx, p.fy); c.scale(1, .18); c.fillStyle = rad(c, 0, 0, 0, Math.max(p.sw, p.W * .3), [[0, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); c.beginPath(); c.arc(0, 0, Math.max(p.sw, p.W * .3), 0, 7); c.fill(); c.restore(); },
  Sunset: (c, p) => { c.fillStyle = lin(c, 0, 0, 0, p.H, [[0, '#2b1055'], [.55, '#d53369'], [.8, '#fbb03b'], [1, '#f6d365']]); c.fillRect(0, 0, p.W, p.H); c.fillStyle = 'rgba(30,10,40,.55)'; c.fillRect(0, Math.min(p.fy, p.H * .9), p.W, p.H); },
  Beach: (c, p) => { const hz = Math.min(p.fy - (p.H - p.fy) * .3, p.H * .8); c.fillStyle = lin(c, 0, 0, 0, hz, [[0, '#7ec8f2'], [1, '#d9f1fb']]); c.fillRect(0, 0, p.W, hz); c.fillStyle = '#3aa6c9'; c.fillRect(0, hz, p.W, (p.H - hz) * .18); c.fillStyle = lin(c, 0, hz, 0, p.H, [[0, '#f1dcb2'], [1, '#e3c48d']]); c.fillRect(0, hz + (p.H - hz) * .18, p.W, p.H); },
  Kitchen: (c, p) => {
    const ty = Math.min(p.fy - (p.H - p.fy) * .15, p.H * .82), s = Math.max(p.W, p.H) / 12;
    c.fillStyle = '#f5f5f2'; c.fillRect(0, 0, p.W, ty); c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = Math.max(1, s / 30);
    for (let y = 0; y < ty; y += s / 2) { c.beginPath(); c.moveTo(0, y); c.lineTo(p.W, y); c.stroke(); for (let x = ((y / (s / 2)) % 2) * s / 2; x < p.W; x += s) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, Math.min(y + s / 2, ty)); c.stroke(); } }
    c.fillStyle = lin(c, 0, ty, 0, p.H, [[0, '#d8d4cc'], [1, '#b8b1a6']]); c.fillRect(0, ty, p.W, p.H - ty);
  },
  Bokeh: (c, p) => { c.fillStyle = lin(c, 0, 0, p.W, p.H, [[0, '#1b1f3b'], [1, '#3b1f3b']]); c.fillRect(0, 0, p.W, p.H); const r = rng(5), cols = ['255,200,120', '255,120,180', '140,200,255', '255,255,255']; for (let i = 0; i < 40; i++) { const x = r() * p.W, y = r() * p.H, R = (r() * .08 + .02) * Math.max(p.W, p.H); c.fillStyle = rad(c, x, y, 0, R, [[0, `rgba(${cols[i % 4]},.35)`], [1, `rgba(${cols[i % 4]},0)`]]); c.beginPath(); c.arc(x, y, R, 0, 7); c.fill(); } },
  'Lavender arch': (c, p) => { c.fillStyle = '#e8e0f7'; c.fillRect(0, 0, p.W, p.H); const aw = Math.max(p.sw * 1.6, p.W * .45), ax = p.cx - aw / 2, top = p.H * .12; c.fillStyle = '#d3c4f0'; c.beginPath(); c.moveTo(ax, p.H); c.lineTo(ax, top + aw / 2); c.arc(p.cx, top + aw / 2, aw / 2, Math.PI, 0); c.lineTo(ax + aw, p.H); c.fill(); c.fillStyle = '#c6b4ea'; c.fillRect(0, Math.min(p.fy, p.H * .92), p.W, p.H); }
};

let _ids = new WeakMap(), _n = 1;
export const oid = o => { if (!o) return 0; let v = _ids.get(o); if (!v) { v = _n++; _ids.set(o, v); } return v; };

// ---------- mask / subject processing ----------
// remove small disconnected specks (keeps components >= frac of the largest)
export function cleanMask(m, frac = 0.015) {
  const W = m.width, H = m.height, x = m.getContext('2d', { willReadFrequently: true }), id = x.getImageData(0, 0, W, H), d = id.data, N = W * H;
  const lab = new Int32Array(N), st = new Int32Array(N), sizes = [0]; let n = 0;
  for (let i = 0; i < N; i++) {
    if (lab[i] || d[i * 4 + 3] < 64) continue;
    n++; let sp = 0, cnt = 0; st[sp++] = i; lab[i] = n;
    while (sp) { const q = st[--sp]; cnt++; const qx = q % W, qy = (q / W) | 0;
      if (qx > 0) { const r = q - 1; if (!lab[r] && d[r * 4 + 3] >= 64) { lab[r] = n; st[sp++] = r; } }
      if (qx < W - 1) { const r = q + 1; if (!lab[r] && d[r * 4 + 3] >= 64) { lab[r] = n; st[sp++] = r; } }
      if (qy > 0) { const r = q - W; if (!lab[r] && d[r * 4 + 3] >= 64) { lab[r] = n; st[sp++] = r; } }
      if (qy < H - 1) { const r = q + W; if (!lab[r] && d[r * 4 + 3] >= 64) { lab[r] = n; st[sp++] = r; } } }
    sizes.push(cnt);
  }
  if (n < 2) return { removed: 0 };
  const big = Math.max(...sizes), keep = sizes.map(v => v >= big * frac);
  // faint pixels (<64) take the label of a neighbour so halos of removed specks also go
  let removed = 0;
  for (let i = 0; i < N; i++) {
    const a = d[i * 4 + 3]; if (!a) continue;
    let l = lab[i];
    if (!l) { const qx = i % W; l = (qx > 0 && lab[i - 1]) || (qx < W - 1 && lab[i + 1]) || (i >= W && lab[i - W]) || (i < N - W && lab[i + W]) || 0; if (!l) { if (a < 24) d[i * 4 + 3] = 0; continue; } }
    if (!keep[l]) { d[i * 4 + 3] = 0; removed++; }
  }
  x.putImageData(id, 0, 0); return { removed };
}
// subject = photo masked; refine: slight alpha erode/feather + colour decontamination of edge pixels
export function composeSubject(adj, mask, refine) {
  const W = adj.width, H = adj.height, s = mk(W, H), sx = s.getContext('2d', { willReadFrequently: true });
  if (!refine) { sx.drawImage(adj, 0, 0); sx.globalCompositeOperation = 'destination-in'; sx.drawImage(mask, 0, 0, W, H); return s; }
  const mc = mk(W, H), mx = mc.getContext('2d', { willReadFrequently: true }); mx.filter = `blur(${Math.max(.4, W / 2400).toFixed(2)}px)`; mx.drawImage(mask, 0, 0, W, H);
  const md = mx.getImageData(0, 0, W, H).data;
  sx.drawImage(adj, 0, 0); const id = sx.getImageData(0, 0, W, H), d = id.data;
  // interior colours spread outwards (premultiplied blur of the solid interior)
  const ic = mk(W, H), ix = ic.getContext('2d', { willReadFrequently: true }), iid = ix.createImageData(W, H), idd = iid.data;
  for (let i = 0; i < d.length; i += 4) { if (md[i + 3] >= 235) { idd[i] = d[i]; idd[i + 1] = d[i + 1]; idd[i + 2] = d[i + 2]; idd[i + 3] = 255; } }
  ix.putImageData(iid, 0, 0);
  const bc = mk(W, H), bx = bc.getContext('2d', { willReadFrequently: true }); bx.filter = `blur(${Math.max(2, W / 300).toFixed(1)}px)`; bx.drawImage(ic, 0, 0); const bd = bx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < d.length; i += 4) {
    const a0 = md[i + 3]; let a = (a0 - 40) * 255 / 200; a = a < 0 ? 0 : a > 255 ? 255 : a; // erode + re-feather
    if (a > 0 && a < 250 && bd[i + 3] > 8) { const t = 1 - a / 255 * 0.6; d[i] += (bd[i] - d[i]) * t; d[i + 1] += (bd[i + 1] - d[i + 1]) * t; d[i + 2] += (bd[i + 2] - d[i + 2]) * t; }
    d[i + 3] = a;
  }
  sx.putImageData(id, 0, 0); return s;
}
// photo with the product area filled from its surroundings (push-pull), used for blurred backgrounds
export function holeFill(adj, mask) {
  const W = adj.width, H = adj.height, b = mk(W, H), x = b.getContext('2d'); x.drawImage(adj, 0, 0);
  x.globalCompositeOperation = 'destination-out'; const r = Math.max(2, Math.round(W / 150));
  x.drawImage(mask, 0, 0, W, H); x.filter = `blur(${r}px)`; for (let i = 0; i < 3; i++) x.drawImage(mask, 0, 0, W, H);
  const lv = [b]; while (lv[lv.length - 1].width > 8 && lv[lv.length - 1].height > 8) { const p = lv[lv.length - 1], c = mk(p.width / 2, p.height / 2); c.getContext('2d').drawImage(p, 0, 0, c.width, c.height); lv.push(c); }
  const o = mk(W, H), ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high';
  for (let k = 0; k < 6; k++) ox.drawImage(lv[lv.length - 1], 0, 0, W, H);
  for (let i = lv.length - 2; i >= 0; i--) ox.drawImage(lv[i], 0, 0, W, H);
  return o;
}
// image with edges stretched outwards so blurring never samples transparency
function extend(img, p) {
  const w = img.width, h = img.height, c = mk(w + 2 * p, h + 2 * p), x = c.getContext('2d');
  x.drawImage(img, 0, 0, 1, h, 0, p, p, h); x.drawImage(img, w - 1, 0, 1, h, w + p, p, p, h);
  x.drawImage(img, 0, 0, w, 1, p, 0, w, p); x.drawImage(img, 0, h - 1, w, 1, p, h + p, w, p);
  x.drawImage(img, 0, 0, 1, 1, 0, 0, p, p); x.drawImage(img, w - 1, 0, 1, 1, w + p, 0, p, p); x.drawImage(img, 0, h - 1, 1, 1, 0, h + p, p, p); x.drawImage(img, w - 1, h - 1, 1, 1, w + p, h + p, p, p);
  x.drawImage(img, p, p); return { c, p };
}

export function cover(ctx, img, W, H) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(W / iw, H / ih); ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k); }

// ---------- geometry ----------
export function outSize(S, doc) { const z = S.size; if (z.w && z.h) return [z.w, z.h]; return [doc.src.width, doc.src.height]; }
export const keepsBg = S => S.bg.type === 'orig' || S.bg.type === 'blur';
export function subjectBox(S, doc) { return doc.hasCut && doc.bbox ? doc.bbox : { x: 0, y: 0, w: doc.base.width, h: doc.base.height }; }
export function subjectMatrix(S, doc, W, H) {
  const W0 = doc.base.width, H0 = doc.base.height, bb = subjectBox(S, doc), pad = S.pad / 100, j = S.subj;
  const contain = Math.min(W * (1 - 2 * pad) / bb.w, H * (1 - 2 * pad) / bb.h);
  let k, ax, ay, tx = j.x * W, ty = j.y * H;
  if (keepsBg(S)) {
    const cov = Math.max(W / W0, H / H0); k = Math.min(cov, contain); ax = W0 / 2; ay = H0 / 2;
    // keep the product inside the padded canvas
    const px = W * pad, py = H * pad, bx0 = (bb.x - ax) * k + W / 2, bx1 = (bb.x + bb.w - ax) * k + W / 2, by0 = (bb.y - ay) * k + H / 2, by1 = (bb.y + bb.h - ay) * k + H / 2;
    const fit = (a0, a1, lo, hi) => (a1 - a0 > hi - lo) ? (lo + hi) / 2 - (a0 + a1) / 2 : a0 < lo ? lo - a0 : a1 > hi ? hi - a1 : 0;
    tx += fit(bx0, bx1, px, W - px); ty += fit(by0, by1, py, H - py);
  } else { k = contain; ax = bb.x + bb.w / 2; ay = bb.y + bb.h / 2; }
  const m = new DOMMatrix();
  m.translateSelf(tx, ty); m.rotateSelf(j.rot || 0); m.scaleSelf(k * j.s * (j.fx || 1), k * j.s * (j.fy || 1)); m.translateSelf(-ax, -ay);
  return m;
}
export function boxCorners(m, bx) { return [[bx.x, bx.y], [bx.x + bx.w, bx.y], [bx.x, bx.y + bx.h], [bx.x + bx.w, bx.y + bx.h]].map(([x, y]) => { const q = m.transformPoint(new DOMPoint(x, y)); return [q.x, q.y]; }); }
export function aabb(pts) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function tint(src, color) { const c = mk(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; }

// ---------- background ----------
function drawPhotoBg(ctx, img, DM, W0, H0, blurPx, DW, DH) {
  // blurred, edge-extended copy covers the whole canvas; then the photo aligned with the product
  const sc = img.width / W0, e = extend(img, Math.round(Math.max(img.width, img.height) * .6));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = `blur(${Math.max(blurPx, 2)}px)`;
  ctx.setTransform(DM); ctx.drawImage(e.c, -e.p / sc, -e.p / sc, e.c.width / sc, e.c.height / sc); ctx.restore();
}
function drawBackground(ctx, S, p, doc, DM) {
  const b = S.bg, W = p.W, H = p.H, W0 = doc.base.width, H0 = doc.base.height;
  ctx.setTransform(p.sc, 0, 0, p.sc, 0, 0);
  if (b.type === 'color') { ctx.fillStyle = b.color; ctx.fillRect(0, 0, W, H); }
  else if (b.type === 'grad') { ctx.fillStyle = lin(ctx, 0, 0, W, H, [[0, b.grad[0]], [1, b.grad[1]]]); ctx.fillRect(0, 0, W, H); }
  else if (b.type === 'image' && b.img) cover(ctx, b.img, W, H);
  else if (b.type === 'template') (TEMPLATES[b.tpl] || TEMPLATES['Studio white'])(ctx, p);
  else if (b.type === 'blur') drawPhotoBg(ctx, doc.fill ? doc.fill() : doc.adj, DM, W0, H0, (b.blur || 4) * Math.max(W, H) / 400 * p.sc);
  else if (b.type === 'orig') { drawPhotoBg(ctx, doc.fill ? doc.fill() : doc.adj, DM, W0, H0, Math.max(W, H) / 60 * p.sc); ctx.save(); ctx.setTransform(DM); ctx.drawImage(doc.adj, 0, 0, W0, H0); ctx.restore(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- main render ----------
// target: canvas sized W*sc x H*sc. opts: {sc, transparent, noOverlays, ghost}
export function render(target, doc, S, opts = {}) {
  const [W, H] = outSize(S, doc), sc = opts.sc || 1, W0 = doc.base.width, H0 = doc.base.height;
  const ctx = target.getContext('2d'); const DW = target.width, DH = target.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, DW, DH);
  const M = subjectMatrix(S, doc, W, H), bx = subjectBox(S, doc), R = aabb(boxCorners(M, bx));
  const p = { W, H, sc, fy: Math.min(R.y + R.h, H), cx: R.x + R.w / 2, sw: R.w };
  const DM = new DOMMatrix([sc, 0, 0, sc, 0, 0]).multiply(M);
  const Ms = DM.toString(), keep = keepsBg(S), transparent = opts.transparent || S.bg.type === 'none';
  const cache = opts.cache ? (target.__c ||= {}) : {};
  // background (cached)
  if (!transparent) {
    const b = S.bg, bk = [DW, DH, b.type, b.color, b.grad, b.tpl, oid(b.img), b.blur, oid(doc.adj), oid(doc.subj), (b.type === 'template' || keep) ? Ms : ''].join('|');
    if (cache.bk !== bk) { cache.bg = mk(DW, DH); drawBackground(cache.bg.getContext('2d'), S, p, doc, DM); cache.bk = bk; }
    ctx.drawImage(cache.bg, 0, 0);
  }
  if (opts.ghost) { ctx.setTransform(DM); ctx.globalAlpha = .28; ctx.drawImage(doc.adj, 0, 0, W0, H0); ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0); }
  const drawSubject = !(keep && !transparent && S.bg.type === 'orig') || opts.ghost;
  if (drawSubject) {
    const isCut = doc.hasCut && !(keep && !transparent && S.bg.type === 'orig');
    const fk = [DW, DH, Ms, oid(doc.subj), isCut, JSON.stringify([S.shadow, S.refl, S.outline]), p.fy].join('|');
    if (cache.fk !== fk) { cache.fx = effects(doc, S, p, DM, DW, DH, R, isCut); cache.fk = fk; }
    ctx.drawImage(cache.fx, 0, 0);
  }
  if (!opts.noOverlays) drawLayers(ctx, S, W, H, sc);
  return { W, H, M, R };
}
function effects(doc, S, p, DM, DW, DH, R, isCut) {
  const W0 = doc.base.width, H0 = doc.base.height, sc = p.sc;
  const olr = S.outline.on ? S.outline.w * Math.max(p.W, p.H) / 1000 * sc : 0, m = Math.ceil(olr + 4);
  const L = mk(DW + 2 * m, DH + 2 * m), lx = L.getContext('2d'); lx.setTransform(new DOMMatrix([1, 0, 0, 1, m, m]).multiply(DM)); lx.drawImage(doc.subj, 0, 0, W0, H0);
  const fx = mk(DW, DH), ctx = fx.getContext('2d');
  const sh = S.shadow, diag = Math.hypot(R.w, R.h) * sc;
  if (isCut) {
    if (S.refl.on) {
      const bottom = p.fy * sc + m, len = (S.refl.len / 100) * R.h * sc;
      const rc = mk(L.width, L.height), rx = rc.getContext('2d');
      rx.setTransform(1, 0, 0, -1, 0, 2 * bottom); rx.drawImage(L, 0, 0); rx.setTransform(1, 0, 0, 1, 0, 0);
      rx.globalCompositeOperation = 'destination-in'; rx.fillStyle = lin(rx, 0, bottom, 0, bottom + Math.max(1, len), [[0, `rgba(0,0,0,${S.refl.op / 100})`], [1, 'rgba(0,0,0,0)']]); rx.fillRect(0, 0, rc.width, rc.height);
      ctx.drawImage(rc, -m, -m);
    }
    if (sh.type !== 'none' && sh.op > 0) {
      const col = hexA(sh.color, sh.op / 100), ang = sh.ang * Math.PI / 180, blur = sh.blur / 100 * diag * .08;
      ctx.save();
      if (sh.type === 'soft' || sh.type === 'hard' || sh.type === 'float') {
        const dist = (sh.dist / 100) * diag * (sh.type === 'float' ? .12 : .05), big = L.width + 50;
        ctx.shadowColor = col; ctx.shadowBlur = sh.type === 'hard' ? Math.min(blur, diag * .004) : blur * (sh.type === 'float' ? 1.6 : 1);
        ctx.shadowOffsetX = Math.cos(ang) * dist + big; ctx.shadowOffsetY = Math.sin(ang) * dist;
        ctx.drawImage(L, -m - big, -m);
      } else if (sh.type === 'cast') {
        const bottom = p.fy * sc, q = .22 + sh.dist / 100 * .5, sk = Math.cos(ang) * 1.4;
        const t = tint(L, col); ctx.filter = `blur(${Math.max(.5, blur * .5)}px)`;
        ctx.setTransform(1, 0, -sk, q, sk * bottom, bottom * (1 - q)); ctx.drawImage(t, -m, -m);
      } else if (sh.type === 'contact') {
        const cx = p.cx * sc, rw = R.w * sc * (.35 + sh.dist / 100 * .5), rh = Math.max(2, rw * (.06 + sh.blur / 100 * .12));
        ctx.translate(cx, p.fy * sc - rh * .3); ctx.scale(1, rh / rw);
        ctx.fillStyle = rad(ctx, 0, 0, 0, rw, [[0, col], [.5, hexA(sh.color, sh.op / 100 * .5)], [1, hexA(sh.color, 0)]]);
        ctx.beginPath(); ctx.arc(0, 0, rw, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    if (olr > 0) {
      const t = tint(L, S.outline.color), n = Math.max(16, Math.min(48, Math.round(olr * 2)));
      // clip to the photo's own rectangle so edges cut by the photo border / crop get no outline
      const q = [[0, 0], [W0, 0], [W0, H0], [0, H0]].map(([x, y]) => DM.transformPoint(new DOMPoint(x, y)));
      ctx.save(); ctx.beginPath(); q.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath(); ctx.clip();
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.drawImage(t, -m + Math.cos(a) * olr, -m + Math.sin(a) * olr); }
      ctx.restore();
    }
  }
  ctx.drawImage(L, -m, -m);
  return fx;
}

// ---------- overlay layers ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function textMetrics(ctx, l, W, H) {
  const fs = l.size / 100 * Math.min(W, H), lines = String(l.text || ' ').split('\n');
  ctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? 800 : 500} ${fs}px "${l.font}", system-ui, sans-serif`;
  const lh = fs * 1.15, tw = Math.max(...lines.map(s => ctx.measureText(s).width)), th = lh * lines.length;
  const px = l.bgOn ? fs * .55 : (l.stOn ? fs * .1 : 0), py = l.bgOn ? fs * .3 : (l.stOn ? fs * .1 : 0);
  return { fs, lines, lh, tw, th, px, py, w: tw + px * 2, h: th + py * 2 };
}
export function layerBox(ctx, l, W, H) {
  if (l.type === 'image') { const w = l.size / 100 * W; return { w, h: w * l.img.height / l.img.width }; }
  return textMetrics(ctx, l, W, H);
}
// keep a layer fully inside the canvas (when it fits)
export function clampLayer(l, bb, W, H) {
  const a = (l.rot || 0) * Math.PI / 180, ex = (Math.abs(bb.w * Math.cos(a)) + Math.abs(bb.h * Math.sin(a))) / 2, ey = (Math.abs(bb.w * Math.sin(a)) + Math.abs(bb.h * Math.cos(a))) / 2;
  if (2 * ex <= W) l.x = Math.min(1 - ex / W, Math.max(ex / W, l.x)); else l.x = .5;
  if (2 * ey <= H) l.y = Math.min(1 - ey / H, Math.max(ey / H, l.y)); else l.y = .5;
}
export function drawLayers(ctx, S, W, H, sc) {
  for (const l of S.layers) {
    ctx.save(); ctx.setTransform(sc, 0, 0, sc, 0, 0);
    const bb = layerBox(ctx, l, W, H); clampLayer(l, bb, W, H); l._bb = { w: bb.w, h: bb.h };
    ctx.translate(l.x * W, l.y * H); ctx.rotate((l.rot || 0) * Math.PI / 180); ctx.globalAlpha = (l.op ?? 100) / 100;
    if (l.type === 'image') ctx.drawImage(l.img, -bb.w / 2, -bb.h / 2, bb.w, bb.h);
    else drawText(ctx, l, bb);
    ctx.restore();
  }
}
function drawText(ctx, l, t) {
  const { fs, lines, lh, tw, th, px, py } = t;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (l.bgOn) { ctx.fillStyle = l.bg; rr(ctx, -tw / 2 - px, -th / 2 - py, tw + px * 2, th + py * 2, l.round != null ? Math.min(l.round * fs, (th + py * 2) / 2) : fs * .35); ctx.fill(); }
  if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = fs * .18; ctx.shadowOffsetY = fs * .06; }
  lines.forEach((s, i) => {
    const y = -th / 2 + lh * (i + .5);
    if (l.stOn) { ctx.lineJoin = 'round'; ctx.lineWidth = fs * .14; ctx.strokeStyle = l.st; ctx.strokeText(s, 0, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = l.color; ctx.fillText(s, 0, y);
  });
}
