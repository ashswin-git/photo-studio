import { mk, render, outSize, subjectMatrix, subjectBox, boxCorners, aabb, adjust, adjKey, ADJ_KEYS, PRESETS, COLORS, GRADS, TEMPLATES, cleanMask, composeSubject, holeFill, oid } from './render.js';
const $ = id => document.getElementById(id);
const ai = () => import('./ai.js');
const view = $('view'), stage = $('stage');
const MAXSIDE = 2500, PREV = 1600;
// Edge refinement is the only heavy per-change step; in the editor it runs in a worker (latest request wins),
// the preview shows a quick cut-out meanwhile. Falls back to an idle-time main-thread pass if workers can't do it.
let worker = null, wOK = typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined', wid = 0;
const wJobs = new Map();
function getWorker() {
  if (!wOK) return null;
  if (!worker) { try { worker = new Worker(new URL('./refine-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = onWorker; worker.onerror = () => { wOK = false; worker = null; wJobs.forEach(j => j.fallback()); wJobs.clear(); }; } catch { wOK = false; return null; } }
  return worker;
}
function onWorker(e) {
  const { id, bmp, err } = e.data, j = wJobs.get(id); wJobs.delete(id); if (!j) return;
  if (err || !bmp) { wOK = false; return j.fallback(); }
  const c = mk(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.(); j.done(c);
}
function refineAsync(c, sk) {
  const apply = s => { if (c.subK === sk) { c.subj = s; c.refined = sk; c.busy = false; if (doc && doc._P === c) { doc.subj = s; draw(); } } else c.busy = false; pump(c); };
  const fallback = () => setTimeout(() => { if (c.subK === sk) apply(composeSubject(c.adj, c.sm, true)); else { c.busy = false; pump(c); } }, 30);
  c.busy = true; const w = getWorker(); if (!w) return fallback();
  const id = ++wid; wJobs.set(id, { done: apply, fallback });
  Promise.all([createImageBitmap(c.adj), createImageBitmap(c.sm)]).then(([adj, mask]) => w.postMessage({ id, adj, mask }, [adj, mask])).catch(() => { wJobs.delete(id); fallback(); });
}
function pump(c) { if (!c.busy && c.want && c.want === c.subK && c.refined !== c.subK) refineAsync(c, c.subK); }

// ---------------- state ----------------
const defaultStyle = () => ({
  bg: { type: 'color', color: '#ffffff', grad: GRADS[0], tpl: 'Studio white', img: null, blur: 4 },
  size: { preset: 'orig', w: 0, h: 0 }, pad: 8,
  shadow: { type: 'soft', op: 35, blur: 35, ang: 90, dist: 20, color: '#000000' },
  refl: { on: false, op: 35, len: 40 },
  outline: { on: false, w: 12, color: '#ffffff' },
  adj: {}, preset: 'None', refine: true,
  subj: { x: .5, y: .5, s: 1, rot: 0, fx: 1, fy: 1 },
  layers: []
});
const S = defaultStyle();
const EX = { fmt: 'png', q: 92, trans: false, up: 1, name: 'photo-studio' };
let doc = null, tool = 'move', sel = null, tab = 'bg', cutMode = 'erase', busyCancel = false;
window.__ps = { S, EX, get doc() { return doc; }, get hist() { return hist.st.map(h => h.S.size.preset + ':' + h.S.size.w + 'x' + h.S.size.h).concat(['i=' + hist.i]); } }; // for debugging / tests

// ---------------- helpers ----------------
function toast(msg, ms = 3200) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function busy(txt, f, cancellable) { $('status').style.display = 'flex'; $('stxt').textContent = txt; $('sbar').style.width = Math.round((f || 0) * 100) + '%'; $('scancel').hidden = !cancellable; }
function idle() { $('status').style.display = 'none'; }
const loadImg = src => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('Could not read image')); i.src = src; });
function toCanvas(img, max = MAXSIDE) { const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(w, h)); const c = mk(w * k, h * k), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height); return c; }
const clone = c => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
const blobOf = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
const baseName = n => (n || 'photo').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'photo';

// ---------------- document ----------------
async function newDoc(file) {
  const url = URL.createObjectURL(file), img = await loadImg(url); URL.revokeObjectURL(url);
  const src = toCanvas(img); return { name: baseName(file.name), src, base: src, mask: null, hasCut: false, ver: 0 };
}
async function runCutout(d, label = '') {
  const { cutout, alphaBox } = await ai();
  const blob = await blobOf(d.base, 'image/png');
  const out = await cutout(blob, (t, f) => busy(`${label}${t}… ${Math.round(f * 100)}%`, f));
  const im = await loadImg(URL.createObjectURL(out));
  const m = mk(d.base.width, d.base.height), x = m.getContext('2d'); x.drawImage(im, 0, 0, m.width, m.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, m.width, m.height);
  if (S.refine) cleanMask(m);
  d.mask = m; d.hasCut = !!alphaBox(m, 20); d.ver++;
}
function fullMask(d) { const m = mk(d.base.width, d.base.height), x = m.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, m.width, m.height); return m; }
function bboxOf(m) { // fast alpha bbox (subsampled)
  const x = m.getContext('2d', { willReadFrequently: true }), W = m.width, H = m.height, d = x.getImageData(0, 0, W, H).data; let a = W, b = H, r = -1, t = -1;
  for (let y = 0; y < H; y += 2) for (let X = 0; X < W; X += 2) if (d[(y * W + X) * 4 + 3] > 20) { if (X < a) a = X; if (X > r) r = X; if (y < b) b = y; if (y > t) t = y; }
  return r < 0 ? { x: 0, y: 0, w: W, h: H } : { x: Math.max(0, a - 1), y: Math.max(0, b - 1), w: Math.min(W, r + 2) - Math.max(0, a - 1), h: Math.min(H, t + 2) - Math.max(0, b - 1) };
}
// recompute derived canvases. Preview uses a downscaled proxy (fast); export uses full resolution.
function scaled(c, P) { if (P >= 1) return c; const n = mk(c.width * P, c.height * P), x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); return n; }
function refresh(d, st = S, o = {}) {
  if (!d) return;
  const full = !!o.full, P = full ? 1 : Math.min(1, PREV / Math.max(d.base.width, d.base.height));
  const c = full ? (d._F ||= { gen: 0 }) : (d._P ||= { gen: 0 });
  if (c.base !== d.base) { c.base = d.base; c.sb = scaled(d.base, P); c.adjK = null; }
  const ak = adjKey(st.adj); if (c.adjK !== ak) { c.adj = adjust(c.sb, st.adj); c.adjK = ak; c.subK = null; }
  const painting = !!d.painting && !full;
  const sk = [oid(d.mask), d.mtick || 0, d.hasCut, st.refine, painting, c.adjK].join('|');
  if (c.subK !== sk) {
    const mk2 = [oid(d.mask), d.mtick || 0, d.hasCut].join('|'); if (c.smK !== mk2) { c.sm = d.hasCut && d.mask ? scaled(d.mask, P) : null; c.smK = mk2; }
    c.subK = sk; c.gen++;
    if (!c.sm) c.subj = c.adj;
    else if (full || !st.refine) c.subj = composeSubject(c.adj, c.sm, st.refine);
    else { c.subj = composeSubject(c.adj, c.sm, false); if (!painting) { c.want = sk; pump(c); } }
  }
  d.adj = c.adj; d.subj = c.subj; d.fgen = c.gen;
  d.fill = () => { if (c.fillK !== c.gen) { const k = Math.min(1, 640 / Math.max(c.adj.width, c.adj.height)); c.fill = c.sm ? holeFill(scaled(c.adj, k), scaled(c.sm, k)) : c.adj; /* blurred anyway: low-res is enough */ c.fillK = c.gen; } return c.fill; };
  const bk = [oid(d.mask), d.mtick || 0, d.hasCut].join('|');
  if (!o.keepBox && d._bk !== bk) { d.bbox = d.hasCut && d.mask ? bboxOf(d.mask) : null; d._bk = bk; }
}

