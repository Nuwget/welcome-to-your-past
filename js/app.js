/* Player, audio analysis, waveform, animated title. */
(() => {
  const TITLE = 'Welcome to your past';
  const ARTIST = ''; // preencha para aparecer no player

  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const body = document.body;
  const L = (window.Levels = window.Levels || { bass: 0, mid: 0, treble: 0 });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (s) => { s = Math.max(0, Math.floor(isFinite(s) ? s : 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  audio.volume = 0.85;

  // let the stylesheet know how tall the player is
  const dockEl = $('dock');
  // the phone layout sizes the ledge from the player's height, so the scene is rebuilt when that changes
  let lastDockH = 0;
  if (window.ResizeObserver) new ResizeObserver(() => {
    const h = dockEl.offsetHeight; document.documentElement.style.setProperty('--dock-h', h + 'px');
    if (Math.abs(h - lastDockH) > 2) { lastDockH = h; dispatchEvent(new Event('resize')); }
  }).observe(dockEl);

  const titleEl = $('title');
  // "Welcome to" / "your past" are two deliberate lines on phones, one line on desktop
  let ci = 0;
  [['Welcome', 'to'], ['your', 'past']].forEach((words, li) => {
    const line = document.createElement('span'); line.className = 'tl'; line.setAttribute('aria-hidden', 'true');
    words.forEach((word, wi) => {
      const w = document.createElement('span'); w.className = 'tw';
      [...word].forEach((ch) => { const c = document.createElement('span'); c.className = 'c'; c.style.setProperty('--i', ci++); c.textContent = ch; w.appendChild(c); });
      line.appendChild(w); if (wi < words.length - 1) { line.appendChild(document.createTextNode(' ')); ci++; }
    });
    titleEl.appendChild(line); if (li === 0) { titleEl.appendChild(document.createTextNode(' ')); ci++; }
  });


  function toast(msg, ms = 4200) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- pixel frames (9-slice borders for the dock and buttons) ---------- */
  function pixelFrame(rows, pal) {
    let r = '';
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9" shape-rendering="crispEdges">${r}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  const MAP = ['..OOOOO..', '.OLLLLLO.', 'OLIIIIILO', 'OLIFFFILO', 'OLIFFFILO', 'OLIFFFILO', 'OLIIIIILO', '.OLLLLLO.', '..OOOOO..'];
  document.documentElement.style.setProperty('--panel', pixelFrame(MAP, { O: '#05040f', L: '#6f58c8', I: '#241a5e', F: 'rgba(12,9,40,.92)' }));
  document.documentElement.style.setProperty('--btn', pixelFrame(MAP, { O: '#05040f', L: '#ffffff', I: '#a995f0', F: '#cdbdff' }));
  addEventListener('pointerdown', () => body.classList.add('clicked'), { once: true });

  /* ---------- web audio (analysis tap only; the sound itself is never processed) ---------- */
  // Over file:// the browser would mute a MediaElementSource, so the analyser is only wired over http(s).
  const canAnalyse = /^https?:$/.test(location.protocol);
  let actx = null, analyser = null, freq = null, bins = null;

  function setupAnalyser() {
    if (!canAnalyse || actx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC({ latencyHint: 'playback' });
      const src = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);
      src.connect(actx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
      const hz = actx.sampleRate / analyser.fftSize;
      const b = (f) => Math.max(1, Math.round(f / hz));
      bins = { b0: b(35), b1: b(150), m0: b(250), m1: b(2000), t0: b(4000), t1: b(12000) };
      actx.resume();
    } catch (e) { actx = null; analyser = null; }
  }

  let quiet = 0;
  function readLevels(t) {
    const playing = !audio.paused && !audio.ended;
    let b = 0, m = 0, tr = 0;
    if (playing && analyser && actx.state === 'running') {
      analyser.getByteFrequencyData(freq);
      const avg = (a, z) => { let s = 0; for (let i = a; i < z; i++) s += freq[i]; return s / Math.max(1, z - a) / 255; };
      b = Math.pow(avg(bins.b0, bins.b1), 1.7) * 1.7;
      m = Math.pow(avg(bins.m0, bins.m1), 1.4) * 2.4;
      tr = Math.pow(avg(bins.t0, bins.t1), 1.2) * 3.6;
      quiet = b + m + tr < 0.003 ? quiet + 1 : 0;
    } else if (playing) quiet = 999;
    if (playing && quiet > 120) { // no analysis available: slow synthetic breathing
      const p = Math.pow(Math.max(0, Math.sin(t * 2.0)), 3);
      b = 0.22 + 0.35 * p; m = 0.28 + 0.18 * Math.sin(t * 0.9); tr = 0.2 + 0.14 * Math.sin(t * 3.1);
    }
    if (!playing) { b = 0.06 + 0.05 * Math.sin(t * 0.6); m = 0.05; tr = 0.04; }
    const sm = (c, v, up, dn) => c + (v - c) * (v > c ? up : dn);
    L.bass = sm(L.bass, Math.min(1, b), 0.32, 0.07);
    L.mid = sm(L.mid, Math.min(1, m), 0.22, 0.06);
    L.treble = sm(L.treble, Math.min(1, tr), 0.28, 0.08);
  }

  /* ---------- waveform ---------- */
  const wave = $('wave');
  const wctx = wave.getContext('2d');
  let peaks = null, cw = 0;
  const PEAKS = 320;

  async function loadPeaks() {
    try {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      for (const url of ['media/track.m4a', 'media/track.mp3']) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const buf = await new OAC(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
          const d = buf.getChannelData(0), size = Math.floor(d.length / PEAKS), out = new Float32Array(PEAKS);
          let max = 0;
          for (let i = 0; i < PEAKS; i++) {
            let s = 0, n = 0;
            for (let j = i * size; j < (i + 1) * size; j += 6) { s += d[j] * d[j]; n++; }
            out[i] = Math.sqrt(s / n); if (out[i] > max) max = out[i];
          }
          for (let i = 0; i < PEAKS; i++) out[i] = Math.pow(out[i] / (max || 1), 0.75);
          peaks = out; cw = 0; return;
        } catch (e) { /* try next source */ }
      }
    } catch (e) { /* ignore */ }
  }

  // chunky pixel bars: the canvas is half the CSS size and scaled up with nearest-neighbour
  let bars = 0, heights = null;
  function buildWave() {
    const w = Math.floor(wave.clientWidth / 2), h = Math.floor(wave.clientHeight / 2);
    if (!w) return;
    wave.width = w; wave.height = h; cw = wave.clientWidth;
    bars = Math.floor(w / 3);
    heights = new Array(bars);
    for (let i = 0; i < bars; i++) {
      const v = peaks ? peaks[Math.min(PEAKS - 1, Math.floor((i / bars) * PEAKS))] : 0.14 + 0.1 * Math.sin(i * 0.4);
      heights[i] = Math.max(2, Math.round((v * h * 0.94) / 2) * 2);
    }
  }
  addEventListener('resize', () => { cw = 0; });

  function drawWave(p) {
    if (!cw || Math.abs(cw - wave.clientWidth) > 1) buildWave();
    if (!cw) return;
    wctx.clearRect(0, 0, wave.width, wave.height);
    const mid = wave.height / 2, head = Math.floor(p * bars), pulse = L.bass > 0.4 ? 2 : 0;
    for (let i = 0; i < bars; i++) {
      const near = Math.abs(i - head) < 3 ? pulse : 0, bh = heights[i] + near, y = Math.round(mid - bh / 2), x = i * 3;
      if (i <= head) { wctx.fillStyle = '#8f6cf0'; wctx.fillRect(x, y, 2, bh); wctx.fillStyle = '#e8dcff'; wctx.fillRect(x, y, 2, 1); }
      else { wctx.fillStyle = '#352c74'; wctx.fillRect(x, y, 2, bh); }
    }
    const hx = head * 3;
    wctx.fillStyle = '#ffffff'; wctx.fillRect(hx - 1, 0, 1, wave.height); wctx.fillRect(hx + 2, 0, 1, wave.height);
    wctx.fillStyle = '#ffd98a'; wctx.fillRect(hx - 1, Math.floor(mid) - 1, 4, 2);
  }

  /* ---------- tiny equaliser next to the state label ---------- */
  const eq = $('eq'), ectx = eq.getContext('2d');
  function drawEq(t) {
    ectx.clearRect(0, 0, 14, 7);
    const on = !audio.paused && !audio.ended;
    for (let i = 0; i < 4; i++) {
      const band = i < 2 ? L.bass : i === 2 ? L.mid : L.treble;
      const h = on ? Math.max(1, Math.min(7, Math.round(1 + band * 5 + (Math.sin(t * (5 + i * 1.7) + i * 2) + 1) * 0.9))) : 1;
      ectx.fillStyle = '#8f6cf0'; ectx.fillRect(i * 3 + 1, 7 - h, 2, h);
      ectx.fillStyle = '#e8dcff'; ectx.fillRect(i * 3 + 1, 7 - h, 2, 1);
    }
  }

  /* ---------- controls ---------- */
  const seek = $('seek');
  let seeking = false;

  function play() {
    if (actx && actx.state === 'suspended') actx.resume();
    const p = audio.play();
    if (p && p.catch) p.catch((e) => toast('Não consegui tocar o áudio (' + e.name + '). Clique em play de novo.'));
  }
  const toggle = () => (audio.paused ? play() : audio.pause());

  audio.addEventListener('play', () => { body.classList.add('playing'); $('btnPlay').setAttribute('aria-label', 'pausar'); $('sub').textContent = ARTIST || 'tocando'; });
  audio.addEventListener('pause', () => { body.classList.remove('playing'); $('btnPlay').setAttribute('aria-label', 'tocar'); $('sub').textContent = 'pausado'; });
  audio.addEventListener('ended', () => { $('sub').textContent = 'fim'; });
  const dur = () => { $('tDur').textContent = fmt(audio.duration); };
  audio.addEventListener('loadedmetadata', dur); audio.addEventListener('durationchange', dur);
  audio.addEventListener('error', () => {
    const c = audio.error ? audio.error.code : 0;
    toast('Erro ao carregar o áudio (código ' + c + '). Abra o site por um servidor: ./serve.sh', 8000);
  });

  $('btnPlay').addEventListener('click', toggle);
  $('btnBack').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
  $('btnFwd').addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
  $('btnLoop').addEventListener('click', (e) => { audio.loop = !audio.loop; e.currentTarget.setAttribute('aria-pressed', String(audio.loop)); });
  const vol = $('vol');
  const setVol = (v) => { audio.volume = Math.min(1, Math.max(0, v)); vol.value = audio.volume * 100; vol.style.setProperty('--v', vol.value + '%'); };
  vol.addEventListener('input', () => setVol(vol.value / 100)); setVol(0.85);
  $('btnFs').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); });

  seek.addEventListener('input', () => { seeking = true; if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; });
  seek.addEventListener('change', () => { seeking = false; });

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); body.classList.contains('on') ? toggle() : $('gateBtn').click(); }
    else if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.code === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.code === 'ArrowUp') { e.preventDefault(); setVol(audio.volume + 0.05); }
    else if (e.code === 'ArrowDown') { e.preventDefault(); setVol(audio.volume - 0.05); }
    else if (e.key === 'l' || e.key === 'L') $('btnLoop').click();
    else if (e.key === 'f' || e.key === 'F') $('btnFs').click();
  });

  /* ---------- gate -> scene: the dark veil dissolves block by block, from the ledge upwards ---------- */
  function revealScene() {
    if (reduce) return;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:21;pointer-events:none;image-rendering:pixelated';
    const cs = Math.max(14, Math.round(Math.max(innerWidth, innerHeight) / 44));
    const cols = Math.ceil(innerWidth / cs), rows = Math.ceil(innerHeight / cs);
    c.width = cols; c.height = rows;
    const delay = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) delay.push(((rows - 1 - y) / rows) * 0.55 + Math.abs(x / cols - 0.5) * 0.25 + Math.random() * 0.3);
    document.body.appendChild(c);
    const t0 = performance.now(), D = 0.28;
    (function step(now) {
      const t = (now - t0) / 1000; let alive = false;
      g.clearRect(0, 0, cols, rows);
      for (let i = 0; i < delay.length; i++) {
        const k = Math.min(1, Math.max(0, (t - delay[i]) / D)), a = Math.ceil((1 - k) * 3) / 3; // 3 visible steps per block
        if (a <= 0) continue; alive = true;
        g.fillStyle = `rgba(3,4,16,${(0.82 * a).toFixed(3)})`; g.fillRect(i % cols, (i / cols) | 0, 1, 1);
      }
      if (alive) requestAnimationFrame(step); else c.remove();
    })(t0);
  }
  $('gateBtn').addEventListener('click', () => { revealScene(); body.classList.add('on'); setupAnalyser(); play(); });
  if (/[#&]go\b/.test(location.hash)) setTimeout(() => $('gateBtn').click(), 200);

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: TITLE, artist: ARTIST || ' ' });
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime -= 10; });
    navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime += 10; });
  }

  /* ---------- loop ---------- */
  let lastT = -1;
  function tick(now) {
    const t = now / 1000;
    readLevels(t);
    const d = audio.duration || 0, ct = audio.currentTime;
    const p = d ? ct / d : 0;
    if (!seeking) seek.value = p * 1000;
    const s = Math.floor(ct);
    if (s !== lastT) { lastT = s; $('tCur').textContent = fmt(ct); }
    drawWave(p);
    drawEq(t);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  loadPeaks();

  // debug helper: #t=40 jumps ahead and shows the interface without the gate
  if (/[#&]ui\b/.test(location.hash)) { body.classList.add('on', 'playing', 'dbg'); new Image().src = '/__slow?' + Date.now(); }
})();
