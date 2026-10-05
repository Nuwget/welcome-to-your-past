/* Pixel-art toolkit and character/prop sprites (Dudu, Bubu, lamp, mug) plus the light sprites.
   Everything is rasterised once at build time onto tiny canvases; scene.js only blits them. */
window.Art = (() => {
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  class Spr {
    constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); this._c = null; }
    set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
    get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : null; }
    canvas() {
      if (this._c) return this._c;
      const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
      const g = c.getContext('2d');
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const v = this.p[y * this.w + x]; if (v) { g.fillStyle = v; g.fillRect(x, y, 1, 1); } }
      return (this._c = c);
    }
  }

  // shaded shape: ramp (dark->light) picked by lambert + a touch of ordered dither, 1px outline, lit rim
  function shape(s, o) {
    const { w, h } = s, ins = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ins[y * w + x] = o.in(x + 0.5, y + 0.5) ? 1 : 0;
    const Lt = o.light || [0.55, -0.6, 0.58], n = o.ramp.length, dith = o.dither == null ? 0.8 : o.dither;
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ins[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!ins[y * w + x]) continue;
      const [nx, ny, nz] = o.n(x + 0.5, y + 0.5);
      const d = nx * Lt[0] + ny * Lt[1] + nz * Lt[2];
      const t = clamp((d + 0.3) / 1.3, 0, 1);
      const v = t * (n - 1) + (bayer[y & 3][x & 3] - 0.5) * dith;
      let c = o.ramp[clamp(Math.round(v), 0, n - 1)];
      const edge = !(at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1));
      if (edge && o.outline !== false) {
        const lit = o.rim && nx * Lt[0] + ny * Lt[1] > (o.rimT == null ? 0.38 : o.rimT);
        c = lit ? o.rim : (o.outline || o.ramp[0]);
      }
      s.set(x, y, c);
    }
  }
  function ell(s, cx, cy, rx, ry, o) {
    shape(s, {
      ...o,
      in: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      n: (x, y) => { const a = (x - cx) / rx, b = (y - cy) / ry, z = Math.sqrt(Math.max(0, 1 - a * a - b * b)), l = Math.hypot(a, b, z) || 1; return [a / l, b / l, z / l]; },
    });
  }
  function rrect(s, cx, cy, w, h, r, o) {
    const hw = w / 2, hh = h / 2;
    shape(s, {
      ...o,
      in: (x, y) => {
        const dx = Math.abs(x - cx) - (hw - r), dy = Math.abs(y - cy) - (hh - r);
        if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh;
        return Math.hypot(dx, dy) <= r;
      },
      n: (x, y) => { const a = ((x - cx) / hw) ** 3, b = ((y - cy) / hh) ** 3, z = Math.sqrt(Math.max(0.06, 1 - a * a - b * b)), l = Math.hypot(a, b, z); return [a / l, b / l, z / l]; },
    });
  }
  function px(s, list, c) { list.forEach(([x, y]) => s.set(x, y, c)); }
  function stipple(s, inFn, color, dens) { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (inFn(x + 0.5, y + 0.5) && dens(x + 0.5, y + 0.5) > bayer[y & 3][x & 3]) s.set(x, y, color); }

  /* ---------------------------------------------------------------- palette */
  const PAL = {
    hd: ['#5b3bb0', '#7a58d8', '#9879f0', '#b8a0ff'],       // Dudu fur
    earIn: ['#5a3aa8', '#7050c8'],
    cream: ['#b3a0f2', '#cbbaff', '#e0d4ff'],
    wh: ['#6f68ab', '#a29ad2', '#d5cff0', '#f6f3ff'],         // Bubu fur
    bk: ['#07050f', '#15112a', '#272248', '#3a3466'],
    metal: ['#150f28', '#2a2244', '#473d6e', '#6a5fa0'],
    shade: ['#6b2a10', '#b5561f', '#f0923a', '#ffd27a'],
    mug: ['#221c5c', '#40389a', '#6c62cc', '#a198f0'],
    cush: ['#2a1244', '#4b2272', '#7b3d98', '#b062b6'],
  };
  const OUT = '#16093a', RIM = '#e8dcff', INK = '#1a0b3a';

  /* ---------------------------------------------------------------- Dudu (the purple bear) */
  function duduEar() {
    const s = new Spr(14, 14);
    ell(s, 7, 7, 6.2, 6.2, { ramp: PAL.hd, outline: OUT, rim: RIM, dither: 0.1 });
    ell(s, 7.2, 7.8, 3.3, 3.3, { ramp: PAL.earIn, outline: false, dither: 0 });
    return s;
  }

  function duduHead(blink, glance) {
    const s = new Spr(50, 38), H = PAL.hd;
    ell(s, 25, 20, 20.5, 16.5, { ramp: H, outline: OUT, rim: RIM, dither: 0.12 });
    // headphone band riding over the crown
    for (let x = 7; x <= 43; x++) {
      const t = (x - 25) / 18.5, y = Math.round(20 - 16.5 * Math.sqrt(Math.max(0, 1 - t * t)) - 0.5);
      s.set(x, y - 1, '#0f0b26'); s.set(x, y, '#1d1840'); s.set(x, y + 1, '#2e2766');
      if (x > 13 && x < 37) s.set(x, y + 2, '#6a4ee0');
    }
    // ear cups
    const cup = { ramp: ['#0f0b26', '#1d1840', '#2e2766', '#4a3da0'], outline: '#07051a', rim: '#8a6cf0', dither: 0 };
    ell(s, 4.4, 22, 3.8, 8, cup); ell(s, 45.6, 22, 3.8, 8, cup);
    px(s, [[3, 20], [3, 21], [3, 22], [46, 20], [46, 21], [46, 22]], '#7a5cf0');
    // blush
    ell(s, 10.5, 29, 3.8, 2.5, { ramp: ['#f08fc0', '#f7a6cf'], outline: false, dither: 0 });
    ell(s, 39.5, 29, 3.8, 2.5, { ramp: ['#f08fc0', '#f7a6cf'], outline: false, dither: 0 });
    // small muzzle and a tiny "w" mouth
    ell(s, 25, 28, 6.6, 4.2, { ramp: PAL.cream, outline: false, dither: 0.12, light: [0.1, -0.7, 0.7] });
    px(s, [[23, 27], [24, 28], [25, 27], [26, 28], [27, 27]], INK);
    // eyes
    const ex = glance ? 1 : 0;
    if (blink) {
      px(s, [[14, 22], [15, 22], [16, 22], [17, 22], [18, 22], [32, 22], [33, 22], [34, 22], [35, 22], [36, 22], [13, 21], [19, 21], [31, 21], [37, 21]], INK);
    } else {
      ell(s, 16 + ex, 22, 3.7, 4.8, { ramp: ['#14082c', '#26124e'], outline: false, dither: 0 });
      ell(s, 34 + ex, 22, 3.7, 4.8, { ramp: ['#14082c', '#26124e'], outline: false, dither: 0 });
      px(s, [[15 + ex, 19], [16 + ex, 19], [15 + ex, 20], [16 + ex, 20], [33 + ex, 19], [34 + ex, 19], [33 + ex, 20], [34 + ex, 20]], '#ffffff');
      px(s, [[17 + ex, 24], [35 + ex, 24]], '#d0b6ff');
    }
    return s;
  }

  function duduBody() {
    const s = new Spr(38, 24), U = PAL.hd;
    ell(s, 19, 11, 15, 11, { ramp: U, outline: OUT, rim: RIM, dither: 0.12 });
    ell(s, 19, 13.5, 8.5, 7.5, { ramp: ['#8a68e6', '#a487f2', '#bda4ff'], outline: false, dither: 0.15 });
    ell(s, 4.2, 14, 3.8, 6.4, { ramp: U, outline: OUT, rim: RIM, dither: 0.12 });
    ell(s, 33.8, 14, 3.8, 6.4, { ramp: U, outline: OUT, rim: RIM, dither: 0.12 });
    ell(s, 11, 21, 6.2, 3, { ramp: U, outline: OUT, rim: RIM, dither: 0.12 });
    ell(s, 27, 21, 6.2, 3, { ramp: U, outline: OUT, rim: RIM, dither: 0.12 });
    ell(s, 11, 21.4, 2.8, 1.4, { ramp: ['#d676b6', '#f2a8d4'], outline: false, dither: 0 });
    ell(s, 27, 21.4, 2.8, 1.4, { ramp: ['#d676b6', '#f2a8d4'], outline: false, dither: 0 });
    return s;
  }

  /* ---------------------------------------------------------------- Bubu (the panda) */
  function bubuEar() {
    const s = new Spr(12, 12);
    ell(s, 6, 6, 5.2, 5.2, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.45, dither: 0 });
    return s;
  }

  function bubuHead(blink) {
    const s = new Spr(42, 33), W = PAL.wh;
    ell(s, 21, 17.5, 17.5, 14.5, { ramp: W, outline: '#1a1438', rim: RIM, dither: 0.12 });
    ell(s, 8, 22.5, 3.6, 2.4, { ramp: ['#f092bc', '#f9b0d0'], outline: false, dither: 0 });
    ell(s, 34, 22.5, 3.6, 2.4, { ramp: ['#f092bc', '#f9b0d0'], outline: false, dither: 0 });
    // dot eyes, wide apart
    if (blink) {
      px(s, [[11, 19], [12, 19], [13, 19], [14, 19], [28, 19], [29, 19], [30, 19], [31, 19]], '#15102e');
    } else {
      ell(s, 13, 18.5, 2.1, 2.9, { ramp: ['#07050f', '#15112a'], outline: false, dither: 0 });
      ell(s, 29, 18.5, 2.1, 2.9, { ramp: ['#07050f', '#15112a'], outline: false, dither: 0 });
      px(s, [[12, 17], [28, 17]], '#9a8ae8');
    }
    // tiny open mouth with a pink tongue
    px(s, [[19, 22], [20, 22], [21, 22], [22, 22], [23, 22], [19, 23], [23, 23], [20, 24], [21, 24], [22, 24]], '#15102e');
    px(s, [[20, 23], [21, 23], [22, 23]], '#f06a9a');
    return s;
  }

  function bubuBody() {
    const s = new Spr(32, 20), W = PAL.wh;
    ell(s, 16, 9, 12.5, 9, { ramp: W, outline: '#1a1438', rim: RIM, dither: 0.12 });
    ell(s, 4.6, 11, 3.5, 5.4, { ramp: W, outline: '#1a1438', rim: RIM, dither: 0.12 });
    ell(s, 27.4, 11, 3.5, 5.4, { ramp: W, outline: '#1a1438', rim: RIM, dither: 0.12 });
    ell(s, 9, 17.5, 5.6, 2.9, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5, dither: 0 });
    ell(s, 23, 17.5, 5.6, 2.9, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5, dither: 0 });
    return s;
  }

  // two paws wrapped around the mug (drawn in front of it)
  function bubuPaws() {
    const s = new Spr(24, 7);
    ell(s, 4, 3.4, 3.6, 3, { ramp: PAL.wh, outline: '#1a1438', rim: RIM, dither: 0.1 });
    ell(s, 20, 3.4, 3.6, 3, { ramp: PAL.wh, outline: '#1a1438', rim: RIM, dither: 0.1 });
    return s;
  }

  /* ---------------------------------------------------------------- props */
  function lamp() {
    const s = new Spr(20, 38), M = PAL.metal;
    ell(s, 10, 35, 7, 2.6, { ramp: M, outline: OUT, rim: '#cdbdff', dither: 0.2 });
    shape(s, { ramp: M, outline: OUT, rim: '#cdbdff', dither: 0, in: (x, y) => x > 9 && x < 11.4 && y > 13 && y < 34, n: (x) => [(x - 10.2) / 1.2, 0, 0.6] });
    shape(s, {
      ramp: PAL.shade, outline: '#2a0f08', dither: 0.2,
      in: (x, y) => { if (y < 3 || y > 14) return false; return Math.abs(x - 10) <= 3 + ((y - 3) / 11) * 6; },
      n: (x) => [(x - 10) / 9, -0.2, 0.7],
    });
    px(s, [[8, 15], [9, 15], [10, 15], [11, 15], [12, 15]], '#fff2c0');
    px(s, [[9, 16], [10, 16], [11, 16]], '#ffe29a');
    px(s, [[10, 2]], '#2a0f08');
    return s;
  }

  function mug() {
    const s = new Spr(11, 9);
    rrect(s, 4.5, 4.5, 8, 8, 1.5, { ramp: PAL.mug, outline: OUT, rim: RIM, dither: 0.2 });
    px(s, [[9, 2], [10, 3], [10, 4], [10, 5], [9, 6], [8, 3], [8, 5]], '#6c62cc');
    px(s, [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1]], '#a0623a');
    return s;
  }

  /* ---------------------------------------------------------------- light sprites */
  // concentric elliptical bands with ordered dither only on the band edges; blended with 'lighter'
  function glowBands(rx, ry, rgb, alphas, k) {
    const c = document.createElement('canvas'); c.width = rx * 2; c.height = ry * 2; const g = c.getContext('2d'), n = alphas.length;
    for (let y = 0; y < ry * 2; y++) for (let x = 0; x < rx * 2; x++) {
      const d = Math.hypot((x + 0.5 - rx) / rx, (y + 0.5 - ry) / ry);
      if (d >= 1) continue;
      const v = Math.pow(1 - d, 1.35) * n * (k || 1) + (bayer[y & 3][x & 3] - 0.5) * 0.9;
      const i = Math.floor(v + 0.5) - 1;
      if (i < 0) continue;
      g.fillStyle = `rgba(${rgb},${alphas[Math.min(n - 1, i)]})`; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  // light cone from a small mouth (topW) widening to botW over h rows
  function lightCone(topW, botW, h, rgb, alphas) {
    const w = botW + 4, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), n = alphas.length;
    for (let y = 0; y < h; y++) {
      const hw = (topW + (botW - topW) * (y / h)) / 2, fade = 1 - (y / h) * 0.55;
      for (let x = 0; x < w; x++) {
        const u = Math.abs(x + 0.5 - w / 2) / hw;
        if (u >= 1) continue;
        const v = (1 - u * u) * fade * n * 1.1 + (bayer[y & 3][x & 3] - 0.5) * 0.9;
        const i = Math.floor(v + 0.5) - 1;
        if (i < 0) continue;
        g.fillStyle = `rgba(${rgb},${alphas[Math.min(n - 1, i)]})`; g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  // warm overlay masked by a sprite's own alpha: how the lamp lights a character from its side
  function litOverlay(src, lx, ly, R, rgb, alphas) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'), n = alphas.length;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const d = Math.hypot(x - lx, (y - ly) * 1.15) / R;
      if (d >= 1) continue;
      const v = Math.pow(1 - d, 1.1) * n + (bayer[y & 3][x & 3] - 0.5) * 0.45;
      const i = Math.floor(v) - 0;
      if (i < 0) continue;
      g.fillStyle = `rgba(${rgb},${alphas[Math.min(n - 1, i)]})`; g.fillRect(x, y, 1, 1);
    }
    g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
    return c;
  }

  return { bayer, clamp, rng, Spr, shape, ell, rrect, px, stipple, PAL, OUT, RIM,
    duduEar, duduHead, duduBody, bubuEar, bubuHead, bubuBody, bubuPaws, lamp, mug, glowBands, lightCone, litOverlay };
})();