// ---------------- history ----------------
const hist = { st: [], i: -1 };
const cloneS = s => ({ ...JSON.parse(JSON.stringify({ ...s, layers: [], bg: { ...s.bg, img: null } })), bg: { ...s.bg }, layers: s.layers.map(l => ({ ...l })) });
// W/H edits typed in quick succession (one burst, <600 ms apart) become one history step; a pause, undo/redo or any other edit ends the burst
let _ct = 0, _pending = false;
function commitSoon(ms = 600) { clearTimeout(_ct); _pending = true; _ct = setTimeout(flushCommit, ms); }
function flushCommit() { if (_pending) commit(); }
const sig = h => JSON.stringify(h.S, (k, v) => (k[0] === '_' || k === 'img') ? undefined : v) + '|' + [h.base, h.mask, h.src].map(oid).join(',') + h.hasCut;
function commit() { clearTimeout(_ct); _pending = false; if (!doc) return; const snap = { S: cloneS(S), base: doc.base, mask: doc.mask, src: doc.src, hasCut: doc.hasCut }; if (hist.i >= 0 && sig(hist.st[hist.i]) === sig(snap)) return; hist.st = hist.st.slice(0, hist.i + 1); hist.st.push(snap); if (hist.st.length > 40) hist.st.shift(); hist.i = hist.st.length - 1; histBtns(); }
function restore(h) { const c = cloneS(h.S); Object.keys(c).forEach(k => S[k] = c[k]); doc.base = h.base; doc.mask = h.mask; doc.src = h.src; doc.hasCut = h.hasCut; doc._bk = null; sel = sel && sel !== 'subject' ? S.layers.find(l => l.id === sel.id) || null : sel; refresh(doc); syncUI(); draw(); }
function undo() { flushCommit(); if (hist.i > 0) { hist.i--; restore(hist.st[hist.i]); histBtns(); } }
function redo() { flushCommit(); if (hist.i < hist.st.length - 1) { hist.i++; restore(hist.st[hist.i]); histBtns(); } }
function histBtns() { $('undo').disabled = hist.i <= 0; $('redo').disabled = hist.i >= hist.st.length - 1; }

// ---------------- start / load ----------------
let pendingReset = false;
function resetAll() {
  const d = defaultStyle(); Object.keys(d).forEach(k => S[k] = d[k]);
  Object.assign(EX, { fmt: 'png', q: 92, trans: false, up: 1 }); $('exFmt').value = 'png'; $('exQ').value = 92; $('exTrans').checked = false; $('exUp').value = '1'; $('exQRow').hidden = true;
  $('cw').value = 1080; $('ch').value = 1080; sel = null; strokes = null; crop = null; cutMode = 'erase'; segSet('cutMode', 'erase'); setTab('bg'); syncUI(); exHint();
}
async function start(file) {
  if (pendingReset || !doc) { resetAll(); pendingReset = false; }
  try {
    busy('Reading photo…', .02);
    const d = await newDoc(file); doc = d; EX.name = d.name + '-studio'; $('exName').value = EX.name;
    S.subj = defaultStyle().subj; sel = 'subject';
    await runCutout(d);
    if (!d.hasCut) { d.mask = fullMask(d); toast('No clear subject found — kept the whole photo.'); }
    refresh(d); hist.st = []; hist.i = -1; commit();
    stage.classList.add('has'); ['compare', 'newphoto', 'quickdl', 'exGo'].forEach(i => $(i).disabled = false);
    idle(); draw();
  } catch (e) { console.error(e); idle(); toast('Could not process this image: ' + e.message, 5000); }
}
function onFiles(list) {
  const fs = [...list].filter(f => f.type.startsWith('image/')); if (!fs.length) return;
  if (fs.length > 1) { addBatch(fs); setTab('batch'); if (!doc) start(fs[0]); } else start(fs[0]);
}

