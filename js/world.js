/* The night window. Everything is drawn crisp on a tiny canvas (no blur) and scaled by whole pixels.
   Sprites and light sprites come from art.js. Beats from window.Levels drive fireworks, windows, moon halo.
   Depth, back to front: sky, moon, clouds, far2 / far / mid / near skyline with haze between, wires, rain,
   curtains, wet ledge with puddles, Dudu & Bubu lit by the lamp, a sparse foreground rain. */
(() => {
  const cv = document.getElementById('scene');
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = (window.Levels = window.Levels || { bass: 0, mid: 0, treble: 0 });
  const root = document.documentElement;
  const { bayer, clamp, rng, Spr, ell, stipple } = Art;

  /* ---------------------------------------------------------------- palette */
  const SKY = ['#04061a', '#060922', '#090d2e', '#0e1240', '#151857', '#1e206e', '#2b2584', '#3d2c95', '#52359f', '#6c40a6', '#8d4ea8', '#b3639f'];
  const WINC = ['#ffd98a', '#ffd98a', '#ffd98a', '#ffb86b', '#ff9f5a', '#ff86b4', '#8fd8ff', '#fff4d6'];
  const FWC = [['#ff86b4', '#ffc2da'], ['#ffd98a', '#fff0c0'], ['#8fd8ff', '#d6f2ff'], ['#c9a8ff', '#e8dcff'], ['#ff9f5a', '#ffd2a6'], ['#9dffc9', '#d8ffe9']];
  const NEON = ['#ff5aa0', '#5ad0ff', '#a07aff', '#ffb86b'];

  /* ---------------------------------------------------------------- scene state */
  let cityK = {}, W, H, PXC, sillH, sillTop, FL, baseY, horizon, moon, curtW, narrow;
  let layers = {}, sprites = {}, lit = {}, pos = {}, lampP = {};
  let stars = [], wins = [], beacons = [], neons = [], smokes = [], clouds = [], motes = [], dust = [];
  let rainF = [], rainM = [], rainN = [], drops = [], puddles = [], ripples = [], splashes = [], leaves = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let shoot = [], nextShoot = 5, plane = null, nextPlane = 30;
  let fw = [], flashes = [];

  /* ---------------------------------------------------------------- world builders */
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

  // haze: lavender dither that thickens towards the bottom of the band, sits between skyline layers
  function buildHaze(top, bot, rgba, maxD) {
    const c = document.createElement('canvas'); c.width = W + 24; c.height = H; const g = c.getContext('2d');
    g.fillStyle = rgba;
    for (let y = top; y < bot; y++) { const d = ((y - top) / (bot - top)) * maxD; for (let x = 0; x < W + 24; x++) if (d > bayer[y & 3][x & 3]) g.fillRect(x, y, 1, 1); }
    return c;
  }

  /* skyline layer with roof props, side details and registered emitters (windows, smoke, neon, beacons) */
  function buildCity(o) {
    const r = rng(o.seed), c = document.createElement('canvas'); c.width = W + 24; c.height = H; const g = c.getContext('2d');
    const list = [];
    let x = 0;
    const P = (px_, py_, w_, h_, col) => { g.fillStyle = col; g.fillRect(px_, py_, w_, h_); };
    while (x < W + 24) {
      const bw = Math.round(o.minW + r() * (o.maxW - o.minW)), bh = Math.round((o.minH + r() * (o.maxH - o.minH)) * cityK[o.name]);
      let top = o.base - bh;
      if (narrow && x + bw > moon.x - moon.R - 8 && x < moon.x + moon.R + 8 + 8) top = Math.max(top, moon.y + moon.R + 8); // keep the moon clear of tall towers
      P(x, top, bw, H - top, o.color); P(x, top, bw, 1, o.edge); P(x + bw - 1, top, 1, H - top, o.edge); P(x, top + 1, 1, H - top, o.shade);
      const roof = r();
      if (roof < 0.16) {                                  // antenna mast
        const ah = 4 + Math.round(r() * 7), ax = x + 1 + Math.floor(r() * (bw - 2));
        P(ax, top - ah, 1, ah, o.edge); if (ah > 6) P(ax - 1, top - ah + 2, 3, 1, o.edge);
        if (r() < 0.7) beacons.push({ x: ax - 8, y: top - ah - 1, ph: r() * 6, layer: o.name });
      } else if (roof < 0.3 && bw > 8 && o.props) {       // water tower
        const tx = x + 2 + Math.floor(r() * (bw - 8));
        P(tx + 1, top - 3, 1, 3, o.edge); P(tx + 5, top - 3, 1, 3, o.edge);
        P(tx, top - 8, 7, 5, o.color); P(tx, top - 8, 7, 1, o.edge); P(tx + 1, top - 9, 5, 1, o.edge); P(tx, top - 8, 1, 5, o.edge); P(tx + 3, top - 11, 1, 2, o.edge);
        P(tx + 1, top - 5, 5, 1, o.shade);
      } else if (roof < 0.4) {                            // vent box
        P(x + 2, top - 3, 4, 3, o.edge); P(x + 2, top - 2, 4, 2, o.color);
      } else if (roof < 0.5 && o.props && bw > 7) {       // chimney with a slow smoke emitter
        const cx_ = x + 2 + Math.floor(r() * (bw - 6));
        P(cx_, top - 5, 3, 5, o.edge); P(cx_ + 1, top - 5, 2, 5, o.color);
        smokes.push({ x: cx_ + 1 - 8, y: top - 6, ph: r() * 6, layer: o.name });
      } else if (roof < 0.58 && o.props && bw > 10 && o.name === 'mid') { // roof billboard
        const bx = x + 2, by = top - 9, col = NEON[Math.floor(r() * NEON.length)];
        P(bx + 1, by + 5, 1, 4, o.edge); P(bx + bw - 6, by + 5, 1, 4, o.edge);
        P(bx, by, bw - 4, 6, '#0b0a28'); P(bx, by, bw - 4, 1, o.edge);
        neons.push({ x: bx + 1 - 8, y: by + 1, w: bw - 6, h: 4, c: col, ph: r() * 6, layer: o.name, board: true });
      }
      if (o.windows) {
        for (let wy = top + 4; wy < sillTop - 4; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 4)
          if (r() < o.density) list.push({ x: wx - 8, y: wy, c: WINC[Math.floor(r() * WINC.length)], on: r() < 0.8, next: r() * 25, layer: o.name });
        if (o.props && bw >= 11 && r() < 0.28) {          // fire escape zig-zag on the right side
          for (let fy = top + 7; fy < sillTop - 8; fy += 7) { P(x + bw - 6, fy, 5, 1, o.edge); for (let k = 0; k < 5; k++) g.fillRect(x + bw - 6 + k, fy + 1 + Math.min(5, k), 1, 1); }
        }
        if (o.props && r() < 0.35) {                      // balcony rails
          const by = top + 6 + 4 * Math.floor(r() * Math.max(1, (bh - 14) / 4));
          if (by < sillTop - 8) { P(x + 1, by + 2, bw - 3, 1, o.edge); P(x + 1, by + 3, 1, 1, o.edge); P(x + bw - 3, by + 3, 1, 1, o.edge); }
        }
        if (o.props && bw >= 9 && r() < 0.12) {           // vertical neon sign hanging off the corner
          const nyy = top + 5 + Math.floor(r() * 6);
          P(x + bw, nyy - 1, 1, 9, o.edge);
          neons.push({ x: x + bw + 1 - 8, y: nyy, w: 2, h: 7, c: NEON[Math.floor(r() * NEON.length)], ph: r() * 6, layer: o.name });
        }
      } else if (o.dots) {
        for (let wy = top + 3; wy < sillTop - 2; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (r() < 0.09) { g.fillStyle = o.dotColor; g.fillRect(wx, wy, 1, 1); }
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
      const lit_ = clamp(fold * 0.6 + (left ? 0.04 : 0.38 * (x / w)) + (1 - y / sillTop) * 0.18, 0, 1);
      const v = lit_ * 3 + (bayer[y & 3][x & 3] - 0.5) * 0.9 - tow * 0.4;
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

  // the wet ledge: a stone floor in soft perspective, puddles holding sky colour, a lit front lip, dark face
  function buildSill() {
    const c = document.createElement('canvas'); c.width = W; c.height = sillH; const g = c.getContext('2d'), r = rng(5);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    for (let y = 0; y < FL; y++) {
      const t = y / FL;
      for (let x = 0; x < W; x++) {
        const v = t * 3 + (bayer[y & 3][x & 3] - 0.5) * 0.8;
        g.fillStyle = ['#241a6a', '#1b1356', '#140d44', '#0e0832'][clamp(Math.round(v), 0, 3)]; g.fillRect(x, y, 1, 1);
      }
    }
    P(0, 0, W, 1, '#6c5ac8'); P(0, 1, W, 1, '#3b2c82');
    for (let y = 3; y < FL - 1; y += 1) {                         // slab seams widening towards the viewer
      const sp = 14 + y * 1.3, off = (Math.floor(y / 7) & 1) * (sp / 2);
      for (let x = off; x < W; x += sp) { g.fillStyle = 'rgba(8,5,30,.55)'; g.fillRect(Math.round(x), y, 1, 1); }
    }
    for (const yy of [Math.round(FL * 0.38), Math.round(FL * 0.72)]) { P(0, yy, W, 1, 'rgba(8,5,30,.5)'); P(0, yy + 1, W, 1, 'rgba(120,100,220,.10)'); }
    for (const p of puddles) {
      const y0 = p.y - sillTop;
      for (let dy = -p.ry; dy <= p.ry; dy++) {
        const half = Math.round(p.rx * Math.sqrt(Math.max(0, 1 - (dy / (p.ry + 0.5)) ** 2)));
        const col = dy < -p.ry * 0.4 ? '#4b44b0' : dy < p.ry * 0.3 ? '#34308e' : '#272470';
        P(p.x - half, y0 + dy, half * 2 + 1, 1, col);
      }
      P(p.x - p.rx + 1, y0 + p.ry + 1, p.rx * 2 - 1, 1, '#0a0624');
      for (let k = 0; k < p.rx / 3; k++) { g.fillStyle = r() < 0.4 ? '#ffb86b' : '#a99cf0'; g.fillRect(p.x - p.rx + 2 + Math.floor(r() * (p.rx * 2 - 4)), y0 - 1 + Math.floor(r() * 2), 1, 1); }
    }
    P(0, FL, W, 1, '#8a76e0'); P(0, FL + 1, W, 1, '#4a3a9a'); P(0, FL + 2, W, 1, '#241a62');
    for (let y = FL + 3; y < sillH; y++) for (let x = 0; x < W; x++) {
      const row = Math.floor((y - FL - 3) / 5), br = ((x + (row & 1) * 7) % 14) === 0 || (y - FL - 3) % 5 === 4;
      g.fillStyle = br ? '#07041a' : (bayer[y & 3][x & 3] > 0.55 ? '#0f0a2c' : '#0b0722'); g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  function buildSprites() {
    const A = Art, S = {};
    S.dEar = A.duduEar().canvas();
    S.dHead = [A.duduHead(false, false).canvas(), A.duduHead(true, false).canvas(), A.duduHead(false, true).canvas()];
    S.dBody = A.duduBody().canvas();
    S.bEar = A.bubuEar().canvas();
    S.bHead = [A.bubuHead(false).canvas(), A.bubuHead(true).canvas()];
    S.bBody = A.bubuBody().canvas();
    S.paws = A.bubuPaws().canvas();
    S.lamp = A.lamp().canvas();
    S.mug = A.mug().canvas();
    const warm = '255,168,70';
    S.halo = [A.glowBands(40, 34, warm, [0.05, 0.09, 0.14, 0.2, 0.3], 1), A.glowBands(40, 34, warm, [0.06, 0.1, 0.16, 0.24, 0.34], 1.12)];
    S.cone = [A.lightCone(8, 54, 27, warm, [0.07, 0.12, 0.18, 0.26]), A.lightCone(8, 56, 27, warm, [0.08, 0.14, 0.2, 0.29])];
    S.pool = [A.glowBands(34, 6, warm, [0.08, 0.14, 0.22, 0.32], 1), A.glowBands(34, 6, warm, [0.09, 0.16, 0.25, 0.35], 1.1)];
    S.core = A.glowBands(6, 6, '255,236,180', [0.35, 0.6, 0.85], 1.2);
    return S;
  }

  function build() {
    const dpr = window.devicePixelRatio || 1;
    const pd = Math.max(2, Math.min(Math.round((innerHeight * dpr) / 205), Math.floor((innerWidth * dpr) / (innerHeight > innerWidth * 1.2 ? 118 : 128))));
    W = Math.floor((innerWidth * dpr) / pd); H = Math.floor((innerHeight * dpr) / pd);
    PXC = pd / dpr;
    cv.width = W; cv.height = H;
    cv.style.width = W * PXC + 'px'; cv.style.height = H * PXC + 'px';
    cv.style.left = (innerWidth - W * PXC) / 2 + 'px'; cv.style.top = (innerHeight - H * PXC) / 2 + 'px';

    narrow = W < 220;
    // on phones the player floats over the ledge face, so the ledge is sized from the player's measured height
    const dockEl = document.getElementById('dock'), probe = document.getElementById('sabProbe');
    const sab = probe ? parseFloat(getComputedStyle(probe).paddingBottom) || 0 : 0;
    if (narrow) {
      FL = 22;
      sillH = FL + 3 + Math.ceil(((dockEl ? dockEl.offsetHeight : 140) + sab + 20) / PXC);
    } else { sillH = Math.max(34, Math.round(H * 0.19)); FL = Math.round(sillH * 0.56); }
    sillTop = H - sillH; baseY = sillTop + FL - 8; horizon = Math.round(sillTop * 0.88);
    // phones: tall skyline layers so the city fills the frame instead of leaving an empty sky
    cityK = narrow ? { far2: 1.5, far: 1.9, mid: clamp(H / 100, 1.5, 3), near: clamp(H / 130, 1.3, 2.4) } : { far2: 1, far: 1, mid: 1, near: 1 };
    curtW = clamp(Math.round(W * 0.065), 12, 26);
    moon = narrow
      ? { R: Math.max(9, Math.round(W * 0.1)), x: Math.round(W * 0.74), y: Math.round(H * 0.27) }
      : { R: Math.max(9, Math.round(H * 0.075)), x: Math.round(Math.min(W - curtW - 24, W * 0.8)), y: Math.round(H * 0.19) };

    const r = rng(21);
    layers.sky = buildSky();
    layers.moon = buildMoon();
    layers.cloudA = buildCloud(110, 22, 31); layers.cloudB = buildCloud(70, 15, 32); layers.cloudC = buildCloud(150, 26, 33); layers.cloudD = buildCloud(90, 17, 34);
    beacons = []; neons = []; smokes = [];
    layers.far2 = buildCity({ name: 'far2', seed: 39, base: horizon - 12, minH: 6, maxH: 22, minW: 4, maxW: 11, color: '#17185a', edge: '#262a82', shade: '#141552', windows: false, dots: true, dotColor: '#3c3a96', props: false }).canvas;
    layers.far = buildCity({ name: 'far', seed: 41, base: horizon - 5, minH: 8, maxH: 28, minW: 6, maxW: 15, color: '#1b1a52', edge: '#2e2c78', shade: '#16154a', windows: false, dots: true, dotColor: '#4a4296', props: false }).canvas;
    const mid = buildCity({ name: 'mid', seed: 42, base: horizon + 3, minH: 16, maxH: 50, minW: 8, maxW: 18, color: '#0d0c32', edge: '#1f1e60', shade: '#0a0928', windows: true, density: 0.22, props: true });
    const near = buildCity({ name: 'near', seed: 43, base: sillTop - 4, minH: 12, maxH: 36, minW: 9, maxW: 22, color: '#070620', edge: '#15154a', shade: '#05041a', windows: true, density: 0.12, props: true });
    layers.mid = mid.canvas; layers.near = near.canvas;
    wins = mid.wins.concat(near.wins);
    layers.hazeA = buildHaze(horizon - 20, horizon + 6, 'rgba(120,90,220,.22)', 0.8);
    layers.hazeB = buildHaze(horizon + 4, sillTop - 2, 'rgba(70,50,170,.2)', 0.7);
    layers.curtL = buildCurtain(true); layers.curtR = buildCurtain(false);
    layers.front = buildFront();

    // puddles first (the ledge bakes them in)
    const pr = rng(88); puddles = [];
    const want = narrow ? 3 : 5;
    for (let i = 0; i < want; i++) puddles.push({ x: Math.round(curtW + 8 + ((i + 0.5) / want) * (W - curtW * 2 - 16) + (pr() - 0.5) * 10), y: sillTop + 4 + Math.floor(pr() * (FL - 9)), rx: 7 + Math.floor(pr() * 11), ry: 1 + Math.floor(pr() * 2) });
    layers.sill = buildSill();

    sprites = buildSprites();

    // cluster layout, centred on the window
    const cx0 = Math.round(W / 2);
    const lampX = cx0 - (narrow ? 46 : 54), duX = cx0 - (narrow ? 12 : 14), buX = cx0 + (narrow ? 26 : 30);
    pos = {
      lamp: { x: lampX - 10, y: baseY - 36 },
      dBody: { x: duX - 19, y: baseY - 23 },
      dHead: { x: duX - 25, y: baseY - 23 - 36 + 9 },
      bBody: { x: buX - 16, y: baseY - 19 },
      bHead: { x: buX - 21, y: baseY - 19 - 30 + 7 },
    };
    pos.dEarL = { x: pos.dHead.x + 3, y: pos.dHead.y - 5 }; pos.dEarR = { x: pos.dHead.x + 33, y: pos.dHead.y - 5 };
    pos.bEarL = { x: pos.bHead.x + 1, y: pos.bHead.y - 4 }; pos.bEarR = { x: pos.bHead.x + 29, y: pos.bHead.y - 4 };
    pos.mug = { x: buX - 5, y: baseY - 13 };
    pos.paws = { x: buX - 12, y: baseY - 12 };
    lampP = { x: lampX, y: baseY - 36 + 15 }; // bulb centre

    // the lamp lights Dudu from his left side, Bubu only faintly
    const lw = [0.07, 0.14, 0.24, 0.36];
    const mk = (cvs, p, R) => Art.litOverlay(cvs, lampP.x - p.x, lampP.y - p.y, R, '255,170,80', lw);
    lit = {
      dHead: sprites.dHead.map((c) => mk(c, pos.dHead, 74)), dBody: mk(sprites.dBody, pos.dBody, 74),
      dEarL: mk(sprites.dEar, pos.dEarL, 74), dEarR: mk(sprites.dEar, pos.dEarR, 74),
      bHead: sprites.bHead.map((c) => mk(c, pos.bHead, 88)), bBody: mk(sprites.bBody, pos.bBody, 88),
      bEarL: mk(sprites.bEar, pos.bEarL, 88), bEarR: mk(sprites.bEar, pos.bEarR, 88),
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
      { c: layers.cloudD, x: W * 0.62, y: moon.y - 3, v: 0.8 }, // drifts across the moon now and then
    ];
    const rn = (n_, f) => Array.from({ length: Math.max(3, Math.round(n_)) }, () => f());
    rainF = rn(W * 0.42, () => ({ x: r() * (W + 30) - 10, y: r() * sillTop, v: 38 + r() * 22, len: 2 }));
    rainM = rn(W * 0.3, () => ({ x: r() * (W + 30) - 10, y: r() * sillTop, v: 74 + r() * 52, len: 3 + Math.floor(r() * 3), tone: r() < 0.35 ? 1 : 0, end: sillTop + 2 + r() * (FL - 4) }));
    rainN = rn(W * 0.045, () => ({ x: r() * (W + 30) - 10, y: r() * baseY, v: 150 + r() * 70, len: 7 + Math.floor(r() * 4), end: baseY + 1 + r() * 6 }));
    drops = Array.from({ length: Math.max(6, Math.round(W / 16)) }, () => ({ x: Math.floor(r() * (W - curtW * 2 - 6)) + curtW + 3, y: Math.floor(r() * (sillTop - 20)) + 6, wait: r() * 8, len: 0, v: 5 + r() * 9 }));
    motes = Array.from({ length: Math.round(W / 11) }, () => ({ x: r() * W, y: r() * H, v: 2 + r() * 4, ph: r() * 6, c: r() < 0.5 ? 'rgba(200,190,255,.3)' : 'rgba(255,200,150,.25)' }));
    dust = Array.from({ length: 9 }, () => ({ u: r(), v: r(), ph: r() * 6, s: 1.5 + r() * 2.5 }));
    leaves = Array.from({ length: narrow ? 2 : 3 }, () => ({ x: r() * W, y: sillTop + 4 + r() * (FL - 8), v: 3 + r() * 4, c: r() < 0.5 ? '#6b4a8a' : '#8a5a4a' }));
    ripples = []; splashes = []; fw = []; flashes = [];

    root.style.setProperty('--px', PXC + 'px');
    root.style.setProperty('--sill-px', sillH * PXC + 'px');
    // top of the characters, measured from the bottom of the viewport (the mobile player rests above this)
    root.style.setProperty('--duo-top-px', (H - (pos.dHead.y - 4)) * PXC + 'px');
    root.style.setProperty('--ledge-px', (H - sillTop) * PXC + 'px');
    root.style.setProperty('--inset-px', curtW * PXC + 14 + 'px');
    root.style.setProperty('--curt-px', curtW * PXC + 'px');
  }

  /* ---------------------------------------------------------------- cover art (a little animated window) */
  function drawCover(c, t) {
    if (!c) return;
    const n = 32; if (c.width !== n) { c.width = n; c.height = n; }
    const g = c.getContext('2d');
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = (y / n) * (SKY.length - 1) + (bayer[y & 3][x & 3] - 0.5) * 0.9;
      g.fillStyle = SKY[clamp(Math.round(v), 0, SKY.length - 1)]; g.fillRect(x, y, 1, 1);
    }
    const mm = new Spr(11, 11);
    ell(mm, 5.5, 5.5, 5, 5, { ramp: ['#9a90d4', '#c9c0f0', '#f1ecff', '#fff'], outline: false, dither: 0.8, light: [-0.4, -0.5, 0.78] });
    g.drawImage(mm.canvas(), 18, 4);
    const r = rng(77); let x = 0;
    while (x < n) { const bw = 3 + Math.floor(r() * 4), bh = 6 + Math.floor(r() * 9); g.fillStyle = '#0a0828'; g.fillRect(x, n - bh, bw, bh); if (r() < 0.8) { g.fillStyle = Math.sin(t * 1.3 + x) > 0.9 ? '#0a0828' : '#ffd98a'; g.fillRect(x + 1, n - bh + 2 + Math.floor(r() * 3), 1, 1); } x += bw; }
    for (let i = 0; i < 7; i++) { const sx = Math.floor(r() * n), sy = Math.floor(r() * 12); if (Math.sin(t * (1 + i * 0.4) + i) > -0.3) { g.fillStyle = '#c9baff'; g.fillRect(sx, sy, 1, 1); } }
    // two tiny silhouettes on the ledge, lamp glow beside them
    g.fillStyle = '#7a58d8'; g.fillRect(8, 24, 6, 5); g.fillRect(9, 22, 4, 3); g.fillRect(8, 22, 1, 1); g.fillRect(12, 22, 1, 1);
    g.fillStyle = '#d5cff0'; g.fillRect(17, 25, 5, 4); g.fillRect(17, 23, 4, 3); g.fillStyle = '#15102e'; g.fillRect(17, 22, 1, 1); g.fillRect(20, 22, 1, 1);
    g.fillStyle = 'rgba(255,170,80,.35)'; g.fillRect(3, 19, 3, 3); g.fillStyle = '#ffb86b'; g.fillRect(4, 20, 1, 1);
    g.fillStyle = 'rgba(190,180,255,.5)';
    for (let i = 0; i < 9; i++) { const rx = (i * 37) % n, ry = Math.floor((t * 22 + i * 11) % (n + 6)) - 3; g.fillRect(rx, ry, 1, 2); }
    g.fillStyle = '#16093a'; g.fillRect(0, n - 1, n, 1);
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

  /* ---------------------------------------------------------------- frame helpers */
  const hashT = +(location.hash.match(/t=([\d.]+)/) || [])[1] || 0;
  let last = performance.now(), t0 = last, beatCool = 0, fwCool = 0, avg = 0, prevBass = 0, blinkAt = 3, blinkUntil = 0, bBlinkAt = 5, bBlinkUntil = 0, glanceAt = 8, glanceUntil = 0, earAt = 4, earUntil = 0, earSide = 0, bob = 0, bPhase = 0, wasOn = false, nextRipple = 0, coverAt = 0;

  // how much lamp light a point gets: 0..1 over the halo ellipse, used to warm the rain
  const warmAt = (x, y) => clamp(1 - Math.hypot((x - lampP.x) / 40, (y - lampP.y) / 40), 0, 1);

  // wire sagging between two anchors, 1px, swaying a little
  function wire(x0, y0, x1, y1, sag, t, col) {
    ctx.fillStyle = col;
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0), y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * (sag + (reduce ? 0 : Math.sin(t * 0.9 + u * 3) * 0.7));
      ctx.fillRect(x, Math.round(y), 1, 1);
    }
  }

  // reflect the bottom rows of a sprite into the wet floor, wobbling slightly
  function reflect(cvs, x, bottom, t, alpha, rows) {
    ctx.globalAlpha = alpha;
    for (let k = 0; k < rows; k++) {
      const sy = cvs.height - 1 - k, dx = reduce ? 0 : Math.round(Math.sin(t * 2.1 + k * 0.9 + x) * 0.8);
      if (sy < 0) break;
      ctx.drawImage(cvs, 0, sy, cvs.width, 1, x + dx, bottom + k, cvs.width, 1);
    }
    ctx.globalAlpha = 1;
  }

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

    ctx.drawImage(layers.far2, -8 + ox(0.5), 0);
    ctx.drawImage(layers.far, -8 + ox(1), 0);
    ctx.drawImage(layers.hazeA, -8, 0);
    ctx.drawImage(layers.mid, -8 + ox(1.5), 0);

    // chimney smoke (mid and near roofs)
    for (const sm of smokes) {
      const off = sm.layer === 'mid' ? ox(1.5) : ox(2.5);
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.22 + sm.ph + i * 0.25) % 1;
        ctx.fillStyle = `rgba(150,140,215,${(1 - ph) * 0.45})`;
        const s_ = ph < 0.5 ? 1 : 2;
        ctx.fillRect(Math.round(sm.x + off + ph * 7 + Math.sin(ph * 5 + sm.ph) * 1.2), Math.round(sm.y - ph * 15), s_, s_);
      }
    }
    // neon and billboards: slow pulse, now and then a flicker
    for (const n_ of neons) {
      const off = n_.layer === 'mid' ? ox(1.5) : ox(2.5);
      const fl = Math.sin(t * 0.8 + n_.ph) > -0.7 && !(Math.sin(t * 13 + n_.ph * 5) > 0.97);
      if (!fl) continue;
      ctx.globalAlpha = n_.board ? 0.8 : 1; ctx.fillStyle = n_.c; ctx.fillRect(n_.x + off, n_.y, n_.w, n_.h);
      ctx.globalAlpha = 0.14; ctx.fillRect(n_.x + off - 2, n_.y - 2, n_.w + 4, n_.h + 4);
      ctx.globalAlpha = 1;
    }

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

    ctx.drawImage(layers.hazeB, -8, 0);
    ctx.drawImage(layers.near, -8 + ox(2.5), 0);

    for (const w of wins) {
      w.next -= dt; if (w.next < 0 && !reduce) { w.on = !w.on; w.next = 8 + rr() * 40; }
      if (!w.on) continue;
      ctx.fillStyle = w.c; ctx.fillRect(w.x + (w.layer === 'mid' ? ox(1.5) : ox(2.5)), w.y, 2, 2);
    }
    ctx.fillStyle = '#ff4d62';
    for (const b of beacons) { const o_ = b.layer === 'near' ? ox(2.5) : b.layer === 'mid' ? ox(1.5) : b.layer === 'far' ? ox(1) : ox(0.5); if (Math.sin(t * 2.2 + b.ph) > 0.2 || beat) ctx.fillRect(b.x + o_, b.y, 1, 1); }

    // power lines strung between the rooftops and the curtains
    wire(curtW, Math.round(H * 0.3), Math.round(W * 0.5), Math.round(H * 0.34), 6, t, '#120f36');
    wire(Math.round(W * 0.5), Math.round(H * 0.34), W - curtW, Math.round(H * 0.29), 5, t + 2, '#120f36');
    wire(curtW, Math.round(H * 0.36), Math.round(W * 0.34), Math.round(H * 0.4), 4, t + 5, '#0e0b2c');

    // far rain (thin, cold) and the drops running down the glass
    ctx.fillStyle = '#2c2a72';
    for (const d of rainF) {
      d.y += d.v * dt * (reduce ? 0.4 : 1); d.x -= d.v * dt * 0.2;
      if (d.y > sillTop - 1) { d.y = -2; d.x = rr() * (W + 30) - 6; }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, d.len);
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

    // mid rain lands on the ledge: a splash, and now and then a ripple in a puddle
    for (const d of rainM) {
      d.y += d.v * dt * (reduce ? 0.4 : 1 + L.mid * 0.5); d.x -= d.v * dt * 0.22;
      if (d.y > d.end) {
        if (!reduce && d.x > curtW && d.x < W - curtW) splashes.push({ x: Math.round(d.x), y: Math.round(d.end), t: 0 });
        d.y = -d.len; d.x = rr() * (W + 30) - 6; d.end = sillTop + 2 + rr() * (FL - 4);
        continue;
      }
      if (d.x < curtW || d.x > W - curtW) continue;
      const w_ = warmAt(d.x, d.y);
      ctx.fillStyle = w_ > 0.55 ? '#ffe1a8' : w_ > 0.25 ? '#e8b878' : d.tone ? '#7a70d0' : '#4e4698';
      for (let i = 0; i < d.len; i++) ctx.fillRect(Math.round(d.x + i * 0.22), Math.round(d.y - i), 1, 1);
    }
    nextRipple -= dt;
    if (nextRipple <= 0 && puddles.length && !reduce) { const p = puddles[Math.floor(rr() * puddles.length)]; ripples.push({ x: p.x + Math.round((rr() - 0.5) * p.rx), y: p.y, t: 0, p }); nextRipple = 0.25 + rr() * 0.5; }
    for (const rp of ripples) {
      rp.t += dt; const k = rp.t / 1.1;
      if (k >= 1) continue;
      const rx = 1 + k * (rp.p.rx * 0.6), ry = Math.max(0.5, rx * 0.3);
      ctx.fillStyle = k < 0.5 ? 'rgba(200,190,255,.75)' : 'rgba(150,140,230,.45)';
      for (let a = 0; a < 6.28; a += 0.45) { const px_ = Math.round(rp.x + Math.cos(a) * rx), py_ = Math.round(rp.y + Math.sin(a) * ry); if (Math.abs(px_ - rp.p.x) <= rp.p.rx - 1 && Math.abs(py_ - rp.p.y) <= rp.p.ry) ctx.fillRect(px_, py_, 1, 1); }
    }
    ripples = ripples.filter((rp) => rp.t < 1.1);
    for (const sp of splashes) {
      sp.t += dt; if (sp.t > 0.22) continue;
      ctx.fillStyle = sp.t < 0.1 ? '#cfc6ff' : '#7a70d0';
      if (sp.t < 0.1) { ctx.fillRect(sp.x, sp.y - 1, 1, 1); ctx.fillRect(sp.x - 1, sp.y, 1, 1); ctx.fillRect(sp.x + 1, sp.y, 1, 1); }
      else { ctx.fillRect(sp.x - 2, sp.y - 1, 1, 1); ctx.fillRect(sp.x + 2, sp.y - 1, 1, 1); ctx.fillRect(sp.x, sp.y - 2, 1, 1); }
    }
    splashes = splashes.filter((sp) => sp.t < 0.22);
    // a leaf or two sliding along the wet stone
    for (const lf of leaves) {
      lf.x += lf.v * dt * (reduce ? 0.2 : 1); if (lf.x > W - curtW) lf.x = curtW;
      ctx.fillStyle = lf.c; ctx.fillRect(Math.round(lf.x), Math.round(lf.y), 2, 1); ctx.fillRect(Math.round(lf.x) + 1, Math.round(lf.y) - 1, 1, 1);
    }

    /* ---------- the lamp and the light it throws ---------- */
    const flick = (Math.sin(t * 9) > 0.93 || beat) ? 1 : 0;
    const lx = lampP.x, ly = lampP.y;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprites.pool[flick], lx - 30, baseY - 5);                    // warm pool on the wet stone
    ctx.drawImage(sprites.cone[flick], Math.round(lx - sprites.cone[0].width / 2), ly + 3);
    ctx.drawImage(sprites.halo[flick], lx - 40, ly - 34);
    ctx.globalCompositeOperation = 'source-over';
    reflect(sprites.lamp, pos.lamp.x, baseY + 1, t, 0.3, 8);                    // lamp reflection streak
    for (let k = 0; k < 8; k++) { ctx.fillStyle = `rgba(255,190,100,${0.35 - k * 0.04})`; ctx.fillRect(lx - 1 + Math.round(Math.sin(t * 3 + k) * 1), baseY + 1 + k, 2, 1); }
    ctx.drawImage(sprites.lamp, pos.lamp.x, pos.lamp.y);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sprites.core, lx - 6, ly - 4); ctx.globalCompositeOperation = 'source-over';

    // contact and cast shadows on the stone (light comes from the left, so shadows lean right)
    ctx.fillStyle = 'rgba(4,2,20,.5)';
    const sh = (cx, rx, ry) => { for (let dy = -ry; dy <= ry; dy++) { const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)); ctx.fillRect(cx - hw, baseY + dy + 1, hw * 2, 1); } };
    sh(pos.dBody.x + 19 + 6, 24, 2); sh(pos.bBody.x + 16 + 6, 20, 2); sh(lampP.x + 2, 8, 1);

    reflect(sprites.dBody, pos.dBody.x, baseY + 1, t, 0.26, 8);
    reflect(sprites.bBody, pos.bBody.x, baseY + 1, t, 0.24, 8);

    /* ---------- characters ---------- */
    bPhase += dt;
    const breathe = reduce ? 0 : (Math.sin(bPhase * 1.5) > 0.15 ? 1 : 0);
    const breathe2 = reduce ? 0 : (Math.sin(bPhase * 1.5 + 1.2) > 0.15 ? 1 : 0);
    if (secs > blinkAt) { blinkUntil = secs + 0.14; blinkAt = secs + 2.6 + rr() * 3.4; }
    if (secs > bBlinkAt) { bBlinkUntil = secs + 0.14; bBlinkAt = secs + 3 + rr() * 4; }
    if (secs > glanceAt) { glanceUntil = secs + 1.4; glanceAt = secs + 5 + rr() * 6; }
    if (secs > earAt) { earUntil = secs + 0.22; earSide = rr() < 0.5 ? 0 : 1; earAt = secs + 4 + rr() * 5; }
    bob += ((!reduce && bass > 0.4 ? 1 : 0) - bob) * Math.min(1, dt * 22);
    const fk = 0.75 + flick * 0.25;
    const draw = (cvs, litc, p, dx, dy) => { ctx.drawImage(cvs, p.x + (dx || 0), p.y + (dy || 0)); if (litc) { ctx.globalAlpha = fk; ctx.drawImage(litc, p.x + (dx || 0), p.y + (dy || 0)); ctx.globalAlpha = 1; } };

    // Bubu (right): body, mug held in both paws, a little ear flick
    draw(sprites.bBody, lit.bBody, pos.bBody, 0, 0);
    ctx.drawImage(sprites.mug, pos.mug.x, pos.mug.y - breathe2);
    ctx.drawImage(sprites.paws, pos.paws.x, pos.paws.y - breathe2);
    const bj0 = secs < earUntil && earSide === 0 ? 1 : 0, bj1 = secs < earUntil && earSide === 1 ? 1 : 0;
    draw(sprites.bEar, lit.bEarL, pos.bEarL, 0, breathe2 - bj0);
    draw(sprites.bEar, lit.bEarR, pos.bEarR, bj1, breathe2 - bj1);
    const bi = secs < bBlinkUntil ? 1 : 0;
    draw(sprites.bHead[bi], lit.bHead[bi], pos.bHead, -1, breathe2);

    // Dudu (left): body, ears, head with headphones, a glance towards the moon now and then
    draw(sprites.dBody, lit.dBody, pos.dBody, 0, 0);
    const dj = secs < earUntil && earSide === 0 ? 1 : 0;
    draw(sprites.dEar, lit.dEarL, pos.dEarL, -dj, breathe - Math.round(bob) - dj);
    draw(sprites.dEar, lit.dEarR, pos.dEarR, 0, breathe - Math.round(bob));
    const di = secs < blinkUntil ? 1 : secs < glanceUntil ? 2 : 0;
    draw(sprites.dHead[di], lit.dHead[di], pos.dHead, 0, breathe - Math.round(bob));

    // steam off the mug
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.55 + i * 0.33) % 1;
      ctx.fillStyle = `rgba(225,215,255,${(1 - ph) * 0.7})`;
      ctx.fillRect(pos.mug.x + 4 + Math.round(Math.sin(ph * 6 + i) * 1.2), Math.round(pos.mug.y - 2 - ph * 12), 1, 1);
    }

    // dust drifting inside the lamp's cone
    for (const d of dust) {
      const k = (d.u + (reduce ? 0 : t * 0.02 * d.s)) % 1, y = ly + 4 + k * 28, spread = 4 + k * 22;
      const x = lx + (d.v - 0.5) * 2 * spread + Math.sin(t * 0.7 + d.ph) * 2;
      if (Math.sin(t * d.s + d.ph) < -0.2) continue;
      ctx.fillStyle = Math.sin(t * d.s * 2 + d.ph) > 0.4 ? '#fff0c8' : '#ffc27a'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }

    // sparse foreground rain in front of everything: long, bright, quick
    for (const d of rainN) {
      d.y += d.v * dt * (reduce ? 0.4 : 1); d.x -= d.v * dt * 0.22;
      if (d.y > d.end) { if (!reduce && d.x > curtW && d.x < W - curtW) splashes.push({ x: Math.round(d.x), y: Math.round(d.end), t: 0 }); d.y = -d.len; d.x = rr() * (W + 30) - 6; d.end = baseY + 1 + rr() * 6; continue; }
      if (d.x < curtW || d.x > W - curtW) continue;
      const w_ = warmAt(d.x, d.y);
      for (let i = 0; i < d.len; i++) { ctx.fillStyle = w_ > 0.4 ? (i < 3 ? '#fff0c8' : '#e8b878') : (i < 3 ? '#cfc6ff' : '#8f84e0'); ctx.fillRect(Math.round(d.x + i * 0.22), Math.round(d.y - i), 1, 1); }
    }

    // the cover thumbnail breathes at ~8fps
    if (now > coverAt) { coverAt = now + 125; drawCover(document.getElementById('coverCanvas'), t); }

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
    [sprites.dHead[0], sprites.dHead[1], sprites.dEar, sprites.dBody, sprites.bHead[0], sprites.bEar, sprites.bBody, sprites.paws, sprites.lamp, sprites.mug, sprites.cone[0], sprites.halo[0]].forEach((c) => {
      const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0);
      k.style.cssText = `image-rendering:pixelated;width:${c.width * 8}px;height:${c.height * 8}px;margin:8px;background:#0b0830`; document.body.appendChild(k);
    });
  }
})();
