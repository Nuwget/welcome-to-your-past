/* Pixel-art night window. Everything is drawn crisp on a tiny canvas (no blur anywhere) and scaled
   with integer pixels. Sprites come from a small shaded-ellipse rasteriser: lit by the moon, ordered-dither
   ramps, 1px outlines with a moonlit rim. Beats from window.Levels drive fireworks, city windows, moon halo. */
(() => {
  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = (window.Levels = window.Levels || { bass: 0, mid: 0, treble: 0 });
  const root = document.documentElement;

  /* ---------------------------------------------------------------- tools */
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  class Spr {
    constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); this._c = null; }
    set(x, y, c) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
    canvas() {
      if (this._c) return this._c;
      const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
      const g = c.getContext('2d');
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const v = this.p[y * this.w + x]; if (v) { g.fillStyle = v; g.fillRect(x, y, 1, 1); } }
      return (this._c = c);
    }
  }

  // shaded shape: ramp (dark->light) chosen by lambert + ordered dither, 1px outline, moonlit rim
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
    hd: ['#6a45c4', '#8a68e6', '#a487f2', '#bda4ff'],
    pu: ['#1d0f48', '#35207f', '#5530b4', '#7b4bde', '#a276f4', '#d0b6ff'],   // Dudu: vivid purple
    belly: ['#5530b4', '#7b4bde', '#a276f4', '#c3a2ff'],
    ear: ['#5e2872', '#9a4594', '#d676b6', '#f2a8d4'],
    cream: ['#8272c4', '#a99be8', '#d3c7f8', '#efe9ff'],
    pink: ['#8e3f86', '#d06aae', '#f09ccc'],
    wh: ['#403a74', '#6f68ab', '#a29ad2', '#d5cff0', '#f6f3ff'],
    bk: ['#07050f', '#15112a', '#272248', '#3a3466'],
    cush: ['#2a1244', '#4b2272', '#7b3d98', '#b062b6'],
    metal: ['#150f28', '#2a2244', '#473d6e', '#6a5fa0'],
    shade: ['#5a2410', '#a84e24', '#e88a3a', '#ffc875'],
    mug: ['#221c5c', '#40389a', '#6c62cc', '#a198f0'],
  };
  const OUT = '#16093a', RIM = '#e8dcff';

  /* ---------------------------------------------------------------- sprites */
  // Dudu: flat-shaded lilac bear, big glossy eyes, pale muzzle, tiny "uu" mouth, headphones (as in the hero art)
  function duduHead(blink) {
    const s = new Spr(54, 48), H = PAL.hd, D = '#1a0b3a';
    ell(s, 11, 11, 7.5, 7.5, { ramp: H, outline: OUT, rim: RIM, dither: 0.15 });
    ell(s, 43, 11, 7.5, 7.5, { ramp: H, outline: OUT, rim: RIM, dither: 0.15 });
    ell(s, 11.5, 12, 4.2, 4.2, { ramp: ['#6a45c4', '#7e5ad8'], outline: false, dither: 0.1 });
    ell(s, 42.5, 12, 4.2, 4.2, { ramp: ['#6a45c4', '#7e5ad8'], outline: false, dither: 0.1 });
    ell(s, 27, 27, 21, 17.5, { ramp: H, outline: OUT, rim: RIM, dither: 0.15 });
    // headphone band + cups
    for (let x = 6; x <= 48; x++) {
      const t = (x - 27) / 21, y = Math.round(27 - 17.5 * Math.sqrt(Math.max(0, 1 - t * t)) - 1.5);
      s.set(x, y, '#1d1840'); s.set(x, y + 1, '#2e2766'); s.set(x, y - 1, '#0f0b26');
      if (x > 14 && x < 40) s.set(x, y + 2, '#6a4ee0');
    }
    ell(s, 4.5, 28, 3.8, 8.5, { ramp: ['#0f0b26', '#1d1840', '#2e2766', '#4a3da0'], outline: '#07051a', rim: '#8a6cf0', dither: 0.1 });
    ell(s, 49.5, 28, 3.8, 8.5, { ramp: ['#0f0b26', '#1d1840', '#2e2766', '#4a3da0'], outline: '#07051a', rim: '#8a6cf0', dither: 0.1 });
    px(s, [[3, 27], [3, 28], [3, 29], [50, 27], [50, 28], [50, 29]], '#6a4ee0');
    // blush
    ell(s, 11.5, 34, 3.8, 2.6, { ramp: ['#f08fc0', '#f7a6cf'], outline: false, dither: 0.2 });
    ell(s, 42.5, 34, 3.8, 2.6, { ramp: ['#f08fc0', '#f7a6cf'], outline: false, dither: 0.2 });
    // muzzle
    ell(s, 27, 33.5, 8.5, 5.4, { ramp: ['#b9a2f6', '#cdbafc', '#dccdff'], outline: false, dither: 0.25, light: [0.1, -0.7, 0.7] });
    px(s, [[25, 33], [26, 34], [27, 33], [27, 33], [28, 34], [29, 33]], D);
    px(s, [[26, 33]], D);
    // eyes
    if (blink) {
      px(s, [[15, 28], [16, 28], [17, 28], [18, 28], [19, 28], [35, 28], [36, 28], [37, 28], [38, 28], [39, 28], [14, 27], [20, 27], [34, 27], [40, 27]], D);
    } else {
      ell(s, 17, 28, 3.7, 4.8, { ramp: ['#14082c', '#26124e'], outline: false, dither: 0 });
      ell(s, 37, 28, 3.7, 4.8, { ramp: ['#14082c', '#26124e'], outline: false, dither: 0 });
      px(s, [[16, 25], [17, 25], [16, 26], [17, 26], [36, 25], [37, 25], [36, 26], [37, 26]], '#ffffff');
      px(s, [[18, 30], [38, 30]], '#d0b6ff');
    }
    return s;
  }

  function duduBody() {
    const s = new Spr(40, 31), U = PAL.pu;
    ell(s, 20, 15, 15.5, 14, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 20, 18.5, 9, 9.5, { ramp: PAL.belly, outline: false, dither: 0.8 });
    ell(s, 5.5, 17, 4.6, 8.5, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 34.5, 17, 4.6, 8.5, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 5.5, 25, 3.6, 2.6, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 34.5, 25, 3.6, 2.6, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 12, 27.5, 7, 3.5, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 28, 27.5, 7, 3.5, { ramp: U, outline: OUT, rim: RIM });
    ell(s, 12, 27.8, 3.2, 1.6, { ramp: PAL.pink, outline: false, dither: 0.4 });
    ell(s, 28, 27.8, 3.2, 1.6, { ramp: PAL.pink, outline: false, dither: 0.4 });
    return s;
  }

  function bubuBody() {
    const s = new Spr(48, 30);
    rrect(s, 24, 25, 46, 9, 4, { ramp: PAL.cush, outline: OUT, rim: '#e0a6ee', light: [0.3, -0.7, 0.6] });
    px(s, [[8, 24], [16, 24], [24, 24], [32, 24], [40, 24]], '#c98ad0');
    ell(s, 24, 16, 18.5, 10, { ramp: PAL.wh, outline: '#1a1438', rim: RIM, dither: 0.7 });
    ell(s, 8.5, 20, 6.2, 5.4, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    ell(s, 39.5, 20, 6.2, 5.4, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    ell(s, 14, 21, 7, 4.4, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    ell(s, 34, 21, 7, 4.4, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    return s;
  }

  function bubuHead() {
    const s = new Spr(30, 22);
    ell(s, 5.5, 4.5, 4.6, 4.6, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    ell(s, 24.5, 4.5, 4.6, 4.6, { ramp: PAL.bk, outline: '#04030a', rim: '#8f7fe0', rimT: 0.5 });
    ell(s, 15, 12, 13.5, 9.6, { ramp: PAL.wh, outline: '#1a1438', rim: RIM, dither: 0.7 });
    // closed crescent eyes, tiny mouth (sleeping, like the hero panda)
    px(s, [[6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [5, 10], [12, 10], [7, 12], [8, 12], [9, 12], [10, 12]], '#15102e');
    px(s, [[19, 11], [20, 11], [21, 11], [22, 11], [23, 11], [24, 11], [18, 10], [25, 10], [20, 12], [21, 12], [22, 12], [23, 12]], '#15102e');
    px(s, [[14, 14], [15, 14], [16, 14], [15, 15]], '#2a2250');
    stipple(s, (x, y) => ((x - 5.5) / 3) ** 2 + ((y - 16) / 1.6) ** 2 < 1, '#e27ab8', () => 0.7);
    stipple(s, (x, y) => ((x - 24.5) / 3) ** 2 + ((y - 16) / 1.6) ** 2 < 1, '#e27ab8', () => 0.7);
    return s;
  }

  function lamp() {
    const s = new Spr(16, 32);
    ell(s, 8, 29, 6, 2.6, { ramp: PAL.metal, outline: OUT, rim: '#cdbdff' });
    shape(s, { ramp: PAL.metal, outline: OUT, rim: '#cdbdff', in: (x, y) => x > 7 && x < 9.4 && y > 12 && y < 28, n: (x) => [(x - 8.2) / 1.2, 0, 0.6] });
    shape(s, {
      ramp: PAL.shade, outline: '#2a0f08', dither: 0.5,
      in: (x, y) => { if (y < 3 || y > 13) return false; return Math.abs(x - 8) <= 3 + ((y - 3) / 10) * 5; },
      n: (x) => [(x - 8) / 8, -0.2, 0.7],
    });
    px(s, [[7, 14], [8, 14], [9, 14]], '#fff2c0');
    px(s, [[8, 15]], '#ffe29a');
    return s;
  }

  function mug() {
    const s = new Spr(11, 9);
    rrect(s, 4.5, 4.5, 8, 8, 1.5, { ramp: PAL.mug, outline: OUT, rim: RIM });
    px(s, [[9, 2], [10, 3], [10, 4], [10, 5], [9, 6], [8, 3], [8, 5]], '#6c62cc');
    px(s, [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1]], '#a0623a');
    return s;
  }

  /* ---------------------------------------------------------------- scene state */
  let W, H, PXC, sillH, sillTop, horizon, moon, cluster, curtW;
  let layers = {}, sprites = {}, stars = [], wins = [], beacons = [], clouds = [], rain = [], drops = [], motes = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let shoot = [], nextShoot = 5, plane = null, nextPlane = 30;
  let fw = [], flashes = [];

  const SKY = ['#04061a', '#060922', '#090d2e', '#0e1240', '#151857', '#1e206e', '#2b2584', '#3d2c95', '#52359f', '#6c40a6', '#8d4ea8', '#b3639f'];
  const WINC = ['#ffd98a', '#ffd98a', '#ffd98a', '#ffb86b', '#ff9f5a', '#ff86b4', '#8fd8ff', '#fff4d6'];
  const FWC = [['#ff86b4', '#ffc2da'], ['#ffd98a', '#fff0c0'], ['#8fd8ff', '#d6f2ff'], ['#c9a8ff', '#e8dcff'], ['#ff9f5a', '#ffd2a6'], ['#9dffc9', '#d8ffe9']];

  function buildSky() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = clamp(y / horizon, 0, 1) ** 1.25, v = t * (SKY.length - 1) + (bayer[y & 3][x & 3] - 0.5) * 0.95;
      g.fillStyle = SKY[clamp(Math.round(v), 0, SKY.length - 1)]; g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  function buildMoon() {
    const R = moon.R, m = new Spr(R * 2 + 2, R * 2 + 2), c = R + 1;
    ell(m, c, c, R, R, { ramp: ['#8f86cc', '#b3a9e6', '#d9d1fa', '#f3eeff', '#ffffff'], outline: false, dither: 0.9, light: [-0.4, -0.5, 0.78] });
    [[-0.35, -0.2, 0.2], [0.3, 0.25, 0.26], [0.05, -0.5, 0.13], [-0.4, 0.4, 0.12], [0.45, -0.25, 0.1], [0.0, 0.1, 0.09]].forEach(([dx, dy, r]) => {
      ell(m, c + dx * R, c + dy * R, r * R, r * R, { ramp: ['#9a90d4', '#b8aeea', '#cfc6f4'], outline: false, dither: 0.7, light: [0.5, 0.5, 0.7] });
    });
    const halos = [0.85, 1.1, 1.45].map((k) => {
      const S = (R + 34) * 2, h = new Spr(S, S), cc = S / 2;
      stipple(h, (x, y) => Math.hypot(x - cc, y - cc) > R, 'rgba(150,130,240,.5)', (x, y) => Math.pow(clamp(1 - (Math.hypot(x - cc, y - cc) - R) / 30, 0, 1), 1.7) * k * 0.7);
      stipple(h, (x, y) => Math.hypot(x - cc, y - cc) > R, 'rgba(210,195,255,.55)', (x, y) => Math.pow(clamp(1 - (Math.hypot(x - cc, y - cc) - R) / 12, 0, 1), 2) * k * 0.6);
      return h.canvas();
    });
    return { disc: m.canvas(), halos };
  }

  function buildCloud(w, h, seed) {
    const r = rng(seed), s = new Spr(w, h), blobs = [], n = Math.round(w / 9);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, rad = h * (0.2 + 0.3 * Math.sin(u * Math.PI)) * (0.7 + r() * 0.5);
      blobs.push([u * w, h * 0.84 - rad * 0.85, rad]);
    }
    const inC = (x, y) => y < h * 0.86 && blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 < br * br);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inC(x + 0.5, y + 0.5)) continue;
      const up = inC(x + 0.5, y - 1.5), up2 = inC(x + 0.5, y - 3.5), dn = inC(x + 0.5, y + 2.5);
      s.set(x, y, ['#171a52', '#22246a', '#363385', '#5a52b0'][!up ? 3 : !up2 ? 2 : dn ? 1 : 0]);
    }
    return s.canvas();
  }

  function buildCity(o) {
    const r = rng(o.seed), c = document.createElement('canvas'); c.width = W + 24; c.height = H; const g = c.getContext('2d');
    const list = [];
    let x = 0;
    while (x < W + 24) {
      const bw = Math.round(o.minW + r() * (o.maxW - o.minW)), bh = Math.round(o.minH + r() * (o.maxH - o.minH)), top = o.base - bh;
      g.fillStyle = o.color; g.fillRect(x, top, bw, H - top);
      g.fillStyle = o.edge; g.fillRect(x, top, bw, 1); g.fillRect(x + bw - 1, top, 1, H - top);
      g.fillStyle = o.shade; g.fillRect(x, top + 1, 1, H - top);
      const roof = r();
      if (roof < 0.22) {
        const ah = 4 + Math.round(r() * 6), ax = x + 1 + Math.floor(r() * (bw - 2));
        g.fillStyle = o.edge; g.fillRect(ax, top - ah, 1, ah);
        if (o.windows && r() < 0.7) beacons.push({ x: ax - 8, y: top - ah - 1, ph: r() * 6, layer: o.name });
      } else if (roof < 0.4 && bw > 8) {
        const tx = x + 2 + Math.floor(r() * (bw - 8));
        g.fillStyle = o.edge; g.fillRect(tx + 1, top - 2, 1, 2); g.fillRect(tx + 5, top - 2, 1, 2);
        g.fillStyle = o.color; g.fillRect(tx, top - 6, 7, 4); g.fillStyle = o.edge; g.fillRect(tx, top - 6, 7, 1); g.fillRect(tx + 1, top - 7, 5, 1);
      } else if (roof < 0.6) {
        g.fillStyle = o.edge; g.fillRect(x + 2, top - 2, 3, 2); g.fillStyle = o.color; g.fillRect(x + 2, top - 1, 3, 1);
      }
      if (o.windows) {
        for (let wy = top + 4; wy < sillTop - 4; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 4)
          if (r() < o.density) list.push({ x: wx - 8, y: wy, c: WINC[Math.floor(r() * WINC.length)], on: r() < 0.8, next: r() * 25, layer: o.name });
      } else if (o.dots) {
        for (let wy = top + 3; wy < sillTop - 2; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (r() < 0.07) { g.fillStyle = o.dotColor; g.fillRect(wx, wy, 1, 1); }
      }
      x += bw + (r() < 0.3 ? 1 : 0);
    }
    return { canvas: c, wins: list };
  }

  function buildCurtain(left) {
    const w = curtW, s = new Spr(w, sillTop);
    for (let y = 0; y < sillTop; y++) for (let x = 0; x < w; x++) {
      const hem = Math.round(Math.sin(x * 0.9 + (left ? 0 : 1.7)) * 1.4);
      if (y > sillTop - 2 + hem) continue;
      const fx = left ? x : w - 1 - x, fold = (Math.sin(fx * 0.95 + 0.6) + 1) / 2;
      const tow = (left ? 1 - x / w : x / w) * 0.45;
      const lit = clamp(fold * 0.6 + (left ? 0.04 : 0.38 * (x / w)) + (1 - y / sillTop) * 0.18, 0, 1);
      const v = lit * 3 + (bayer[y & 3][x & 3] - 0.5) * 0.9 - tow * 0.4;
      s.set(x, y, ['#0c0724', '#170f3c', '#251a5a', '#3a2a80'][clamp(Math.round(v), 0, 3)]);
    }
    const tieY = Math.round(sillTop * 0.62);
    for (let x = 0; x < w; x++) { s.set(x, tieY, '#0a0618'); s.set(x, tieY + 1, '#6a54c4'); s.set(x, tieY + 2, '#3f2f92'); s.set(x, tieY + 3, '#0a0618'); }
    for (let y = 0; y < sillTop - 2; y++) s.set(left ? w - 1 : 0, y, '#0a0618');
    return s.canvas();
  }

  function buildFront() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.drawImage(layers.curtL, 0, 0); g.drawImage(layers.curtR, W - curtW, 0);
    g.fillStyle = '#07041a'; g.fillRect(0, 0, W, 3); g.fillStyle = '#2b2065'; g.fillRect(0, 3, W, 1); g.fillStyle = '#120b34'; g.fillRect(0, 4, W, 1);
    const r = rng(9);
    for (let k = 0; k < 3; k++) {
      const x0 = Math.round(W * (0.25 + k * 0.22 + r() * 0.05)), wdt = 3 + k;
      for (let y = 6; y < sillTop - 2; y++) for (let x = 0; x < wdt; x++) {
        const xx = x0 + x + Math.round((y - 6) * 0.45);
        if (((xx + y) & 1) === 0 && bayer[y & 3][xx & 3] < 0.35) { g.fillStyle = 'rgba(200,190,255,.10)'; g.fillRect(xx, y, 1, 1); }
      }
    }
    return c;
  }

  function buildSill() {
    const s = new Spr(W, sillH), r = rng(5);
    for (let y = 0; y < sillH; y++) for (let x = 0; x < W; x++) {
      let c;
      if (y === 0) c = (x * 7 + 3) % 11 < 4 ? '#7d6ad0' : '#5a49ae';
      else if (y < 3) c = ['#3b2c82', '#2f2370'][y - 1];
      else if (y === 3) c = '#4a3a9a';
      else if (y < 9) c = r() < 0.06 ? '#1f1650' : '#171044';
      else if (y === 9) c = '#0c0828';
      else c = (Math.floor(x / 6) & 1) === 0 ? (bayer[y & 3][x & 3] > 0.5 ? '#0c0826' : '#0a0720') : '#09061c';
      s.set(x, y, c);
    }
    for (let x = 0; x < W; x++) if (r() < 0.08) { s.set(x, 1, '#4c3c9c'); s.set(x, 5 + Math.floor(r() * 3), '#241a62'); }
    return s.canvas();
  }

  function glow(rx, ry, color, k) {
    const s = new Spr(rx * 2, ry * 2);
    stipple(s, () => true, color, (x, y) => Math.pow(clamp(1 - Math.hypot((x - rx) / rx, (y - ry) / ry), 0, 1), 1.3) * k);
    return s.canvas();
  }

  function build() {
    const dpr = window.devicePixelRatio || 1;
    const pd = Math.max(2, Math.min(Math.round((innerHeight * dpr) / 205), Math.floor((innerWidth * dpr) / 128)));
    W = Math.floor((innerWidth * dpr) / pd); H = Math.floor((innerHeight * dpr) / pd);
    PXC = pd / dpr;
    cv.width = W; cv.height = H;
    cv.style.width = W * PXC + 'px'; cv.style.height = H * PXC + 'px';
    cv.style.left = (innerWidth - W * PXC) / 2 + 'px'; cv.style.top = (innerHeight - H * PXC) / 2 + 'px';

    sillH = Math.max(24, Math.round(H * 0.15)); sillTop = H - sillH; horizon = Math.round(sillTop * 0.88);
    curtW = clamp(Math.round(W * 0.065), 12, 26);
    const narrow = W < 220, clusterW = narrow ? 108 : 126;
    cluster = { x: W - curtW - 5 - clusterW, w: clusterW };
    moon = { R: Math.max(9, Math.round(H * 0.075)), x: Math.round(Math.min(W - curtW - 24, cluster.x + clusterW * (narrow ? 0.7 : 0.75))), y: Math.round(H * (narrow ? 0.22 : 0.2)) };

    const r = rng(21);
    layers.sky = buildSky();
    layers.moon = buildMoon();
    layers.cloudA = buildCloud(110, 22, 31); layers.cloudB = buildCloud(70, 15, 32); layers.cloudC = buildCloud(150, 26, 33);
    beacons = [];
    layers.far = buildCity({ name: 'far', seed: 41, base: horizon - 6, minH: 8, maxH: 26, minW: 6, maxW: 15, color: '#1b1a52', edge: '#2e2c78', shade: '#16154a', windows: false, dots: true, dotColor: '#4a4296' }).canvas;
    const mid = buildCity({ name: 'mid', seed: 42, base: horizon + 2, minH: 14, maxH: 46, minW: 7, maxW: 17, color: '#0d0c32', edge: '#1f1e60', shade: '#0a0928', windows: true, density: 0.2 });
    const near = buildCity({ name: 'near', seed: 43, base: sillTop - 4, minH: 12, maxH: 34, minW: 9, maxW: 22, color: '#070620', edge: '#15154a', shade: '#05041a', windows: true, density: 0.12 });
    layers.mid = mid.canvas; layers.near = near.canvas;
    wins = mid.wins.concat(near.wins);
    layers.curtL = buildCurtain(true); layers.curtR = buildCurtain(false);
    layers.front = buildFront();
    layers.sill = buildSill();

    sprites = {
      head: [duduHead(false).canvas(), duduHead(true).canvas()], body: duduBody().canvas(),
      bBody: bubuBody().canvas(), bHead: bubuHead().canvas(), lamp: lamp().canvas(), mug: mug().canvas(),
      lampGlow: [glow(30, 19, 'rgba(255,170,80,.5)', 0.65), glow(30, 19, 'rgba(255,190,100,.55)', 0.85)],
      lampPool: glow(32, 4, 'rgba(255,170,80,.5)', 0.9),
    };

    stars = [];
    for (let i = 0; i < Math.round((W * H) / 380); i++) {
      const x = Math.floor(r() * W), y = Math.floor(r() * horizon * 0.82);
      if (Math.hypot(x - moon.x, y - moon.y) < moon.R + 3) continue;
      stars.push({ x, y, ph: r() * 6.28, sp: 0.4 + r() * 1.6, big: r() < 0.07, hi: r() < 0.25 });
    }
    clouds = [
      { c: layers.cloudA, x: W * 0.15, y: Math.round(H * 0.3), v: 1.4 },
      { c: layers.cloudB, x: W * 0.55, y: Math.round(H * 0.12), v: 0.9 },
      { c: layers.cloudC, x: W * 0.8, y: Math.round(H * 0.46), v: 2.2 },
    ];
    rain = Array.from({ length: Math.round(W * 0.55) }, () => ({ x: r() * (W + 30) - 10, y: r() * sillTop, v: 55 + r() * 70, len: 3 + Math.floor(r() * 4), tone: r() < 0.4 ? 1 : 0 }));
    drops = Array.from({ length: Math.max(6, Math.round(W / 16)) }, () => ({ x: Math.floor(r() * (W - curtW * 2 - 6)) + curtW + 3, y: Math.floor(r() * (sillTop - 20)) + 6, wait: r() * 8, len: 0, v: 5 + r() * 9 }));
    motes = Array.from({ length: Math.round(W / 9) }, () => ({ x: r() * W, y: r() * H, v: 2 + r() * 4, ph: r() * 6, c: r() < 0.5 ? 'rgba(200,190,255,.35)' : 'rgba(255,200,150,.3)' }));
    fw = []; flashes = [];

    root.style.setProperty('--px', PXC + 'px');
    root.style.setProperty('--cluster-px', cluster.x * PXC + 'px');
    root.style.setProperty('--sill-px', sillH * PXC + 'px');
    root.style.setProperty('--duo-top-px', (sillH + 68) * PXC + 'px');
    root.style.setProperty('--inset-px', curtW * PXC + 14 + 'px');
    root.style.setProperty('--curt-px', curtW * PXC + 'px');
    drawCover(document.getElementById('coverCanvas'));
  }

  function drawCover(c) {
    if (!c) return;
    const n = 32; c.width = n; c.height = n; const g = c.getContext('2d');
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = (y / n) * (SKY.length - 1) + (bayer[y & 3][x & 3] - 0.5) * 0.9;
      g.fillStyle = SKY[clamp(Math.round(v), 0, SKY.length - 1)]; g.fillRect(x, y, 1, 1);
    }
    const m = new Spr(11, 11);
    ell(m, 5.5, 5.5, 5, 5, { ramp: ['#9a90d4', '#c9c0f0', '#f1ecff', '#fff'], outline: false, dither: 0.8, light: [-0.4, -0.5, 0.78] });
    g.drawImage(m.canvas(), 17, 5);
    const r = rng(77); let x = 0;
    while (x < n) { const bw = 3 + Math.floor(r() * 4), bh = 6 + Math.floor(r() * 9); g.fillStyle = '#0a0828'; g.fillRect(x, n - bh, bw, bh); if (r() < 0.8) { g.fillStyle = '#ffd98a'; g.fillRect(x + 1, n - bh + 2 + Math.floor(r() * 3), 1, 1); } x += bw; }
    g.fillStyle = '#c9baff'; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * n), Math.floor(r() * 12), 1, 1);
  }

  /* ---------------------------------------------------------------- fireworks */
  const rr = rng(1234);
  function launch(x, big) {
    const col = FWC[Math.floor(rr() * FWC.length)];
    fw.push({ x: x == null ? W * (0.12 + rr() * 0.62) : x, y: horizon - 4, ty: H * (0.1 + rr() * 0.26), vy: 62 + rr() * 26, big, col, st: 0, parts: [], t: 0, kind: Math.floor(rr() * 3) });
  }
  function explode(f) {
    const n = f.big ? 76 : 50;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + rr() * 0.2, ring = f.kind === 1 ? 1 : 0.4 + rr() * 0.6;
      const sp = (f.big ? 30 : 22) * (f.kind === 2 && i % 2 ? 0.55 : 1) * ring + rr() * 4;
      f.parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1 + rr() * 0.7 });
    }
    f.st = 1; f.t = 0;
    flashes.push({ x: f.x, y: f.y, t: 0 });
  }
  function drawFireworks(dt) {
    for (const f of fw) {
      f.t += dt;
      if (f.st === 0) {
        f.y -= f.vy * dt;
        ctx.fillStyle = '#fff4d6'; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        ctx.fillStyle = '#ffb86b'; ctx.fillRect(Math.round(f.x), Math.round(f.y) + 1, 1, 1);
        ctx.fillStyle = '#a0623a'; ctx.fillRect(Math.round(f.x), Math.round(f.y) + 2 + Math.round(Math.sin(f.t * 40)), 1, 1);
        if (f.y <= f.ty) explode(f);
      } else {
        for (const p of f.parts) {
          p.life -= dt; if (p.life <= 0) continue;
          p.vy += 22 * dt; p.vx *= 1 - dt * 0.9; p.vy *= 1 - dt * 0.5; p.x += p.vx * dt; p.y += p.vy * dt;
          const k = clamp(p.life / 1.5, 0, 1);
          if (k < 0.18 && Math.floor(f.t * 30 + p.x) % 2) continue;
          ctx.fillStyle = k > 0.78 ? '#ffffff' : k > 0.4 ? f.col[1] : f.col[0];
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          if (k > 0.55) { ctx.fillStyle = f.col[0]; ctx.fillRect(Math.round(p.x - p.vx * 0.03), Math.round(p.y - p.vy * 0.03), 1, 1); }
        }
      }
    }
    fw = fw.filter((f) => f.st === 0 || f.t < 2.2);
    for (const fl of flashes) { fl.t += dt; if (fl.t < 0.14) { ctx.fillStyle = '#ffffff'; const r = fl.t < 0.07 ? 2 : 3; for (let a = -r; a <= r; a++) { ctx.fillRect(Math.round(fl.x) + a, Math.round(fl.y), 1, 1); ctx.fillRect(Math.round(fl.x), Math.round(fl.y) + a, 1, 1); } } }
    flashes = flashes.filter((fl) => fl.t < 0.2);
  }

  /* ---------------------------------------------------------------- frame */
  const hashT = +(location.hash.match(/t=([\d.]+)/) || [])[1] || 0;
  let last = performance.now(), t0 = last, beatCool = 0, fwCool = 0, avg = 0, prevBass = 0, blinkAt = 3, blinkUntil = 0, bob = 0, bPhase = 0, wasOn = false;
  const ZZ = { a: ['###', '..#', '###'], b: ['#####', '...#.', '..#..', '.#...', '#####'] };
  function glyph(rows, x, y, c) { ctx.fillStyle = c; rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') ctx.fillRect(x + i, y + j, 1, 1); })); }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000 + hashT, secs = now / 1000;
    const bass = L.bass, tre = L.treble;
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2); mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2);
    const ox = (k) => Math.round(mouse.x * k);

    // adaptive beat detector: bass jumping above its own slow average
    avg += (bass - avg) * Math.min(1, dt * 0.6);
    beatCool -= dt; fwCool -= dt;
    const rising = bass > prevBass + 0.015;
    const beat = !reduce && rising && beatCool <= 0 && bass > 0.3 && bass > avg * 1.3 + 0.06;
    if (beat) {
      beatCool = 0.2;
      for (let i = 0; i < 4; i++) { const w = wins[Math.floor(rr() * wins.length)]; if (w) w.on = !w.on; }
      if (fwCool <= 0 && fw.length < 3 && bass > avg * 1.45 + 0.1) { launch(null, bass > 0.7); fwCool = 1.3 + rr() * 0.9; }
    }
    prevBass = bass;
    const onNow = document.body.classList.contains('on');
    if (onNow && !wasOn && !reduce) { launch(W * 0.35, false); setTimeout(() => launch(W * 0.55, true), 700); }
    wasOn = onNow;

    ctx.drawImage(layers.sky, 0, 0);

    for (const s of stars) {
      const v = Math.sin(t * s.sp + s.ph) + (s.hi ? tre * 1.4 : 0) + (beat ? 0.5 : 0);
      if (v < -0.6) continue;
      ctx.fillStyle = v > 0.7 ? '#ffffff' : v > 0 ? (s.hi ? '#dcd4ff' : '#b4a8f0') : '#7468c0';
      const sx = s.x + ox(1);
      ctx.fillRect(sx, s.y, 1, 1);
      if (s.big && v > 0.2) { ctx.fillStyle = '#9a8ee8'; ctx.fillRect(sx - 1, s.y, 1, 1); ctx.fillRect(sx + 1, s.y, 1, 1); ctx.fillRect(sx, s.y - 1, 1, 1); ctx.fillRect(sx, s.y + 1, 1, 1); }
    }

    const mx = moon.x + ox(1), hv = bass > 0.5 ? 2 : bass > 0.28 ? 1 : 0, hc = layers.moon.halos[reduce ? 0 : hv];
    ctx.drawImage(hc, Math.round(mx - hc.width / 2), Math.round(moon.y - hc.height / 2));
    ctx.drawImage(layers.moon.disc, mx - moon.R - 1, moon.y - moon.R - 1);

    for (const c of clouds) {
      c.x += c.v * dt * (reduce ? 0.2 : 1);
      if (c.x > W + 4) c.x = -c.c.width - 4;
      ctx.drawImage(c.c, Math.round(c.x) + ox(1), c.y);
    }

    drawFireworks(dt);

    ctx.drawImage(layers.far, -8 + ox(1), 0);
    ctx.drawImage(layers.mid, -8 + ox(2), 0);

    nextPlane -= dt;
    if (nextPlane <= 0 && !plane && !reduce) { plane = { x: -4, y: Math.round(H * (0.1 + rr() * 0.2)), v: 9 }; nextPlane = 50; }
    if (plane) {
      plane.x += plane.v * dt;
      if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff5b6e'; ctx.fillRect(Math.round(plane.x), plane.y, 1, 1); } else { ctx.fillStyle = '#e8f0ff'; ctx.fillRect(Math.round(plane.x) + 2, plane.y, 1, 1); }
      if (plane.x > W + 6) plane = null;
    }
    nextShoot -= dt;
    if (nextShoot <= 0 && !reduce) { shoot.push({ x: W * (0.2 + rr() * 0.6), y: H * (0.04 + rr() * 0.18), life: 0 }); nextShoot = 16 + rr() * 16; }
    shoot = shoot.filter((s) => (s.life += dt) < 0.9);
    for (const s of shoot) {
      const p = s.life / 0.9, hx = Math.round(s.x - p * 70), hy = Math.round(s.y + p * 32);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i < 2 ? '#ffffff' : i < 5 ? '#cfc5ff' : '#7468c0'; ctx.fillRect(hx + Math.round(i * 2.1), hy - i, 1, 1); }
    }

    ctx.drawImage(layers.near, -8 + ox(3), 0);

    for (const w of wins) {
      w.next -= dt; if (w.next < 0 && !reduce) { w.on = !w.on; w.next = 8 + rr() * 40; }
      if (!w.on) continue;
      ctx.fillStyle = w.c; ctx.fillRect(w.x + (w.layer === 'mid' ? ox(2) : ox(3)), w.y, 2, 2);
    }
    ctx.fillStyle = '#ff4d62';
    for (const b of beacons) if (Math.sin(t * 2.2 + b.ph) > 0.2 || beat) ctx.fillRect(b.x + (b.layer === 'mid' ? ox(2) : ox(3)), b.y, 1, 1);

    for (const d of rain) {
      d.y += d.v * dt * (reduce ? 0.4 : 1 + L.mid * 0.5); d.x -= d.v * dt * 0.22;
      if (d.y > sillTop - 1) { d.y = -d.len; d.x = rr() * (W + 30) - 6; }
      ctx.fillStyle = d.tone ? '#7a70d0' : '#4e4698';
      for (let i = 0; i < d.len; i++) ctx.fillRect(Math.round(d.x + i * 0.22), Math.round(d.y - i), 1, 1);
    }

    for (const d of drops) {
      if (d.wait > 0) { d.wait -= dt; d.len = Math.max(0, d.len - dt * 2); }
      else {
        d.y += d.v * dt; d.len = Math.min(11, d.len + d.v * dt);
        if (rr() < dt * 1.2) { d.wait = 1 + rr() * 6; d.v = 5 + rr() * 9; }
        if (d.y > sillTop - 3) { d.y = 5; d.x = Math.floor(rr() * (W - curtW * 2 - 6)) + curtW + 3; d.len = 0; d.wait = rr() * 4; }
      }
      const y = Math.round(d.y), x = Math.round(d.x);
      for (let i = 1; i <= d.len; i++) { ctx.fillStyle = i < 3 ? 'rgba(190,180,255,.45)' : 'rgba(140,128,230,.28)'; ctx.fillRect(x, y - i, 1, 1); }
      ctx.fillStyle = '#7e72d8'; ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = '#ece6ff'; ctx.fillRect(x, y, 1, 1);
    }

    for (const m of motes) {
      m.y -= m.v * dt; m.x += Math.sin(t * 0.5 + m.ph) * 3 * dt;
      if (m.y < -2) { m.y = H + 1; m.x = rr() * W; }
      ctx.fillStyle = m.c; ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }

    ctx.drawImage(layers.front, 0, 0);
    ctx.drawImage(layers.sill, 0, sillTop);

    // props and characters
    const base = sillTop, narrow = W < 220;
    let cx = cluster.x;
    if (!narrow) {
      const flick = Math.sin(t * 9) > 0.93 || beat ? 1 : 0;
      ctx.drawImage(sprites.lampPool, cx - 16, base - 5);
      ctx.drawImage(sprites.lampGlow[flick], cx - 14, base - 37);
      ctx.drawImage(sprites.lamp, cx, base - 32);
      cx += 20;
    } else cx += 2;
    const dx = cx, bx = cx + 44;

    bPhase += dt;
    const breathe = Math.sin(bPhase * 1.4) > 0.2 ? 1 : 0;
    ctx.drawImage(sprites.bBody, bx, base - 30);
    ctx.drawImage(sprites.bHead, bx + 9, base - 34 + breathe);

    ctx.drawImage(sprites.body, dx + 10, base - 31);
    if (secs > blinkAt) { blinkUntil = secs + 0.14; blinkAt = secs + 2.6 + rr() * 3.4; }
    bob += ((!reduce && bass > 0.4 ? 1 : 0) - bob) * Math.min(1, dt * 22);
    ctx.drawImage(sprites.head[secs < blinkUntil ? 1 : 0], dx + 3, base - 67 - Math.round(bob));

    cx = bx + 50;
    ctx.drawImage(sprites.mug, cx, base - 9);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i * 0.33) % 1;
      ctx.fillStyle = `rgba(225,215,255,${(1 - ph) * 0.7})`;
      ctx.fillRect(cx + 4 + Math.round(Math.sin(ph * 6 + i) * 1.2), Math.round(base - 11 - ph * 12), 1, 1);
    }
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.28 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      glyph(i === 1 ? ZZ.b : ZZ.a, bx + 30 + Math.round(ph * 6 + Math.sin(ph * 5) * 1.5), Math.round(base - 42 - ph * 16), '#d9d0ff');
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => { clearTimeout(build.h); build.h = setTimeout(build, 120); });
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.target !== cv && e.target.tagName !== 'BODY' && e.target.tagName !== 'MAIN') return;
    const x = (e.clientX - parseFloat(cv.style.left)) / PXC;
    if (fw.length < 5) launch(clamp(x, curtW + 4, W - curtW - 4), false); // click the sky: fireworks
  });

  build();
  requestAnimationFrame(frame);

  // debug: #sprites shows the sprites enlarged
  if (/sprites/.test(location.hash)) {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#2a2060;margin:0;overflow:auto';
    [duduHead(false), duduHead(true), duduBody(), bubuBody(), bubuHead(), lamp(), mug()].forEach((sp) => {
      const c = sp.canvas(); c.style.cssText = `image-rendering:pixelated;width:${sp.w * 9}px;height:${sp.h * 9}px;margin:8px;background:#0b0830`; document.body.appendChild(c);
    });
  }
})();