// ---------------- drawing ----------------
let raf = 0; const draw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
let showOrig = false, lastR = null, guides = null;
function viewFit(W, H) {
  const r = stage.getBoundingClientRect(), mw = Math.max(50, r.width - 28), mh = Math.max(50, r.height - 28), k = Math.min(mw / W, mh / H), dpr = Math.min(2, devicePixelRatio || 1);
  view.style.width = Math.round(W * k) + 'px'; view.style.height = Math.round(H * k) + 'px';
  const px = W * k * dpr * H * k * dpr, cap = px > 1.6e6 ? Math.sqrt(1.6e6 / px) : 1; // keep the preview canvas ≤1.6 MP
  const cw = Math.round(W * k * dpr * cap), ch = Math.round(H * k * dpr * cap); if (view.width !== cw || view.height !== ch) { view.width = cw; view.height = ch; }
  return cw / W;
}
const perf = { last: 0, max: 0, n: 0 }; window.__ps.perf = perf;
function paint() { const t0 = performance.now(); paint_(); const dt = performance.now() - t0; perf.last = dt; if (dt > perf.max) { perf.max = dt; perf.worst = { refresh: perf.refresh, render: perf.render, tool }; } perf.n++; }
function paint_() {
  if (!doc) return; const t0 = performance.now(); refresh(doc, S, { keepBox: tool === 'cutout' }); perf.refresh = performance.now() - t0;
  const ctx = view.getContext('2d');
  if (showOrig) { const sc = viewFit(doc.src.width, doc.src.height); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, view.width, view.height); ctx.drawImage(doc.src, 0, 0, view.width, view.height); return; }
  if (tool === 'crop') return paintCrop();
  const [W, H] = outSize(S, doc), sc = viewFit(W, H);
  const t1 = performance.now(); const r = render(view, doc, S, { sc, ghost: tool === 'cutout', cache: true }); lastR = r; perf.render = performance.now() - t1;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  if (tool === 'retouch' && strokes) { ctx.save(); ctx.transform(r.M.a, r.M.b, r.M.c, r.M.d, r.M.e, r.M.f); ctx.globalAlpha = .55; ctx.drawImage(strokes, 0, 0); ctx.restore(); }
  if (tool === 'move' && sel) {
    ctx.lineWidth = 1.5 / sc; ctx.setLineDash([6 / sc, 4 / sc]); ctx.strokeStyle = '#7c5cff';
    if (sel === 'subject') { const p = boxCorners(r.M, subjectBox(S, doc)); ctx.beginPath(); ctx.moveTo(...p[0]); ctx.lineTo(...p[1]); ctx.lineTo(...p[3]); ctx.lineTo(...p[2]); ctx.closePath(); ctx.stroke(); }
    else if (sel._bb) { ctx.save(); ctx.translate(sel.x * W, sel.y * H); ctx.rotate((sel.rot || 0) * Math.PI / 180); ctx.strokeRect(-sel._bb.w / 2, -sel._bb.h / 2, sel._bb.w, sel._bb.h); ctx.restore(); }
    ctx.setLineDash([]);
    if (guides) { ctx.strokeStyle = '#ff3bd4'; ctx.lineWidth = 1 / sc; if (guides.x) { ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); } if (guides.y) { ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); } }
  }
  sizeInfo();
}

// ---------------- crop tool ----------------
let crop = null;
function paintCrop() {
  const W = doc.base.width, H = doc.base.height, sc = viewFit(W, H), ctx = view.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, view.width, view.height); ctx.drawImage(doc.adj, 0, 0, view.width, view.height);
  if (crop) { const c = normRect(crop); ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(c.x, c.y, c.w, c.h); ctx.fill('evenodd'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / sc; ctx.strokeRect(c.x, c.y, c.w, c.h); }
}
const normRect = c => ({ x: Math.max(0, Math.min(c.x0, c.x1)), y: Math.max(0, Math.min(c.y0, c.y1)), w: Math.abs(c.x1 - c.x0), h: Math.abs(c.y1 - c.y0) });
function applyCrop() {
  if (!crop) return; const c = normRect(crop); if (c.w < 8 || c.h < 8) return toast('Drag a larger box first');
  const cut = s => { const n = mk(c.w, c.h); n.getContext('2d').drawImage(s, c.x, c.y, c.w, c.h, 0, 0, n.width, n.height); return n; };
  doc.src = cut(doc.src); doc.base = cut(doc.base); doc.mask = doc.mask && cut(doc.mask); doc.ver++; doc._bk = null; S.subj = defaultStyle().subj; crop = null; endCrop(); refresh(doc); commit(); draw();
}
function endCrop() { tool = 'move'; $('cropApply').hidden = $('cropCancel').hidden = $('cropHint').hidden = true; $('cropStart').hidden = false; draw(); }

