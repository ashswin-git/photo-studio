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

export function drawBackground(ctx, S, p, doc, M) {
  const b = S.bg, W = p.W, H = p.H;
  if (b.type === 'color') { ctx.fillStyle = b.color; ctx.fillRect(0, 0, W, H); }
  else if (b.type === 'grad') { ctx.fillStyle = lin(ctx, 0, 0, W, H, [[0, b.grad[0]], [1, b.grad[1]]]); ctx.fillRect(0, 0, W, H); }
  else if (b.type === 'image' && b.img) cover(ctx, b.img, W, H);
  else if (b.type === 'template') (TEMPLATES[b.tpl] || TEMPLATES['Studio white'])(ctx, p);
  else if (b.type === 'blur') { ctx.save(); ctx.filter = `blur(${(b.blur || 4) * Math.max(W, H) / 400 * p.sc}px)`; cover(ctx, doc.adj, W, H); ctx.restore(); }
  else if (b.type === 'orig') { ctx.save(); ctx.transform(M.a, M.b, M.c, M.d, M.e, M.f); ctx.drawImage(doc.adj, 0, 0); ctx.restore(); }
}
export function cover(ctx, img, W, H) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(W / iw, H / ih); ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k); }

// ---------- geometry ----------
export function outSize(S, doc) {
  const z = S.size; if (z.w && z.h) return [z.w, z.h];
  return [doc.src.width, doc.src.height];
}
export function subjectBox(S, doc) { return (S.bg.type === 'orig' || !doc.hasCut) ? { x: 0, y: 0, w: doc.src.width, h: doc.src.height } : doc.bbox; }
export function subjectMatrix(S, doc, W, H) {
  const bx = subjectBox(S, doc), pad = S.pad / 100, j = S.subj;
  const k = (S.bg.type === 'orig' || !doc.hasCut) ? Math.max(W / bx.w, H / bx.h) : Math.min(W * (1 - 2 * pad) / bx.w, H * (1 - 2 * pad) / bx.h);
  const m = new DOMMatrix();
  m.translateSelf(j.x * W, j.y * H); m.rotateSelf(j.rot || 0); m.scaleSelf(k * j.s * (j.fx || 1), k * j.s * (j.fy || 1));
  m.translateSelf(-(bx.x + bx.w / 2), -(bx.y + bx.h / 2));
  return m;
}
export function boxCorners(m, bx) { return [[bx.x, bx.y], [bx.x + bx.w, bx.y], [bx.x, bx.y + bx.h], [bx.x + bx.w, bx.y + bx.h]].map(([x, y]) => { const q = m.transformPoint(new DOMPoint(x, y)); return [q.x, q.y]; }); }
export function aabb(pts) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function tint(src, color) { const c = mk(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; }

// ---------- main render ----------
// target: canvas sized W*sc x H*sc. opts: {sc, transparent, noOverlays, ghost}
export function render(target, doc, S, opts = {}) {
  const [W, H] = outSize(S, doc), sc = opts.sc || 1;
  const ctx = target.getContext('2d'); const DW = target.width, DH = target.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, DW, DH);
  const M = subjectMatrix(S, doc, W, H), bx = subjectBox(S, doc);
  const R = aabb(boxCorners(M, bx));
  const p = { W, H, sc, fy: Math.min(R.y + R.h, H), cx: R.x + R.w / 2, sw: R.w };
  const base = new DOMMatrix([sc, 0, 0, sc, 0, 0]);
  const DM = base.multiply(M); // image px -> device px
  const transparent = opts.transparent || S.bg.type === 'none';
  if (!transparent || S.bg.type === 'orig') { ctx.setTransform(base); drawBackground(ctx, S, p, doc, M); }
  if (opts.ghost) { ctx.setTransform(DM); ctx.globalAlpha = .28; ctx.drawImage(doc.adj, 0, 0); ctx.globalAlpha = 1; }
  // subject layer in device space
  const L = mk(DW, DH), lx = L.getContext('2d');
  lx.setTransform(DM); lx.drawImage(doc.subj, 0, 0);
  const isCut = doc.hasCut && S.bg.type !== 'orig';
  const sh = S.shadow, diag = Math.hypot(R.w, R.h) * sc;
  if (isCut) {
    // reflection
    if (S.refl.on) {
      const bottom = p.fy * sc, len = (S.refl.len / 100) * R.h * sc;
      const rc = mk(DW, DH), rx = rc.getContext('2d');
      rx.setTransform(1, 0, 0, -1, 0, 2 * bottom); rx.drawImage(L, 0, 0); rx.setTransform(1, 0, 0, 1, 0, 0);
      rx.globalCompositeOperation = 'destination-in'; rx.fillStyle = lin(rx, 0, bottom, 0, bottom + Math.max(1, len), [[0, `rgba(0,0,0,${S.refl.op / 100})`], [1, 'rgba(0,0,0,0)']]); rx.fillRect(0, 0, DW, DH);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(rc, 0, 0);
    }
    if (sh.type !== 'none' && sh.op > 0) {
      const col = hexA(sh.color, sh.op / 100), ang = sh.ang * Math.PI / 180, blur = sh.blur / 100 * diag * .08;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (sh.type === 'soft' || sh.type === 'hard' || sh.type === 'float') {
        const dist = (sh.dist / 100) * diag * (sh.type === 'float' ? .12 : .05);
        ctx.shadowColor = col; ctx.shadowBlur = sh.type === 'hard' ? Math.min(blur, diag * .004) : blur * (sh.type === 'float' ? 1.6 : 1);
        ctx.shadowOffsetX = Math.cos(ang) * dist + DW + 50; ctx.shadowOffsetY = Math.sin(ang) * dist;
        ctx.drawImage(L, -DW - 50, 0);
      } else if (sh.type === 'cast') {
        const bottom = p.fy * sc, q = .22 + sh.dist / 100 * .5, sk = Math.cos(ang) * 1.4;
        const t = tint(L, col); ctx.filter = `blur(${Math.max(.5, blur * .5)}px)`;
        ctx.setTransform(1, 0, -sk, q, sk * bottom, bottom * (1 - q)); ctx.drawImage(t, 0, 0);
      } else if (sh.type === 'contact') {
        const cx = p.cx * sc, rw = R.w * sc * (.35 + sh.dist / 100 * .5), rh = Math.max(2, rw * (.06 + sh.blur / 100 * .12));
        ctx.translate(cx, p.fy * sc - rh * .3); ctx.scale(1, rh / rw);
        ctx.fillStyle = rad(ctx, 0, 0, 0, rw, [[0, col], [.5, hexA(sh.color, sh.op / 100 * .5)], [1, hexA(sh.color, 0)]]);
        ctx.beginPath(); ctx.arc(0, 0, rw, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    if (S.outline.on && S.outline.w > 0) {
      const t = tint(L, S.outline.color), r = S.outline.w * Math.max(W, H) / 1000 * sc, n = Math.max(16, Math.min(48, Math.round(r * 2)));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.drawImage(t, Math.cos(a) * r, Math.sin(a) * r); }
      ctx.drawImage(t, 0, 0);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (S.bg.type !== 'orig' || opts.ghost) ctx.drawImage(L, 0, 0);
  if (!opts.noOverlays) drawLayers(ctx, S, W, H, sc);
  return { W, H, M, R };
}

// ---------- overlay layers ----------
export function drawLayers(ctx, S, W, H, sc) {
  for (const l of S.layers) {
    ctx.save(); ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.translate(l.x * W, l.y * H); ctx.rotate((l.rot || 0) * Math.PI / 180); ctx.globalAlpha = (l.op ?? 100) / 100;
    if (l.type === 'image') {
      const w = l.size / 100 * W, h = w * l.img.height / l.img.width;
      ctx.drawImage(l.img, -w / 2, -h / 2, w, h); l._bb = { w, h };
    } else drawText(ctx, l, W, H);
    ctx.restore();
  }
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawText(ctx, l, W, H) {
  const fs = l.size / 100 * Math.min(W, H), lines = String(l.text || ' ').split('\n');
  ctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? 800 : 500} ${fs}px "${l.font}", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lh = fs * 1.15, tw = Math.max(...lines.map(s => ctx.measureText(s).width)), th = lh * lines.length;
  const px = l.bgOn ? fs * .55 : 0, py = l.bgOn ? fs * .3 : 0;
  if (l.bgOn) { ctx.fillStyle = l.bg; rr(ctx, -tw / 2 - px, -th / 2 - py, tw + px * 2, th + py * 2, l.round != null ? l.round * fs : fs * .35); ctx.fill(); }
  if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = fs * .18; ctx.shadowOffsetY = fs * .06; }
  lines.forEach((s, i) => {
    const y = -th / 2 + lh * (i + .5);
    if (l.stOn) { ctx.lineJoin = 'round'; ctx.lineWidth = fs * .14; ctx.strokeStyle = l.st; ctx.strokeText(s, 0, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = l.color; ctx.fillText(s, 0, y);
  });
  l._bb = { w: tw + px * 2, h: th + py * 2 };
}
