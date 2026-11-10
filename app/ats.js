/* ATS core: parse Alberta legal land descriptions, convert to / from GPS.
   Data: ATS v4.1 section polygons, Government of Alberta (Open Government Licence - Alberta). */
(function (g) {
  'use strict';
  const QLSD = { SE: [1, 2, 7, 8], SW: [3, 4, 5, 6], NW: [11, 12, 13, 14], NE: [9, 10, 15, 16] };
  const QUARTERS = { SW: [0.25, 0.25], SE: [0.75, 0.25], NW: [0.25, 0.75], NE: [0.75, 0.75] };
  let D = null; // loaded data

  function keyOf(m, rge, twp, sec) { return ((m * 100 + rge) * 1000 + twp) * 100 + sec; }

  function load(buf) {
    const dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'ATS3') throw new Error('bad data file');
    const n = dv.getUint32(4, true);
    let o = 8;
    const undelta = (src) => { const out = new Int32Array(n); let acc = 0; for (let i = 0; i < n; i++) out[i] = acc += src[i]; return out; };
    const keys = new Uint32Array(undelta(new Int32Array(buf, o, n)).buffer); o += 4 * n;
    const swLat = undelta(new Int32Array(buf, o, n)); o += 4 * n;
    const swLng = undelta(new Int32Array(buf, o, n)); o += 4 * n;
    const d = new Int16Array(buf, o, n * 6); o += 12 * n;
    // irregular sections: official LSD centres, Map(section index -> 16 slots of [lng, lat] or null)
    const xn = dv.getUint32(o, true); o += 4;
    const X = new Map();
    if (xn) {
      const cum = (src) => { const out = new Int32Array(xn); let acc = 0; for (let i = 0; i < xn; i++) out[i] = acc += src[i]; return out; };
      const xk = cum(new Int32Array(buf.slice(o, o + 4 * xn))); o += 4 * xn;
      const xa = cum(new Int32Array(buf.slice(o, o + 4 * xn))); o += 4 * xn;
      const xo = cum(new Int32Array(buf.slice(o, o + 4 * xn)));
      for (let j = 0; j < xn; j++) {
        const sec = xk[j] >> 4; let a = X.get(sec); if (!a) X.set(sec, a = new Array(16).fill(null));
        a[xk[j] & 15] = [xo[j] / 1e6, xa[j] / 1e6];
      }
    }
    D = { n, keys, swLat, swLng, d, X, grid: null };
    return n;
  }

  // fetch the gzipped grid; if the server already decoded it, use the bytes as they are
  async function fetchGrid(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let buf = await r.arrayBuffer();
    const h = new Uint8Array(buf, 0, 2);
    if (h[0] === 0x1f && h[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return load(buf);
  }

  function find(key) {
    const k = D.keys; let lo = 0, hi = D.n - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (k[mid] === key) return mid; if (k[mid] < key) lo = mid + 1; else hi = mid - 1; }
    return -1;
  }

  // corners as [lng, lat] : SW, SE, NE, NW
  function corners(i) {
    const la = D.swLat[i], lo = D.swLng[i], d = D.d, j = i * 6;
    return [
      [lo / 1e6, la / 1e6],
      [(lo + 2 * d[j + 1]) / 1e6, (la + 2 * d[j]) / 1e6],
      [(lo + 2 * d[j + 3]) / 1e6, (la + 2 * d[j + 2]) / 1e6],
      [(lo + 2 * d[j + 5]) / 1e6, (la + 2 * d[j + 4]) / 1e6],
    ];
  }

  function bilerp(c, u, v) {
    const w = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v];
    let x = 0, y = 0;
    for (let k = 0; k < 4; k++) { x += w[k] * c[k][0]; y += w[k] * c[k][1]; }
    return { lat: y, lng: x };
  }

  // LSD 1..16 -> column (0 = west) and row (0 = south)
  function lsdCell(lsd) {
    const r = Math.floor((lsd - 1) / 4), i = (lsd - 1) % 4;
    return { c: r % 2 === 0 ? 3 - i : i, r };
  }
  function cellLsd(c, r) { return r * 4 + (r % 2 === 0 ? 4 - c : c + 1); }

  function pad(n, w) { return String(n).padStart(w, '0'); }
  function format(p) {
    const tail = `${pad(p.sec, 2)}-${pad(p.twp, 3)}-${pad(p.rge, 2)} W${p.mer}M`;
    if (p.lsd) return `${pad(p.lsd, 2)}-${tail}`;
    if (p.quarter) return `${p.quarter}-${tail}`;
    return tail;
  }

  /* Accepts: 6-12-45-23 W4, 06-12-045-23W4M, 6/12/45/23/4, NE 12-45-23-W4,
     12-45-23-W4 (section), 100/06-12-045-23W4/00 (UWI), 1000612045234 00 etc. */
  function parse(text) {
    let s = String(text || '').toUpperCase().trim();
    if (!s) return { error: 'Enter a legal land location.' };
    s = s.replace(/[–—_]/g, '-');
    let m = s.match(/^\s*[0-9A-Z]{3}\s*\/\s*(.+?)\s*\/\s*\d{1,2}\s*$/); // UWI 100/06-12-045-23W4/00
    if (m) s = m[1];
    const compact = s.replace(/\s+/g, '');
    m = compact.match(/^[0-9][0-9A-Z]{2}(\d{2})(\d{2})(\d{3})(\d{2})W?([4-6])\d{0,2}$/); // 16-char UWI without separators
    if (m && compact.length >= 13) s = `${m[1]}-${m[2]}-${m[3]}-${m[4]}-W${m[5]}`;

    let quarter = null;
    s = s.replace(/\b(NE|NW|SE|SW)\b|^(NE|NW|SE|SW)(?=\d)/, (x) => { quarter = x; return ' '; });
    let mer = null;
    s = s.replace(/W\s*([1-9])\s*(?:TH)?\s*M?\b/, (_, d) => { mer = +d; return ' '; });
    s = s.replace(/\b(?:LSD|SEC|TWP|RGE|MER|L|S|T|R)\b/g, ' ');
    const nums = (s.match(/\d+/g) || []).map(Number);
    if (mer === null) {
      if (nums.length < 4) return { error: 'Need at least section, township, range and meridian (e.g. 6-12-45-23 W4).' };
      mer = nums.pop();
    }
    let lsd = null, sec, twp, rge;
    if (nums.length === 4 && !quarter) [lsd, sec, twp, rge] = nums;
    else if (nums.length === 3) [sec, twp, rge] = nums;
    else return { error: 'Could not read that. Use LSD-SEC-TWP-RGE-MER, e.g. 6-12-45-23 W4.' };
    if (![4, 5, 6].includes(mer)) return { error: `Meridian must be W4, W5 or W6 in Alberta (got W${mer}).` };
    if (lsd !== null && (lsd < 1 || lsd > 16)) return { error: `LSD must be 1 to 16 (got ${lsd}).` };
    if (sec < 1 || sec > 36) return { error: `Section must be 1 to 36 (got ${sec}).` };
    if (twp < 1 || twp > 126) return { error: `Township must be 1 to 126 (got ${twp}).` };
    if (rge < 1 || rge > 30) return { error: `Range must be 1 to 30 (got ${rge}).` };
    const p = { lsd, quarter, sec, twp, rge, mer };
    p.label = format(p);
    p.level = lsd ? 'LSD' : quarter ? 'Quarter section' : 'Section';
    return p;
  }

  function toLatLng(p) {
    if (!D) throw new Error('data not loaded');
    const i = find(keyOf(p.mer, p.rge, p.twp, p.sec));
    if (i < 0) return { error: `${format(p)} is not in the Alberta Township System grid.` };
    const ex = D.X.get(i);
    if (ex) { // irregular section: use the official LSD centres
      const want = p.lsd ? [p.lsd] : p.quarter ? QLSD[p.quarter] : [...Array(16).keys()].map((k) => k + 1);
      const have = want.map((l) => ex[l - 1]).filter(Boolean);
      if (!have.length) return { error: `${format(p)} does not exist: this section is cut short (meridian, border or survey edge).` };
      const lng = have.reduce((t, q) => t + q[0], 0) / have.length, lat = have.reduce((t, q) => t + q[1], 0) / have.length;
      return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), label: format(p), level: p.level, irregular: true };
    }
    const c = corners(i);
    let u = 0.5, v = 0.5;
    if (p.lsd) { const cell = lsdCell(p.lsd); u = (cell.c + 0.5) / 4; v = (cell.r + 0.5) / 4; }
    else if (p.quarter) [u, v] = QUARTERS[p.quarter];
    const pt = bilerp(c, u, v);
    return { lat: +pt.lat.toFixed(6), lng: +pt.lng.toFixed(6), label: format(p), level: p.level };
  }

  // ---- reverse: GPS -> LSD ----
  const CELL = 0.05;
  function gk(x, y) { return Math.floor(y / CELL) * 100000 + Math.floor(x / CELL); }
  function buildGrid() {
    const grid = new Map();
    for (let i = 0; i < D.n; i++) {
      const c = corners(i);
      let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
      for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
          const k = gy * 100000 + gx; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
        }
    }
    D.grid = grid;
  }

  // inverse bilinear by Newton iteration -> (u, v)
  function invBilerp(c, x, y) {
    let u = 0.5, v = 0.5;
    for (let it = 0; it < 12; it++) {
      const p = bilerp(c, u, v);
      const fx = p.lng - x, fy = p.lat - y;
      const dxu = (1 - v) * (c[1][0] - c[0][0]) + v * (c[2][0] - c[3][0]);
      const dyu = (1 - v) * (c[1][1] - c[0][1]) + v * (c[2][1] - c[3][1]);
      const dxv = (1 - u) * (c[3][0] - c[0][0]) + u * (c[2][0] - c[1][0]);
      const dyv = (1 - u) * (c[3][1] - c[0][1]) + u * (c[2][1] - c[1][1]);
      const det = dxu * dyv - dxv * dyu;
      if (!det) break;
      u -= (fx * dyv - fy * dxv) / det; v -= (fy * dxu - fx * dyu) / det;
    }
    return [u, v];
  }

  function fromLatLng(lat, lng) {
    if (!D) throw new Error('data not loaded');
    if (!D.grid) buildGrid();
    let best = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = D.grid.get(gk(lng + dx * CELL, lat + dy * CELL)); if (!a) continue;
      for (const i of a) {
        const [u, v] = invBilerp(corners(i), lng, lat);
        const out = Math.max(0, -u, u - 1, -v, v - 1); // 0 = inside the section
        if (!best || out < best.out) best = { i, u, v, out };
      }
    }
    if (!best || best.out > 0.1) return { error: 'That point is outside the Alberta Township System grid.' };
    const k = D.keys[best.i];
    const sec = k % 100, twp = Math.floor(k / 100) % 1000, rge = Math.floor(k / 100000) % 100, mer = Math.floor(k / 10000000);
    const cl = (t) => Math.min(3, Math.max(0, Math.floor(t * 4)));
    let lsd = cellLsd(cl(best.u), cl(best.v));
    const ex = D.X.get(best.i);
    if (ex) { // irregular section: nearest official LSD centre
      const c = Math.cos(lat * Math.PI / 180); let bd = Infinity;
      ex.forEach((q, k) => { if (!q) return; const dd = ((q[0] - lng) * c) ** 2 + (q[1] - lat) ** 2; if (dd < bd) { bd = dd; lsd = k + 1; } });
    }
    const quarter = Object.keys(QLSD).find((qq) => QLSD[qq].includes(lsd));
    const p = { lsd, sec, twp, rge, mer };
    return { label: format(p), quarterLabel: format({ quarter, sec, twp, rge, mer }), lsd, quarter, sec, twp, rge, mer, onRoadAllowance: best.out > 0 };
  }

  function mapsLinks(lat, lng) {
    const ll = `${lat},${lng}`;
    return {
      directions: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
      pin: `https://www.google.com/maps/search/?api=1&query=${ll}`,
    };
  }

  g.ATS = { load, fetchGrid, parse, toLatLng, fromLatLng, mapsLinks, format, lsdCell, cellLsd, get loaded() { return !!D; } };
})(typeof window !== 'undefined' ? window : globalThis);