// ---------------- pointer interaction ----------------
const ptrs = new Map(); let drag = null, strokes = null, lastPt = null;
function evOut(e) { const r = view.getBoundingClientRect(), [W, H] = tool === 'crop' ? [doc.base.width, doc.base.height] : outSize(S, doc); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, k: r.width / W }; }
function toImg(p) { const M = subjectMatrix(S, doc, ...outSize(S, doc)); const q = M.inverse().transformPoint(new DOMPoint(p.x, p.y)); return { x: q.x, y: q.y, s: Math.hypot(M.a, M.b) }; }
function hit(p) {
  const [W, H] = outSize(S, doc);
  for (let i = S.layers.length - 1; i >= 0; i--) { const l = S.layers[i]; if (!l._bb) continue; const a = -(l.rot || 0) * Math.PI / 180, dx = p.x - l.x * W, dy = p.y - l.y * H, rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a); if (Math.abs(rx) <= l._bb.w / 2 + 6 && Math.abs(ry) <= l._bb.h / 2 + 6) return l; }
  const q = toImg(p), b = subjectBox(S, doc); if (q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) return 'subject';
  return null;
}
function brushR() { return +(tool === 'retouch' ? $('rtSize').value : $('cutSize').value) / 2; }
function stamp(ctx, x, y, r, mode) {
  // Restore uses a firmer edge so it fully undoes an Erase stroke over the same path
  const hard = mode === 'restore' ? Math.max(.9, +$('cutHard').value / 100) : +$('cutHard').value / 100;
  if (mode === 'retouch') { ctx.fillStyle = '#b388ff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); return; }
  const g = ctx.createRadialGradient(x, y, r * hard * .98, x, y, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
}
function paintTo(e) {
  const p = evOut(e), q = toImg(p), r = brushR() / p.k / q.s;
  const target = tool === 'retouch' ? strokes : doc.mask, ctx = target.getContext('2d'), mode = tool === 'retouch' ? 'retouch' : cutMode;
  const from = lastPt || q, dist = Math.hypot(q.x - from.x, q.y - from.y), n = Math.max(1, Math.ceil(dist / (r * .3)));
  for (let i = 1; i <= n; i++) stamp(ctx, from.x + (q.x - from.x) * i / n, from.y + (q.y - from.y) * i / n, r, mode);
  lastPt = q; if (tool === 'cutout') doc.mtick = (doc.mtick || 0) + 1;
  draw();
}
function hud(e) {
  const h = $('hud'); if (!doc || !(tool === 'retouch' || tool === 'cutout')) { h.style.display = 'none'; return; }
  const sr = stage.getBoundingClientRect(), d = brushR() * 2; h.style.display = 'block'; h.style.width = h.style.height = d + 'px'; h.style.left = (e.clientX - sr.left - d / 2) + 'px'; h.style.top = (e.clientY - sr.top - d / 2) + 'px';
}
view.addEventListener('pointerdown', e => {
  if (!doc) return; view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e);
  const p = evOut(e);
  if (tool === 'crop') { crop = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = { crop: true }; return; }
  if (tool === 'retouch' || tool === 'cutout') {
    if (ptrs.size > 1) return;
    if (tool === 'retouch') { strokes = mk(doc.base.width, doc.base.height); }
    else { doc.mask = clone(doc.mask); doc.painting = true; }
    lastPt = null; drag = { paint: true }; paintTo(e); return;
  }
  if (ptrs.size === 2 && sel) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s0: sel === 'subject' ? S.subj.s : sel.size }; return; }
  sel = hit(p); syncLayerEd();
  if (sel) { const o = sel === 'subject' ? S.subj : sel; drag = { p0: p, x0: o.x, y0: o.y, moved: false }; if (sel !== 'subject' && tab !== 'text') setTab('text'); }
  draw();
});
view.addEventListener('pointermove', e => {
  hud(e); if (!drag || !doc) return; ptrs.set(e.pointerId, e);
  if (drag.crop) { const p = evOut(e); crop.x1 = Math.max(0, Math.min(doc.base.width, p.x)); crop.y1 = Math.max(0, Math.min(doc.base.height, p.y)); draw(); return; }
  if (drag.paint) { if (ptrs.size === 1) paintTo(e); return; }
  if (drag.pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], k = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / drag.pinch; setScale(drag.s0 * k); drag.moved = true; return; }
  if (drag.p0) {
    const p = evOut(e), [W, H] = outSize(S, doc), o = sel === 'subject' ? S.subj : sel;
    let x = drag.x0 + (p.x - drag.p0.x) / W, y = drag.y0 + (p.y - drag.p0.y) / H; guides = {};
    if (Math.abs(x - .5) < .012) { x = .5; guides.x = 1; } if (Math.abs(y - .5) < .012) { y = .5; guides.y = 1; }
    o.x = x; o.y = y; drag.moved = true; draw();
  }
});
async function endPtr(e) {
  ptrs.delete(e.pointerId); if (!drag || ptrs.size) return;
  const d = drag; drag = null; guides = null;
  if (d.crop) { draw(); return; }
  if (d.paint) {
    if (tool === 'cutout') { doc.painting = false; doc.mtick++; refresh(doc, S, { keepBox: true }); commit(); draw(); return; }
    if (tool === 'retouch') await doRetouch();
    return;
  }
  if (d.moved) { commit(); syncUI(); }
  draw();
}
view.addEventListener('pointerup', endPtr); view.addEventListener('pointercancel', endPtr);
view.addEventListener('pointerleave', () => { $('hud').style.display = 'none'; });
view.addEventListener('wheel', e => { if (!doc || tool !== 'move' || !sel) return; e.preventDefault(); setScale((sel === 'subject' ? S.subj.s : sel.size) * Math.pow(1.0015, -e.deltaY)); clearTimeout(view._wt); view._wt = setTimeout(commit, 400); }, { passive: false });
view.addEventListener('dblclick', () => { if (sel && sel !== 'subject' && sel.type === 'text') { setTab('text'); $('txVal').focus(); } });
function setScale(v) { if (sel === 'subject') { S.subj.s = Math.max(.05, Math.min(5, v)); $('sjScale').value = Math.round(S.subj.s * 100); } else if (sel) { sel.size = Math.max(1, Math.min(100, v)); if (sel.type === 'text') $('txSize').value = sel.size; else $('lySize').value = sel.size; } draw(); }

async function doRetouch() {
  const st = strokes; if (!st) return;
  try {
    const { inpaint } = await ai();
    busy('Preparing object remover…', 0);
    const nb = await inpaint(doc.base, st, (t, f) => busy(t, f));
    doc.base = nb;
    if ($('rtCut') && $('rtCut').checked && doc.mask) { const m = clone(doc.mask), x = m.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.filter = 'blur(2px)'; x.drawImage(st, 0, 0); doc.mask = m; }
    doc.ver++; strokes = null; refresh(doc); commit(); idle(); draw();
  } catch (e) { console.error(e); strokes = null; idle(); draw(); toast('Object remover failed: ' + e.message, 6000); }
}

