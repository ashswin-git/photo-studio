// Edge refinement (colour decontamination + background-hole removal) runs here, off the main thread,
// so sliders and clicks never wait for it. The main thread shows a quick cut-out until the refined one arrives.
import { composeSubject } from './render.js';
self.onmessage = e => {
  const { id, adj, mask } = e.data;
  try {
    const a = new OffscreenCanvas(adj.width, adj.height); a.getContext('2d').drawImage(adj, 0, 0); adj.close();
    const m = new OffscreenCanvas(mask.width, mask.height); m.getContext('2d').drawImage(mask, 0, 0); mask.close();
    const s = composeSubject(a, m, true), bmp = s.transferToImageBitmap ? s.transferToImageBitmap() : null;
    if (!bmp) throw new Error('no bitmap');
    self.postMessage({ id, bmp }, [bmp]);
  } catch (err) { self.postMessage({ id, err: String(err && err.message || err) }); }
};