// ---------------- UI wiring ----------------
function setTab(t) {
  tab = t; document.querySelectorAll('.rail button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(p => p.hidden = p.dataset.tab !== t);
  const prev = tool; tool = t === 'retouch' ? 'retouch' : t === 'cutout' ? 'cutout' : (tool === 'crop' && t === 'resize' ? 'crop' : 'move');
  if (prev === 'crop' && tool !== 'crop') { crop = null; endCrop(); }
  if (prev === 'cutout' && tool !== 'cutout' && doc) { doc._bk = null; refresh(doc); }
  stage.classList.toggle('brush', tool === 'retouch' || tool === 'cutout');
  draw();
}
document.querySelectorAll('.rail button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

const get = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const set = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
const binds = [];
function bind(id, path, f = 1) {
  const el = $(id), isC = el.type === 'checkbox', isN = el.type === 'range' || el.type === 'number';
  binds.push({ el, path, f, isC, isN });
  el.addEventListener('input', () => { set(S, path, isC ? el.checked : isN ? +el.value / f : el.value); if (path.startsWith('adj.')) { S.preset = 'None'; markPresets(); } draw(); });
  el.addEventListener('change', commit);
}
function syncUI() {
  for (const b of binds) { const v = get(S, b.path); if (b.isC) b.el.checked = !!v; else b.el.value = b.isN ? Math.round((v || 0) * b.f) : v; }
  segSet('shType', S.shadow.type); markBg(); markPresets(); sizeSel.value = S.size.preset; $('customRow').hidden = S.size.preset !== 'custom'; if (S.size.w) { $('cw').value = S.size.w; $('ch').value = S.size.h; } $('bgPick').value = S.bg.type === 'color' ? S.bg.color : $('bgPick').value; syncLayerEd(); sizeInfo();
}
function seg(id, fn) { $(id).querySelectorAll('button').forEach(b => b.onclick = () => { segSet(id, b.dataset.v); fn(b.dataset.v); }); }
function segSet(id, v) { $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }

// background
const swC = $('swColors'), swG = $('swGrads'), swT = $('swTpls');
const transBtn = document.createElement('button'); transBtn.title = 'Transparent'; transBtn.style.background = 'repeating-conic-gradient(#888 0 25%,#ddd 0 50%) 0 0/10px 10px'; transBtn.onclick = () => setBg({ type: 'none' }); swC.appendChild(transBtn); transBtn.dataset.k = 'none';
COLORS.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.title = c; b.dataset.k = 'c' + c; b.onclick = () => setBg({ type: 'color', color: c }); swC.appendChild(b); });
GRADS.forEach((g, i) => { const b = document.createElement('button'); b.style.background = `linear-gradient(135deg,${g[0]},${g[1]})`; b.dataset.k = 'g' + i; b.onclick = () => setBg({ type: 'grad', grad: g }); swG.appendChild(b); });
Object.keys(TEMPLATES).forEach(name => { const b = document.createElement('button'), c = mk(96, 96); TEMPLATES[name](c.getContext('2d'), { W: 96, H: 96, sc: 1, fy: 78, cx: 48, sw: 34 }); b.appendChild(c); const s = document.createElement('span'); s.textContent = name; b.appendChild(s); b.dataset.k = 't' + name; b.title = name; b.onclick = () => setBg({ type: 'template', tpl: name }); swT.appendChild(b); });
document.querySelectorAll('[data-bgmode]').forEach(b => { b.dataset.k = b.dataset.bgmode; b.onclick = () => setBg({ type: b.dataset.bgmode }); });
$('bgPick').oninput = e => { setBg({ type: 'color', color: e.target.value }, true); };
$('bgPick').onchange = commit;
$('bgFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = await loadImg(URL.createObjectURL(f)); setBg({ type: 'image', img: toCanvas(im, 3000) }); };
function setBg(o, noCommit) { Object.assign(S.bg, o); EX.trans = o.type === 'none'; $('exTrans').checked = EX.trans; exHint(); markBg(); draw(); if (!noCommit) commit(); }
function bgKey() { const b = S.bg; return b.type === 'color' ? 'c' + b.color : b.type === 'grad' ? 'g' + GRADS.indexOf(b.grad) : b.type === 'template' ? 't' + b.tpl : b.type; }
function markBg() { const k = bgKey(); document.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === k)); $('blurRow').hidden = S.bg.type !== 'blur'; }
bind('bgBlur', 'bg.blur');

// shadow / reflection / outline
seg('shType', v => { S.shadow.type = v; draw(); commit(); });
bind('shOp', 'shadow.op'); bind('shBlur', 'shadow.blur'); bind('shAng', 'shadow.ang'); bind('shDist', 'shadow.dist'); bind('shCol', 'shadow.color');
bind('rfOn', 'refl.on'); bind('rfOp', 'refl.op'); bind('rfLen', 'refl.len');
bind('olOn', 'outline.on'); bind('olW', 'outline.w'); bind('olCol', 'outline.color');
['#ffffff', '#000000', '#ff3b5c', '#ffd60a', '#2ec4b6', '#7c5cff', '#ff8fab'].forEach(c => { const b = document.createElement('button'); b.style.background = c; b.onclick = () => { S.outline.color = c; S.outline.on = true; syncUI(); draw(); commit(); }; $('olSw').appendChild(b); });

// adjustments
ADJ_KEYS.forEach(([k, label]) => { const l = document.createElement('label'); l.className = 't'; l.innerHTML = `${label} <input type="range" id="adj_${k}" min="${k === 'sharpness' ? 0 : -100}" max="100" value="0">`; $('adjSliders').appendChild(l); bind('adj_' + k, 'adj.' + k); });
Object.keys(PRESETS).forEach(n => { const b = document.createElement('button'); b.textContent = n; b.dataset.p = n; b.onclick = () => { S.adj = { ...PRESETS[n] }; S.preset = n; syncUI(); draw(); commit(); }; $('presets').appendChild(b); });
function markPresets() { $('presets').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === S.preset)); }
$('adjReset').onclick = () => { S.adj = {}; S.preset = 'None'; syncUI(); draw(); commit(); };

// resize presets
const SIZES = [
  ['Common', [['orig', 'Original size'], ['sq', 'Square 1080 × 1080', 1080, 1080], ['custom', 'Custom size…']]],
  ['Marketplaces', [['amazon', 'Amazon 2000 × 2000', 2000, 2000], ['shopify', 'Shopify 2048 × 2048', 2048, 2048], ['etsy', 'Etsy 3000 × 2250 (4:3)', 3000, 2250], ['ebay', 'eBay 1600 × 1600', 1600, 1600], ['flipkart', 'Flipkart 2000 × 2000 (square)', 2000, 2000], ['meesho', 'Meesho 1000 × 1000 (square)', 1000, 1000], ['poshmark', 'Poshmark 1600 × 1600', 1600, 1600], ['depop', 'Depop 1280 × 1280', 1280, 1280], ['vinted', 'Vinted 1200 × 1600 (3:4)', 1200, 1600]]],
  ['Social', [['igpost', 'Instagram post 1080 × 1080', 1080, 1080], ['igport', 'Instagram portrait 1080 × 1350', 1080, 1350], ['igstory', 'Instagram story / Reels 1080 × 1920', 1080, 1920], ['wastatus', 'WhatsApp status 1080 × 1920', 1080, 1920], ['wacat', 'WhatsApp catalog 1080 × 1080', 1080, 1080], ['yt', 'YouTube thumbnail 1280 × 720', 1280, 720], ['fb', 'Facebook post 1200 × 630', 1200, 630], ['fbmp', 'Facebook Marketplace 1080 × 1080', 1080, 1080], ['pin', 'Pinterest pin 1000 × 1500', 1000, 1500], ['x', 'X / Twitter post 1600 × 900', 1600, 900], ['li', 'LinkedIn post 1200 × 627', 1200, 627], ['tiktok', 'TikTok 1080 × 1920', 1080, 1920]]],
  ['Ratios', [['r11', '1:1 (2000 px)', 2000, 2000], ['r45', '4:5', 1600, 2000], ['r34', '3:4', 1500, 2000], ['r43', '4:3', 2000, 1500], ['r169', '16:9', 1920, 1080], ['r916', '9:16', 1080, 1920]]]];
const sizeSel = $('sizePreset'), SZ = {};
SIZES.forEach(([g, items]) => { const og = document.createElement('optgroup'); og.label = g; items.forEach(([k, l, w, h]) => { SZ[k] = [w || 0, h || 0]; const o = document.createElement('option'); o.value = k; o.textContent = l; og.appendChild(o); }); sizeSel.appendChild(og); });
sizeSel.onchange = () => { const k = sizeSel.value; S.size.preset = k; if (k === 'custom') { S.size.w = +$('cw').value; S.size.h = +$('ch').value; } else [S.size.w, S.size.h] = SZ[k]; $('customRow').hidden = k !== 'custom'; sizeInfo(); draw(); commit(); };
// a burst = one pass over W and H; coming back to a field already finished in this burst starts a new step
const burst = { left: new Set() };
['cw', 'ch'].forEach(id => $(id).addEventListener('blur', () => { if (_pending) burst.left.add(id); }));
['cw', 'ch'].forEach(id => $(id).oninput = () => { if (!_pending) burst.left.clear(); else if (burst.left.has(id)) { flushCommit(); burst.left.clear(); } const w = +$('cw').value, h = +$('ch').value; if (w < 16 || h < 16) return; S.size.w = Math.min(8000, w); S.size.h = Math.min(8000, h); sizeInfo(); draw(); commitSoon(); });
function sizeInfo() { if (!doc) return; const [W, H] = outSize(S, doc); $('sizeInfo').textContent = `Output: ${W} × ${H} px`; $('exInfo').textContent = `Output: ${W * EX.up} × ${H * EX.up} px` + (EX.up > 1 ? ' (AI upscaled)' : ''); }
bind('pad', 'pad'); bind('sjScale', 'subj.s', 100); bind('sjRot', 'subj.rot');
$('flipH').onclick = () => { S.subj.fx *= -1; draw(); commit(); };
$('flipV').onclick = () => { S.subj.fy *= -1; draw(); commit(); };
$('sjCenter').onclick = () => { S.subj.x = .5; S.subj.y = .5; draw(); commit(); };
$('sjBottom').onclick = () => { if (!doc) return; const [W, H] = outSize(S, doc), R = aabb(boxCorners(subjectMatrix(S, doc, W, H), subjectBox(S, doc))); S.subj.y += (H * (1 - Math.max(S.pad, 3) / 100) - (R.y + R.h)) / H; draw(); commit(); };
$('cropStart').onclick = () => { if (!doc) return; tool = 'crop'; crop = null; $('cropApply').hidden = $('cropCancel').hidden = $('cropHint').hidden = false; $('cropStart').hidden = true; draw(); };
$('cropApply').onclick = applyCrop; $('cropCancel').onclick = () => { crop = null; endCrop(); };

// cutout tab
seg('cutMode', v => cutMode = v);
$('cutRerun').onclick = async () => { if (!doc) return; try { await runCutout(doc, 'Re-running: '); if (!doc.hasCut) doc.mask = fullMask(doc); doc.hasCut = true; doc._bk = null; refresh(doc); commit(); idle(); draw(); } catch (e) { idle(); toast(e.message); } };
$('cutFull').onclick = () => { if (!doc) return; doc.mask = fullMask(doc); doc.hasCut = false; doc._bk = null; refresh(doc); commit(); draw(); };

// retouch tab
$('rtInfo').innerHTML = '<label class="t">Also cut it out of the product <input type="checkbox" id="rtCut"></label>';
$('rtPreload').onclick = async () => { try { const { preloadLama } = await ai(); await preloadLama((t, f) => busy(t, f)); idle(); toast('Object remover ready'); } catch (e) { idle(); toast(e.message, 5000); } };
['rtSize', 'cutSize'].forEach(id => $(id).oninput = () => { const h = $('hud'); h.style.display = 'block'; const d = +$(id).value; h.style.width = h.style.height = d + 'px'; const r = stage.getBoundingClientRect(); h.style.left = (r.width / 2 - d / 2) + 'px'; h.style.top = (r.height / 2 - d / 2) + 'px'; });

// text & layers
const FONTS = ['Poppins', 'Montserrat', 'Bebas Neue', 'Oswald', 'Playfair Display', 'Pacifico', 'Georgia', 'Impact', 'Courier New', 'system-ui'];
FONTS.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = f; $('txFont').appendChild(o); });
let lid = 1;
const T = (o) => ({ id: lid++, type: 'text', text: 'Your text', font: 'Poppins', size: 8, color: '#111111', bold: true, x: .5, y: .15, rot: 0, op: 100, bgOn: false, bg: '#ff3b5c', stOn: false, st: '#ffffff', shadow: false, ...o });
const DESIGNS = {
  'SALE −50%': () => [T({ text: 'SALE', font: 'Bebas Neue', size: 14, color: '#ffffff', bgOn: true, bg: '#ff3b5c', x: .2, y: .14, rot: -8 }), T({ text: '50% OFF', font: 'Montserrat', size: 5.5, color: '#ff3b5c', bgOn: true, bg: '#ffffff', x: .2, y: .27, rot: -8 })],
  'New arrival': () => [T({ text: 'NEW ARRIVAL', font: 'Montserrat', size: 5, color: '#ffffff', bgOn: true, bg: '#111111', x: .5, y: .08 })],
  'Price tag': () => [T({ text: '₹999', font: 'Poppins', size: 8, color: '#111111', bgOn: true, bg: '#ffd60a', x: .82, y: .86, rot: -6, round: 1 })],
  'Free delivery': () => [T({ text: '🚚  FREE DELIVERY  ·  COD AVAILABLE', font: 'Poppins', size: 3.6, color: '#ffffff', bgOn: true, bg: '#1f7a4d', x: .5, y: .94, round: .2 })],
  'Bestseller': () => [T({ text: '★ BESTSELLER', font: 'Oswald', size: 5, color: '#1a1200', bgOn: true, bg: '#ffc300', x: .22, y: .08, rot: -4 })],
  'Limited offer': () => [T({ text: 'Limited Offer', font: 'Pacifico', size: 8, color: '#ffffff', stOn: true, st: '#ff3b5c', x: .5, y: .12 }), T({ text: 'ENDS SOON', font: 'Bebas Neue', size: 5, color: '#ff3b5c', x: .5, y: .22 })],
  'Brand title': () => [T({ text: 'YOUR BRAND', font: 'Playfair Display', size: 7, color: '#1d1d1f', x: .5, y: .1 }), T({ text: 'Handcrafted · Premium quality', font: 'Poppins', bold: false, size: 3, color: '#555555', x: .5, y: .17 })],
  'YouTube thumb': () => [T({ text: 'WORTH IT?', font: 'Bebas Neue', size: 18, color: '#ffe600', stOn: true, st: '#000000', shadow: true, x: .27, y: .3, rot: -4 }), T({ text: 'HONEST REVIEW', font: 'Montserrat', size: 6, color: '#ffffff', bgOn: true, bg: '#e00000', x: .27, y: .55, rot: -4 })],
  'Diwali offer': () => [T({ text: '🪔 Diwali Special', font: 'Playfair Display', size: 7, color: '#7a1f00', x: .5, y: .1 }), T({ text: 'Flat 30% OFF', font: 'Montserrat', size: 5, color: '#ffffff', bgOn: true, bg: '#d35400', x: .5, y: .2 })],
  'Instagram promo': () => [T({ text: 'SHOP NOW', font: 'Montserrat', size: 5, color: '#ffffff', bgOn: true, bg: '#7c5cff', x: .5, y: .9, round: 1 }), T({ text: '@yourstore', font: 'Poppins', bold: false, size: 3, color: '#333333', x: .5, y: .97 })]
};
Object.keys(DESIGNS).forEach(n => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => addLayers(DESIGNS[n]()); $('textDesigns').appendChild(b); });
['⭐', '🔥', '✅', '💯', '🎁', '❤️', '🆕', '🏷️', '⚡', '🌿', '💎', '👍', '🛒', '📦', '🎉', '✨'].forEach(s => { const b = document.createElement('button'); b.textContent = s; b.onclick = () => addLayers([T({ text: s, font: 'system-ui', bold: false, size: 12, x: .82, y: .18, color: '#000000' })]); $('stickers').appendChild(b); });
$('addText').onclick = () => addLayers([T({})]);
$('logoFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = toCanvas(await loadImg(URL.createObjectURL(f)), 1600); addLayers([{ id: lid++, type: 'image', img: im, size: 22, x: .85, y: .12, rot: 0, op: 100 }]); e.target.value = ''; };
async function addLayers(ls) {
  if (!doc) return toast('Add a photo first');
  await Promise.all(ls.filter(l => l.type === 'text').map(l => document.fonts.load(`${l.bold ? 800 : 500} 40px "${l.font}"`).catch(() => { })));
  S.layers.push(...ls); sel = ls[ls.length - 1]; tool = 'move'; syncLayerEd(); draw(); commit();
}
function syncLayerEd() {
  const l = sel && sel !== 'subject' ? sel : null; $('layerEd').hidden = !l; if (!l) return;
  const isT = l.type === 'text'; $('textEd').hidden = !isT;
  if (isT) { $('txVal').value = l.text; $('txFont').value = l.font; $('txSize').value = l.size; $('txCol').value = l.color; $('txBold').checked = l.bold; $('txBgOn').checked = l.bgOn; $('txBg').value = l.bg; $('txStOn').checked = l.stOn; $('txSt').value = l.st; $('txSh').checked = l.shadow; }
  $('lySizeRow').hidden = isT; $('lySize').value = l.size; $('lyRot').value = l.rot || 0; $('lyOp').value = l.op ?? 100;
}
const lyBind = (id, k, kind) => { const el = $(id); el.addEventListener('input', async () => { if (!sel || sel === 'subject') return; sel[k] = kind === 'c' ? el.checked : kind === 'n' ? +el.value : el.value; if (k === 'font') await document.fonts.load(`800 40px "${el.value}"`).catch(() => { }); draw(); }); el.addEventListener('change', commit); };
lyBind('txVal', 'text'); lyBind('txFont', 'font'); lyBind('txSize', 'size', 'n'); lyBind('txCol', 'color'); lyBind('txBold', 'bold', 'c'); lyBind('txBgOn', 'bgOn', 'c'); lyBind('txBg', 'bg'); lyBind('txStOn', 'stOn', 'c'); lyBind('txSt', 'st'); lyBind('txSh', 'shadow', 'c'); lyBind('lySize', 'size', 'n'); lyBind('lyRot', 'rot', 'n'); lyBind('lyOp', 'op', 'n');
const selIdx = () => S.layers.indexOf(sel);
$('lyDel').onclick = () => { const i = selIdx(); if (i < 0) return; S.layers.splice(i, 1); sel = null; syncLayerEd(); draw(); commit(); };
$('lyDup').onclick = () => { const i = selIdx(); if (i < 0) return; const n = { ...sel, id: lid++, x: sel.x + .04, y: sel.y + .04 }; S.layers.push(n); sel = n; draw(); commit(); };
$('lyUp').onclick = () => { const i = selIdx(); if (i < 0 || i === S.layers.length - 1) return; S.layers.splice(i, 1); S.layers.splice(i + 1, 0, sel); draw(); commit(); };
$('lyDown').onclick = () => { const i = selIdx(); if (i <= 0) return; S.layers.splice(i, 1); S.layers.splice(i - 1, 0, sel); draw(); commit(); };

// ---------------- export ----------------
function exHint() { const j = EX.fmt === 'jpg'; $('exTrans').disabled = j; $('exTransHint').textContent = j ? 'JPG never supports transparency: transparent areas are filled white. Choose PNG or WEBP for a transparent file.' : EX.trans ? `${EX.fmt.toUpperCase()} will keep a transparent background.` : `${EX.fmt.toUpperCase()} will be fully opaque (transparent areas filled white).`; }
$('exFmt').onchange = e => { EX.fmt = e.target.value; $('exQRow').hidden = EX.fmt === 'png'; exHint(); };
$('exQRow').hidden = true;
$('exQ').oninput = e => EX.q = +e.target.value; $('exTrans').onchange = e => { EX.trans = e.target.checked; exHint(); };
$('exUp').onchange = e => { EX.up = +e.target.value; sizeInfo(); }; $('exName').oninput = e => EX.name = e.target.value;
$('scancel').onclick = () => { busyCancel = true; };
async function renderOut(d, st, withUpscale) {
  refresh(d, st, { full: true }); const [W, H] = outSize(st, d); let c = mk(W, H);
  const trans = EX.trans && EX.fmt !== 'jpg'; render(c, d, st, { sc: 1, transparent: trans });
  if (!trans) { const f = mk(W, H), x = f.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(c, 0, 0); c = f; }
  refresh(d, st);
  let f = withUpscale ? EX.up : 1; while (f > 1 && Math.max(W, H) * f > 8192) f /= 2;
  if (withUpscale && f !== EX.up) toast(f > 1 ? `Image too large for ${EX.up}×, using ${f}×` : 'Image too large to upscale; exporting at 1×');
  if (f > 1) { busyCancel = false; const { upscale } = await ai(); c = await upscale(c, f, (t, p) => busy(t, p, true), () => busyCancel); }
  return c;
}
async function encode(c) {
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[EX.fmt];
  if (EX.fmt === 'jpg') { const f = mk(c.width, c.height), x = f.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height); x.drawImage(c, 0, 0); c = f; }
  return blobOf(c, mime, EX.q / 100);
}
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function download() {
  if (!doc) return;
  try { busy('Rendering…', .1); const c = await renderOut(doc, S, true); busy('Encoding…', .95); const b = await encode(c); idle(); save(b, `${baseName(EX.name) || 'photo-studio'}.${EX.fmt}`); toast(`Saved ${c.width} × ${c.height} ${EX.fmt.toUpperCase()}`); }
  catch (e) { idle(); if (e.message !== 'cancelled') { console.error(e); toast('Export failed: ' + e.message, 5000); } }
}
$('exGo').onclick = download; $('quickdl').onclick = download;

// ---------------- batch ----------------
const batch = [];
function addBatch(files) {
  for (const f of files) { const it = { file: f, name: baseName(f.name), url: URL.createObjectURL(f), status: '…' }; batch.push(it); }
  drawBatch();
}
function drawBatch() {
  $('batchList').innerHTML = ''; batch.forEach((it, i) => { const d = document.createElement('div'); d.innerHTML = `<img src="${it.out || it.url}" alt=""><b>${it.status}</b>`; d.title = it.name + ' (click to edit)'; d.onclick = () => openBatch(i); $('batchList').appendChild(d); });
  $('batchRun').disabled = !batch.length; $('batchInfo').textContent = batch.length ? `${batch.length} photo(s). Export: ${EX.fmt.toUpperCase()}${EX.trans ? ', transparent' : ''}. Uses the current style.` : 'Export format and quality come from the Export tab.';
}
async function openBatch(i) { const it = batch[i]; if (it.doc) { doc = it.doc; S.subj = defaultStyle().subj; refresh(doc); hist.st = []; hist.i = -1; commit(); stage.classList.add('has'); ['compare', 'newphoto', 'quickdl', 'exGo'].forEach(i => $(i).disabled = false); draw(); } else start(it.file); }
$('batchAdd').onclick = () => $('files').click();
$('batchClear').onclick = () => { batch.length = 0; drawBatch(); };
$('batchRun').onclick = async () => {
  const { makeZip } = await import('./zip.js'); const files = [], names = new Set(); busyCancel = false;
  const st = cloneS(S); st.subj = defaultStyle().subj;
  try {
    for (let i = 0; i < batch.length; i++) {
      if (busyCancel) throw new Error('cancelled');
      const it = batch[i], pre = `Photo ${i + 1}/${batch.length}: `;
      busy(pre + 'removing background…', i / batch.length, true);
      if (!it.doc) { it.doc = await newDoc(it.file); await runCutout(it.doc, pre); if (!it.doc.hasCut) it.doc.mask = fullMask(it.doc); }
      const c = await renderOut(it.doc, st, false), b = await encode(c);
      let n = it.name + '-studio'; while (names.has(n)) n += '_'; names.add(n);
      files.push({ name: `${n}.${EX.fmt}`, blob: b }); it.status = '✓'; it.out = URL.createObjectURL(b); drawBatch();
    }
    busy('Creating ZIP…', 1); const z = await makeZip(files); idle(); save(z, 'photo-studio-batch.zip'); toast(`ZIP ready: ${files.length} images`);
  } catch (e) { idle(); if (e.message !== 'cancelled') { console.error(e); toast('Batch failed: ' + e.message, 5000); } }
};

// ---------------- top bar, upload, keyboard ----------------
$('undo').onclick = undo; $('redo').onclick = redo;
const cmp = $('compare'); cmp.addEventListener('pointerdown', () => { showOrig = true; draw(); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cmp.addEventListener(ev, () => { if (showOrig) { showOrig = false; draw(); } }));
$('newphoto').onclick = () => { pendingReset = true; $('file').click(); };
$('pick').onclick = e => { e.stopPropagation(); $('file').click(); };
$('pickmany').onclick = e => { e.stopPropagation(); $('files').click(); };
$('drop').onclick = e => { if (e.target.tagName !== 'IMG') $('file').click(); };
document.querySelectorAll('.samples img').forEach(im => im.onclick = async e => { e.stopPropagation(); const b = await (await fetch(im.src)).blob(); start(new File([b], im.dataset.s + '.jpg', { type: 'image/jpeg' })); });
$('file').onchange = e => { e.target.files[0] && start(e.target.files[0]); e.target.value = ''; };
$('files').onchange = e => { const fs = [...e.target.files]; if (fs.length) { addBatch(fs); setTab('batch'); if (!doc) start(fs[0]); } e.target.value = ''; };
['dragover', 'dragenter'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('hover'); }));
['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => { e.preventDefault(); $('drop').classList.remove('hover'); }));
stage.addEventListener('drop', e => onFiles(e.dataTransfer.files));
window.addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); it && start(it.getAsFile()); });
window.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && sel !== 'subject') $('lyDel').click();
});
new ResizeObserver(draw).observe(stage);
document.fonts.addEventListener('loadingdone', draw);
bind('cutRefine', 'refine');
exHint();
syncUI();
