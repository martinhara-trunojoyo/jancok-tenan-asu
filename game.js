/* ==========================================================================
   SNAP! 1986 - PHOTO HUNTER
   3 modes, photo-capture gameplay, 8-bit presentation.
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- setup -- */
const W = 320, H = 180;
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;

const TARGET_SRC =
  'https://tse3.mm.bing.net/th/id/OIP.9gsfrbajnCwehnRG45VTnwHaHa?r=0&rs=1&pid=ImgDetMain&o=7&rm=3';

const overlay = document.getElementById('overlay');
const soundBtn = document.getElementById('soundBtn');
const imgState = document.getElementById('imgState');

/* play field (canvas coords). top strip is reserved for the HUD */
const MINX = 16, MAXX = W - 16, MINY = 46, MAXY = H - 18;

/* viewfinder */
const RET_W = 62, RET_H = 44;

/* ---------------------------------------------------------------- audio -- */
let AC = null, muted = false;
function actx() {
  if (!AC) { const A = window.AudioContext || window.webkitAudioContext; if (A) AC = new A(); }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, dur, type, vol, slideTo) {
  if (muted) return;
  const a = actx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), a.currentTime + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(vol == null ? 0.14 : vol, a.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur + 0.02);
}
function noise(dur, vol) {
  if (muted) return;
  const a = actx(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = buf;
  const g = a.createGain(); g.gain.value = vol == null ? 0.16 : vol;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
function seq(notes, step, type) {
  notes.forEach((n, i) => setTimeout(() => tone(n, step * 0.95, type || 'square', 0.13), i * step * 1000));
}
const SFX = {
  shoot()   { noise(0.13, 0.18); tone(680, 0.09, 'square', 0.10, 90); },
  type()    { tone(700 + Math.random() * 220, 0.030, 'square', 0.055); },
  crtOn()   { tone(70, 0.45, 'sawtooth', 0.09, 900); noise(0.10, 0.07); },
  warp()    { tone(180, 0.35, 'square', 0.08, 1400); },
  tick()    { tone(1200, 0.05, 'square', 0.08); },
  perfect() { seq([523, 659, 784, 1046, 1318], 0.07); },
  good()    { seq([523, 784, 1046], 0.08); },
  ok()      { seq([440, 554], 0.09, 'triangle'); },
  far()     { tone(150, 0.22, 'sawtooth', 0.10, 70); },
  blocked() { tone(110, 0.20, 'square', 0.12); tone(105, 0.20, 'square', 0.10); },
  wrong()   { seq([392, 349, 294], 0.10, 'sawtooth'); },
  corner()  { tone(900, 0.06, 'square', 0.10, 1300); },
  puff()    { noise(0.09, 0.10); },
  tick()    { tone(1200, 0.05, 'square', 0.08); },
  go()      { seq([523, 784, 1046, 1568], 0.09); },
  clear()   { seq([523, 659, 784, 1046, 784, 1046, 1318], 0.11); },
  fail()    { seq([440, 392, 349, 262], 0.16, 'sawtooth'); },
  introHit(){ seq([392, 523, 659, 784, 1046], 0.06); }
};

/* -------------------------------------------------------- pixel sprite -- */
/* the target photo is downsampled into a 36x36 sprite so it reads as
   chunky 8-bit art once scaled up on the canvas                        */
const SPR = 36;
const spr = document.createElement('canvas');
spr.width = SPR; spr.height = SPR;
const sctx = spr.getContext('2d');
let photoLoaded = false;

function bakePhoto(im) {
  sctx.imageSmoothingEnabled = true;
  sctx.clearRect(0, 0, SPR, SPR);
  let dw, dh;
  const r = im.width / im.height;
  if (r >= 1) { dw = SPR; dh = Math.max(8, Math.round(SPR / r)); }
  else { dh = SPR; dw = Math.max(8, Math.round(SPR * r)); }
  sctx.drawImage(im, Math.floor((SPR - dw) / 2), Math.floor((SPR - dh) / 2), dw, dh);
  sctx.imageSmoothingEnabled = false;
}
function bakeFallback() {
  sctx.clearRect(0, 0, SPR, SPR);
  const R = (x, y, w, h, c) => { sctx.fillStyle = c; sctx.fillRect(x, y, w, h); };
  R(6, 32, 24, 3, 'rgba(0,0,0,.4)');
  R(12, 29, 5, 5, '#2b3a67'); R(19, 29, 5, 5, '#2b3a67');
  R(10, 16, 16, 14, '#b8341f'); R(12, 17, 12, 11, '#e94f37');
  R(12, 4, 12, 13, '#ffd9a0'); R(11, 3, 14, 5, '#3a2418'); R(11, 6, 2, 6, '#3a2418');
  R(14, 9, 2, 3, '#101018'); R(20, 9, 2, 3, '#101018'); R(17, 13, 3, 1, '#101018');
  R(14, 21, 3, 3, '#00e5ff'); R(20, 24, 4, 2, '#f4e7c8');
}
function imgMsg(txt, col) { if (imgState) { imgState.textContent = txt; imgState.style.color = col; } }

(function loadPhoto() {
  const im = new Image();
  im.referrerPolicy = 'no-referrer';
  im.onload = () => {
    bakePhoto(im);
    photoLoaded = true;
    imgMsg('SUBJECT: ' + im.width + 'x' + im.height + ' OK', '#7fffd4');
  };
  im.onerror = () => {
    bakeFallback();
    photoLoaded = false;
    imgMsg('SUBJECT: IMAGE OFFLINE - USING 8-BIT FALLBACK', '#ff9b5b');
  };
  im.src = TARGET_SRC;
  setTimeout(() => {
    if (!photoLoaded && imgState && /LOADING/.test(imgState.textContent)) {
      imgMsg('SUBJECT: IMAGE TIMED OUT - USING 8-BIT FALLBACK', '#ff9b5b');
    }
  }, 6000);
})();

function drawSprite(x, y, size, alpha) {
  const s = size / SPR;
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(spr, Math.round(x - size / 2), Math.round(y - size / 2), Math.round(SPR * s), Math.round(SPR * s));
  if (alpha != null) ctx.globalAlpha = 1;
}

/* -------------------------------------------------------------- helpers -- */
const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
const alpha = (a) => { ctx.globalAlpha = a; };
const unalpha = () => { ctx.globalAlpha = 1; };
const rct = (x, y, w, h, c) => {
  ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x | 0, y | 0, w | 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fillRect(x | 0, (y + h - 1) | 0, w | 0, 1);
};
const clr = (v, a, b) => v < a ? a : (v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const setFont = (s) => { ctx.font = s + ' "Press Start 2P","Courier New",monospace'; };
function text(s, x, y, size, color, align) {
  setFont(size + 'px'); ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = color; ctx.fillText(s, x | 0, y | 0);
}
function textShadow(s, x, y, size, color, sh) {
  setFont(size + 'px'); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillStyle = sh || '#000'; ctx.fillText(s, (x + 2) | 0, (y + 2) | 0);
  ctx.fillStyle = color; ctx.fillText(s, x | 0, y | 0);
}
function centerBig(s, y, size, color, sh) {
  setFont(size + 'px'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = sh || '#000';
  ctx.fillText(s, (W / 2 + 2) | 0, (y + 2) | 0);
  ctx.fillStyle = color;
  ctx.fillText(s, (W / 2) | 0, y | 0);
  ctx.textAlign = 'left';
}

/* neon halo: the same glyph stamped a few pixels out in a soft colour */
function glowText(s, x, y, size, color, glow, strength, op) {
  const o = op == null ? 1 : op;
  const g = strength == null ? 1 : strength;
  setFont(size + 'px'); ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.fillStyle = glow;
  alpha(0.13 * g * o);
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]])
    ctx.fillText(s, Math.round(x + dx), Math.round(y + dy));
  alpha(0.3 * g * o);
  ctx.fillText(s, Math.round(x), Math.round(y));
  alpha(o);
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
  unalpha();
  ctx.textAlign = 'left';
}
/* classic 80s chromatic split */
function splitText(s, x, y, size, color, off) {
  setFont(size + 'px'); ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2fb9';
  ctx.fillText(s, Math.round(x - off), Math.round(y));
  ctx.fillStyle = '#00e5ff';
  ctx.fillText(s, Math.round(x + off), Math.round(y));
  unalpha();
  ctx.fillStyle = color;
  ctx.fillText(s, Math.round(x), Math.round(y));
  ctx.textAlign = 'left';
}

/* ====================================================== boot / welcome ==
   Arcade-style cold start: CRT power-on, typed greeting, glitch logo.     */
const INTRO = { f: 0, cues: [], len: 264 };

function introCue(f, fn) { INTRO.cues.push({ f, fn, done: false }); }

function startIntro() {
  INTRO.f = 0;
  INTRO.cues = [];
  game.state = 'intro';
  hideOverlay();

  introCue(1, () => SFX.crtOn());

  /* typewriter: WELCOME TO */
  for (let i = 0; i < 10; i++) introCue(22 + i * 4, () => SFX.type());
  /* whoosh as it hands over to the logo */
  introCue(66, () => SFX.warp());
  introCue(72, () => SFX.introHit());
  /* typewriter: PHOTO HUNTER */
  for (let i = 0; i < 13; i++) introCue(160 + i * 4, () => SFX.type());
  introCue(216, () => SFX.introHit());
}

function skipIntro() {
  if (game.state !== 'intro' || INTRO.f < 34) return;
  INTRO.cues.length = 0;
  showTitle();
}

function updateIntro(f) {
  INTRO.f += f;
  for (const c of INTRO.cues) {
    if (!c.done && INTRO.f >= c.f) { c.done = true; c.fn(); }
  }
  if (INTRO.f >= INTRO.len) showTitle();
}

function drawIntro() {
  const f = INTRO.f;
  const cx = W / 2;

  /* --- backdrop: deep arcade purple + slow twinkling stars ------------- */
  for (let y = 0; y < H; y++) px(0, y, W, 1, ['#0e0522', '#1b0938', '#2c0c46'][Math.min(2, (y / 66) | 0)]);
  for (let i = 0; i < 34; i++) {
    const sx = (i * 71 + 23) % W;
    const sy = (i * 43 + 11) % H;
    const tw = Math.sin(f * 0.05 + i) > 0.2;
    px(sx, sy, 1, 1, tw ? (i % 5 ? '#8fd8ff' : '#ffffff') : '#2a1a4a');
  }
  /* horizon grid */
  for (let i = 0; i <= 12; i++) px(Math.round((i / 12) * W), 120, 1, H - 120, 'rgba(255,47,185,.35)');
  for (let i = 0; i < 6; i++) {
    const y = 120 + Math.pow(i / 5, 2.2) * (H - 120);
    px(0, y | 0, W, 1, i % 2 ? 'rgba(0,229,255,.35)' : 'rgba(123,43,255,.35)');
  }

  /* --- CRT power-on: a bright line that opens into a full raster ------ */
  if (f < 14) {
    const t = f / 14;
    const hh = Math.max(1, Math.round(Math.pow(t, 0.4) * (H / 2)));
    px(0, H / 2 - hh, W, hh * 2, '#dff4ff');
    px(0, H / 2 - 1, W, 2, '#ffffff');
    return;
  }
  const settle = f < 20 ? (20 - f) / 6 : 0;
  if (settle > 0) { px(0, 0, W, H, 'rgba(0,0,0,' + (settle * 0.8).toFixed(3) + ')'); }

/* --- WELCOME TO ------------------------------------------------------ */
  if (f >= 18 && f < 96) {
    const slide = f > 64 ? Math.min(1, (f - 64) / 18) : 0;
    const n = Math.max(0, Math.min(10, Math.floor((f - 22) / 4) + 1));
    const s = 'WELCOME TO'.slice(0, n);
    const bob = f < 64 ? Math.round(Math.sin(f * 0.06) * 1.5) : 0;
    const y = 58 + bob - slide * 46;
    const op = 1 - slide;
    glowText(s, cx + (f % 7 === 0 ? rnd(-1, 1) : 0), y, 8, '#00e5ff', '#00e5ff', 1, op);
    /* blinking block cursor */
    if ((f >> 4) % 2 && f < 64) px(cx + s.length * 4 + 6, y, 5, 8, '#ffffff');
    /* decorative brackets */
    alpha(op);
    px(cx - s.length * 4 - 14, y, 3, 8, '#ff2fb9');
    px(cx + s.length * 4 + 11, y, 3, 8, '#ff2fb9');
    unalpha();
  }

  /* --- logo lockup ----------------------------------------------------- */
  if (f >= 82) {
    const g = Math.min(1, (f - 82) / 12);
    const ly = 58 - 46;

    /* chromatic split that snaps shut after a few frames */
    const gsp = Math.max(0, 1 - (f - 82) / 16);
    const jit = (f < 94 && f % 3 === 0) ? rnd(-2, 2) : 0;

    if (f % 11 < 3) px(0, 8, W, 92, 'rgba(255,47,185,.10)');
    px(0, 8, W, 1, 'rgba(0,229,255,' + (0.5 * g).toFixed(2) + ')');
    px(0, 99, W, 1, 'rgba(0,229,255,' + (0.5 * g).toFixed(2) + ')');

    if (gsp > 0) {
      splitText('SNAP!', cx + jit, ly + 4, 26, '#ffffff', Math.round(gsp * 4));
    } else {
      glowText('SNAP!', cx + jit, ly + 4, 26, '#ffd400', '#ff8a00', g);
    }
    /* hard drop shadow for the 8-bit look */
    setFont('26px'); ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(60,10,70,.85)';
    ctx.fillText('SNAP!', cx + 3, ly + 8);
    ctx.textAlign = 'left';

    if (f >= 118) {
      const o2 = Math.max(0, 1 - (f - 118) / 20) * 3;
      glowText('1986', cx, ly + 42, 12, '#00e5ff', '#00e5ff', 1);
      ctx.fillStyle = 'rgba(0,229,255,' + o2.toFixed(2) + ')';
      ctx.fillRect(cx - 60, ly + 58, 120, 1);
    }
    if (f >= 134) {
      const barW = Math.min(120, (f - 134) * 3);
      px(cx - barW / 2, ly + 60, barW, 2, '#ff2fb9');
    }

    /* PHOTO HUNTER typed in */
    if (f >= 150) {
      const n = Math.max(0, Math.min(13, Math.floor((f - 156) / 4) + 1));
      const s = 'PHOTO HUNTER'.slice(0, n);
      glowText(s, cx, ly + 74, 8, '#ffffff', '#ff2fb9', 1);
      if ((f >> 4) % 2) px(cx + s.length * 4 + 4, ly + 74, 4, 8, '#ffffff');
    }
  }

  /* --- go prompt -------------------------------------------------------- */
  if (f >= 228) {
    if ((f >> 4) % 2) centerBig('CLICK OR PRESS SPACE', 140, 8, '#00ff9c', '#00301f');
  }

  /* leftover scanline sweep once everything is in place */
  if (f >= 216 && f < 266) {
    const sy = ((f - 216) * 11) % (H + 40) - 20;
    alpha(0.16); px(0, sy, W, 12, '#ffffff'); unalpha();
  }
}

/* --------------------------------------------------------------- levels -- */
const LEVELS = [
  {
    name: 'MALL CAM', tag: 'MODE 1', diff: 'EASY (HARD!)',
    goal: 3, film: 16, scene: 'mall', accent: '#00e5ff', behavior: 'flee',
    size: 24, speed: 0.95, fear: 76, acc: 2.4,
    brief: 'SUBJECT BOLTS EVERY TIME YOUR CURSOR GETS CLOSE.\nWAIT FOR IT TO TRIP ON A WALL OR SLIP UP.'
  },
  {
    name: 'ARCADE ALLEY', tag: 'MODE 2', diff: 'NORMAL',
    goal: 3, film: 14, scene: 'arcade', accent: '#ff2fb9', behavior: 'orbit',
    size: 22, brief: 'SUBJECT FOLLOWS A PATTERN\nBUT FREEZES TO RELOAD. SHOOT WHEN IT STOPS.'
  },
  {
    name: 'TOWER 300', tag: 'MODE 3', diff: 'HARD',
    goal: 4, film: 13, scene: 'tower', accent: '#ffd400', behavior: 'chaos',
    size: 20, brief: 'SUBJECT ERRATIC + BLINKING.\nTWO DECOYS WILL FOLLOW YOU. DO NOT SNAP THEM.'
  }
];

/* arcade cabinets used as occluders in mode 2 */
const CABINETS = [
  { x: 40, y: 74, w: 34, h: 22 },
  { x: 130, y: 120, w: 30, h: 22 },
  { x: 226, y: 70, w: 36, h: 22 }
];

/* ----------------------------------------------------------------- game -- */
const game = {
  state: 'title',      // title | ready | play | flash | clear | fail | done
  level: 0,
  score: 0,
  film: 0,
  pips: 0,
  album: [],
  t: 0,                // global timer (frames)
  timer: 0,            // per-state timer
  cool: 0,             // shutter cooldown
  flashA: 0,
  shotT: 0,
  lastRate: null,
  pendingIntro: null,
  banner: null,
  bannerT: 0,
  cam: { x: W / 2, y: H / 2 },
  target: null,
  decoys: [],
  parts: [],
  rings: [],
  occluded: false,
  dbg: 0
};

function newTarget(lv) {
  return {
    x: rnd(MINX + 20, MAXX - 20), y: rnd(MINY + 16, MAXY - 16),
    size: lv.size,
    ph: rnd(0, 6.28),
    panic: 0, stun: 0, tripCd: 0, slipCd: rnd(120, 320), cd: 0, ang: rnd(0, 6.28),
    ft: 90, frozen: false
  };
}

function startLevel(i) {
  game.album = [];
  loadLevel(i);
}
function loadLevel(i) {
  const lv = LEVELS[i];
  game.level = i;
  game.film = lv.film;
  game.pips = 0;
  game.target = newTarget(lv);
  game.decoys = [];
  game.parts = [];
  game.rings = [];
  game.cool = 0;
  game.flashA = 0;
  game.occluded = false;
  game.state = 'ready';
  game.timer = 78;
  hideOverlay();
}

/* ------------------------------------------------------------ behaviours -- */
function behaviourFlee(t, lv, f) {
  t.panic = Math.min(1.2, t.panic + 0.004 * f);

  /* slow random-walk so the subject keeps exploring the room */
  t.cd -= f;
  if (t.cd <= 0) { t.cd = rnd(28, 78); t.ang = rnd(0, 6.28); }

  /* occasional slip - the other opening in this mode */
  t.slipCd -= f;
  if (t.slipCd <= 0 && t.stun <= 0) {
    t.slipCd = rnd(200, 380);
    t.stun = 18;                    /* frames, ~0.30s */
    SFX.corner();
    burst(t.x, t.y, '#00e5ff', 6);
    banner('SUBJECT SLIPPED!', '#00e5ff', 28);
  }

  /* frozen by slipping or tripping - runs are in FRAMES */
  if (t.stun > 0) {
    t.stun -= f;
    if (Math.hypot(t.x - game.cam.x, t.y - game.cam.y) < 24) t.stun = Math.min(t.stun, 6);
    return;
  }

  const dx = t.x - game.cam.x, dy = t.y - game.cam.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = clr((lv.fear - d) / lv.fear, 0, 1);

  let ax, ay;
  if (near > 0) {
    /* PANIC: bolt straight away from the viewfinder, full speed */
    const k = lv.acc * near * (1 + t.panic);
    ax = (dx / d) * k + rnd(-0.8, 0.8) * near;
    ay = (dy / d) * k + rnd(-0.8, 0.8) * near;
  } else {
    ax = Math.cos(t.ang) * lv.speed;
    ay = Math.sin(t.ang) * lv.speed;
  }

  let nx = t.x + ax * f, ny = t.y + ay * f;
  let hitX = 0, hitY = 0;
  if (nx < MINX) { hitX = 1; nx = MINX; }
  if (nx > MAXX) { hitX = -1; nx = MAXX; }
  if (ny < MINY) { hitY = 1; ny = MINY; }
  if (ny > MAXY) { hitY = -1; ny = MAXY; }
  t.x = nx; t.y = ny;

  t.tripCd = Math.max(0, t.tripCd - f);

  /* TRIPPED on the wall - one of only two openings in this mode */
  if ((hitX || hitY) && t.tripCd <= 0) {
    t.tripCd = 130;
    t.stun = 20;                    /* frames, ~0.33s */
    t.panic = 1.0;
    t.cd = rnd(40, 90);
    t.ang = rnd(0, 6.28);
    /* bounced back off the wall, so the shot spot is not predictable */
    if (hitX) t.x += hitX * rnd(12, 34);
    if (hitY) t.y += hitY * rnd(12, 34);
    SFX.corner();
    burst(t.x, t.y, '#ffd400', 7);
    banner('SUBJECT TRIPPED!', '#ffd400', 30);
  }
}

function behaviourOrbit(t, lv, f) {
  const cx = W / 2, cy = (MINY + MAXY) / 2 + 4;
  const rx = (MAXX - MINX) / 2 - 16, ry = (MAXY - MINY) / 2 - 12;

  t.ft -= f;
  if (t.ft <= 0) {
    t.frozen = !t.frozen;
    t.ft = t.frozen ? rnd(34, 52) : rnd(72, 108);
    if (t.frozen) burst(t.x, t.y, '#ff2fb9', 5);
  }

  if (!t.frozen) t.ph += 0.050 * f;
  t.x = cx + Math.sin(t.ph) * rx;
  t.y = cy + Math.sin(t.ph * 2 + 0.6) * ry;

  if (t.frozen) {
    if (Math.random() < 0.4) burst(t.x + rnd(-6, 6), t.y + rnd(-6, 6), '#ffffff', 1);
  }
}

function behaviourChaos(t, lv, f) {
  t.ph += 0.1 * f;
  t.cd -= f;
  if (t.cd <= 0) {
    t.cd = rnd(26, 52);
    t.ang = rnd(0, 6.28);
    if (Math.random() < 0.4) {
      burst(t.x, t.y, '#ffd400', 9);
      t.x = rnd(MINX + 14, MAXX - 14);
      t.y = rnd(MINY + 14, MAXY - 14);
      burst(t.x, t.y, '#ffd400', 9);
      SFX.puff();
    }
  }
  const sp = 1.55 + Math.sin(t.ph * 0.6) * 0.5;
  t.x += (Math.cos(t.ang) * sp + Math.sin(t.ph * 2.7) * 0.55) * f;
  t.y += (Math.sin(t.ang) * sp + Math.cos(t.ph * 2.1) * 0.55) * f;
  if (t.x < MINX) { t.x = MINX; t.ang = -t.ang; }
  if (t.x > MAXX) { t.x = MAXX; t.ang = -t.ang; }
  if (t.y < MINY) { t.y = MINY; t.ang = Math.PI - t.ang; }
  if (t.y > MAXY) { t.y = MAXY; t.ang = Math.PI - t.ang; }
}

/* ---------------------------------------------------------------- fx ----- */
function burst(x, y, c, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.28), s = rnd(0.5, 2.2);
    game.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(14, 34), c, s: rnd(1, 3) });
  }
}
function banner(txt, col, dur) { game.banner = txt; game.bannerCol = col || '#fff'; game.bannerT = dur || 70; }

/* --------------------------------------------------------------- update -- */
function update(f) {
  if (game.state === 'intro') { updateIntro(f); return; }

  game.t++;
  if (game.cool > 0) game.cool--;
  if (game.flashA > 0) game.flashA -= 0.14 * f;
  if (game.bannerT > 0) game.bannerT -= f;

  for (let i = game.parts.length - 1; i >= 0; i--) {
    const p = game.parts[i];
    p.x += p.vx * f; p.y += p.vy * f; p.life -= f;
    if (p.life <= 0) game.parts.splice(i, 1);
  }
  for (let i = game.rings.length - 1; i >= 0; i--) {
    game.rings[i].life -= f; game.rings[i].r += 2.6 * f;
    if (game.rings[i].life <= 0) game.rings.splice(i, 1);
  }

  const lv = LEVELS[game.level];

  if (game.state === 'ready') {
    game.timer -= f;
    if (game.timer <= 0) { game.state = 'play'; SFX.go(); }
    return;
  }
  if (game.state !== 'play') return;

  const t = game.target;
  if (lv.behavior === 'flee') behaviourFlee(t, lv, f);
  else if (lv.behavior === 'orbit') behaviourOrbit(t, lv, f);
  else behaviourChaos(t, lv, f);

  t.x = clr(t.x, MINX, MAXX); t.y = clr(t.y, MINY, MAXY);

  /* occlusion (mode 2 cabinets) */
  game.occluded = false;
  if (lv.behavior === 'orbit') {
    for (const c of CABINETS) {
      if (t.x > c.x - 2 && t.x < c.x + c.w + 2 && t.y > c.y - 2 && t.y < c.y + c.h + 2) { game.occluded = true; break; }
    }
  }

  /* decoys (mode 3) */
  if (lv.behavior === 'chaos') {
    game.dbg -= f;
    if (game.dbg <= 0 && game.decoys.length < 2) {
      game.dbg = 150;
      game.decoys.push({
        x: rnd(MINX + 12, MAXX - 12), y: rnd(MINY + 12, MAXY - 12),
        life: rnd(300, 420), size: t.size, ph: rnd(0, 6.28), born: 0
      });
    }
    for (let i = game.decoys.length - 1; i >= 0; i--) {
      const d = game.decoys[i];
      d.born = Math.min(1, d.born + 0.08 * f);
      d.life -= f; d.ph += 0.05 * f;
      const dx = game.cam.x - d.x, dy = game.cam.y - d.y;
      const dd = Math.hypot(dx, dy) || 1;
      d.x += (dx / dd) * 0.34 * f + Math.sin(d.ph) * 0.5 * f;
      d.y += (dy / dd) * 0.34 * f + Math.cos(d.ph * 1.3) * 0.5 * f;
      d.x = clr(d.x, MINX, MAXX); d.y = clr(d.y, MINY, MAXY);
      if (d.life <= 0) game.decoys.splice(i, 1);
    }
  }
}

/* ----------------------------------------------------------------- snap -- */
function accuracy(t) {
  const nx = Math.abs(game.cam.x - t.x) / (RET_W / 2 + t.size / 2);
  const ny = Math.abs(game.cam.y - t.y) / (RET_H / 2 + t.size / 2);
  return Math.max(0, 1 - Math.hypot(nx, ny));
}

function shoot() {
  if (game.state !== 'play' || game.cool > 0) return;
  const lv = LEVELS[game.level];
  game.cool = 16;
  game.flashA = 1;
  SFX.shoot();
  game.rings.push({ x: game.cam.x, y: game.cam.y, r: 6, life: 20, c: '#ffffff' });

  const t = game.target;
  let rate, col, gain = 0;

  /* photo snapshot of the current frame */
  const ph = document.createElement('canvas');
  ph.width = 96; ph.height = 54;
  const pc = ph.getContext('2d');
  pc.imageSmoothingEnabled = false;
  pc.drawImage(cvs, 0, 0, 96, 54);

  /* decoy in the way? */
  let decoyHit = null, best = 1.2;
  for (const d of game.decoys) {
    const dd = Math.hypot(game.cam.x - d.x, game.cam.y - d.y);
    if (dd < RET_W / 2 && dd < best) { best = dd; decoyHit = d; }
  }

  if (game.occluded) {
    /* behind a cabinet: no film wasted */
    game.cool = 8;
    rate = 'BLOCKED'; col = '#8fa6b8'; SFX.blocked();
    banner('BLOCKED! - NO FILM USED', '#8fa6b8', 60);
  } else if (decoyHit) {
    game.film--;
    rate = 'WRONG ONE!'; col = '#ff2fb9'; SFX.wrong();
    game.score = Math.max(0, game.score - 150);
    game.decoys.splice(game.decoys.indexOf(decoyHit), 1);
    burst(decoyHit.x, decoyHit.y, '#ff2fb9', 14);
    banner('WRONG TARGET  -150', '#ff2fb9', 70);
  } else {
    game.film--;
    const acc = accuracy(t);
    if (acc >= 0.88) { rate = 'PERFECT!'; col = '#00ff9c'; gain = 1; SFX.perfect(); }
    else if (acc >= 0.72) { rate = 'GREAT!'; col = '#00e5ff'; gain = 0.75; SFX.good(); }
    else if (acc >= 0.55) { rate = 'NICE'; col = '#ffd400'; gain = 0.55; SFX.good(); }
    else if (acc >= 0.34) { rate = 'OK'; col = '#c8e6ff'; gain = 0.35; SFX.ok(); }
    else { rate = 'TOO FAR'; col = '#ff5b5b'; SFX.far(); banner('SUBJECT TOO FAR', '#ff5b5b', 60); }

    if (gain > 0) {
      const pts = Math.round((300 + game.level * 250) * (1 + acc) * gain + (acc >= 0.88 ? 200 : 0));
      game.score += pts;
      game.pips++;
      game.album.push({ mode: lv.tag, name: lv.name, rate, col, pts, acc, photo: ph });
      banner(rate + '  +' + pts, col, 60);
      burst(t.x, t.y, col, 14);
    }
  }

  game.lastRate = { rate, col };
  game.shotT = 52;

  if (game.film <= 0) {
    game.state = game.pips >= lv.goal ? 'clear' : 'fail';
    if (game.state === 'clear') SFX.clear();
    else { SFX.fail(); showFail(); }
  } else if (game.pips >= lv.goal) {
    game.state = 'clear';
    SFX.clear();
  }
}

/* --------------------------------------------------------------- scenes -- */
function sceneMall() {
  px(0, 0, W, H, '#0d1430');
  px(0, MINY - 6, W, 4, '#1b2a5e');
  for (let y = MINY - 2; y < H; y += 16) {
    for (let x = 0; x < W; x += 16) {
      px(x + 1, y + 1, 14, 14, (((x / 16) + (y / 16)) % 2) ? '#20306b' : '#26397e');
    }
  }
  px(0, 44, W, 3, '#5ce1ff'); px(0, 45, W, 1, '#0a4a6a');
  /* storefronts */
  for (let x = 6; x < W; x += 54) {
    rct(x, MINY - 2, 44, 12, '#2a1c5c');
    px(x + 3, MINY, 38, 5, ['#ff2fb9', '#ffd400', '#00e5ff'][(x / 54) % 3 | 0]);
  }
  /* planters + benches */
  for (let x = 22; x < W; x += 96) {
    px(x, 132, 16, 12, '#3d2a1a'); px(x + 2, 122, 12, 12, '#1f7a4a'); px(x + 5, 118, 6, 6, '#2fae66');
  }
  /* fountain */
  px(150, 100, 34, 22, '#0e2a52'); px(152, 102, 30, 18, '#2b8fd6');
  px(164, 104, 6, 14, '#a8e4ff');
  if ((game.t >> 3) % 2) px(158, 100, 18, 2, '#ffffff');
  /* escalator hint */
  for (let i = 0; i < 6; i++) px(300, 60 + i * 5, 12 + i * 2, 2, '#3a5aa8');
}

function sceneArcade() {
  px(0, 0, W, H, '#12061f');
  px(0, MINY - 8, W, 8, '#1d0b36');
  for (let y = MINY; y < H; y += 8) px(0, y, W, 1, '#24103f');
  /* neon signs */
  const cols = ['#ff2fb9', '#00e5ff', '#ffd400', '#7b2bff'];
  for (let i = 0; i < 4; i++) {
    const x = 14 + i * 78;
    px(x, 22, 56, 10, '#2a0f4d');
    px(x + 2, 24, 52, 6, cols[i]);
    if ((game.t + i * 9) % 24 < 12) px(x + 2, 24, 52, 2, '#ffffff');
  }
  /* carpet checker */
  for (let y = MINY + 4; y < H; y += 12) for (let x = 0; x < W; x += 12) px(x, y, 12, 12, ((x + y) / 12 % 2) ? '#2b0f4a' : '#33124f');
  /* cabinets */
  for (const c of CABINETS) {
    rct(c.x, c.y, c.w, c.h, '#1b1b33');
    px(c.x + 2, c.y + 2, c.w - 4, 9, '#0a4a5e');
    for (let i = 0; i < 4; i++) px(c.x + 4 + i * 7, c.y + 4, 5, 4, cols[i]);
    px(c.x + 3, c.y + 13, c.w - 6, 2, '#e8e8ff');
    px(c.x + 5, c.y + 16, 4, 4, '#ff2fb9'); px(c.x + 11, c.y + 16, 4, 4, '#ffd400');
  }
}

function sceneTower() {
  const sky = ['#101a4a', '#2a1a5e', '#5a1f52'];
  for (let y = 0; y < 62; y++) px(0, y, W, 1, sky[Math.min(2, (y / 21) | 0)]);
  /* skyline */
  for (let x = 0; x < W; x += 22) {
    const h = 18 + ((x * 7) % 5) * 7;
    px(x, 62 - h, 18, h, '#0b1030');
    for (let wy = 64 - h; wy < 60; wy += 5) for (let wx = x + 3; wx < x + 16; wx += 5)
      if ((wx + wy + game.t) % 3) px(wx, wy, 2, 2, '#ffd400');
  }
  /* rain */
  for (let i = 0; i < 46; i++) {
    const x = (i * 37 + game.t * 3.4) % (W + 20) - 10;
    const y = (i * 71 + game.t * 9) % (H + 20) - 10;
    px(x, y, 1, 5, 'rgba(180,220,255,.45)');
  }
  /* glass floor */
  px(0, 62, W, H - 62, '#101736');
  for (let x = 0; x < W; x += 20) px(x, 62, 1, H - 62, '#1e2b55');
  for (let y = 64; y < H; y += 16) px(0, y, W, 1, '#1e2b55');
  for (let x = 20; x < W; x += 80) rct(x, 74, 26, 26, '#243357');
}

/* ------------------------------------------------------------------ HUD -- */
function drawHUD(lv) {
  px(0, 0, W, 41, 'rgba(4,2,12,.80)');
  px(0, 40, W, 1, lv.accent);

  textShadow('SNAP!1986', 6, 5, 8, '#ffffff', '#000');
  text(lv.tag, 76, 6, 8, lv.accent);
  text(lv.name, 128, 6, 8, '#ffffff');

  /* shots required */
  const pipX = 6;
  text('PHOTOS', 6, 20, 6, '#9fd8ff');
  for (let i = 0; i < lv.goal; i++) {
    const on = i < game.pips;
    px(pipX + 44 + i * 12, 20, 9, 9, on ? '#00ff9c' : '#2a2a45');
    px(pipX + 46 + i * 12, 22, 5, 5, on ? '#dfffee' : '#40405e');
  }

  /* film */
  text('FILM', 150, 20, 6, '#9fd8ff');
  const low = game.film <= 4;
  text(String(game.film), 176, 19, 8, low && (game.t >> 4) % 2 ? '#ff5b5b' : '#ffd400');

  text('SCORE', 216, 20, 6, '#9fd8ff');
  text(String(game.score), 252, 19, 8, '#ffffff');

  /* wanted poster thumbnail */
  px(W - 22, 4, 18, 18, '#1a1a2e');
  px(W - 21, 5, 16, 16, '#efe9d6');
  drawSprite(W - 13, 13, 12);
  text('TGT', W - 27, 25, 6, '#ff2fb9');
}

/* --------------------------------------------------------------- render -- */
function draw() {
  if (game.state === 'intro') { drawIntro(); return; }

  const lv = LEVELS[game.level];

  if (game.state === 'title') {
    titleScreen();
    return;
  }

  lv.scene === 'mall' ? sceneMall() : lv.scene === 'arcade' ? sceneArcade() : sceneTower();

  const t = game.target;

  /* decoys behind the real target */
  for (const d of game.decoys) {
    const fade = Math.min(1, d.life / 40) * d.born;
    if ((game.t >> 2) % 2) drawSprite(d.x, d.y, d.size, fade * 0.85);
    px(d.x - 10, d.y + d.size / 2 + 2, 20, 2, 'rgba(0,0,0,.35)');
  }

  /* shadow + subject */
  px(t.x - 10, t.y + t.size / 2 + 1, 20, 3, 'rgba(0,0,0,.40)');
  if (lv.behavior === 'flee' && t.stun <= 0) {
    /* motion streaks while it bolts away */
    const sx = Math.sign(t.x - game.cam.x), sy = Math.sign(t.y - game.cam.y);
    for (let i = 2; i <= 4; i++) {
      ctx.globalAlpha = 0.22 - i * 0.05;
      drawSprite(t.x - sx * i * 3, t.y - sy * i * 2, t.size);
    }
    ctx.globalAlpha = 1;
  }
  drawSprite(t.x, t.y, t.size);
  if (lv.behavior === 'flee' && t.stun > 0) {
    /* caught-in-the-act marker */
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 1;
    ctx.strokeRect((t.x - t.size / 2 - 2) | 0, (t.y - t.size / 2 - 2) | 0, t.size + 4, t.size + 4);
    ctx.globalAlpha = 1;
  }

  /* frozen marker */
  if (lv.behavior === 'orbit' && t.frozen && (game.t >> 3) % 2) {
    text('FREEZE!', t.x, t.y - t.size / 2 - 12, 6, '#ff2fb9', 'center');
  }
  /* cornered marker */
  if (lv.behavior === 'flee' && t.stun > 0) {
    text('*!*', t.x, t.y - t.size / 2 - 11, 6, '#ffd400', 'center');
  }

  /* cabinets on top so they really block the subject */
  if (lv.scene === 'arcade') {
    for (const c of CABINETS) {
      rct(c.x, c.y, c.w, c.h, '#1b1b33');
      px(c.x + 2, c.y + 2, c.w - 4, 9, '#0a4a5e');
      for (let i = 0; i < 4; i++) px(c.x + 4 + i * 7, c.y + 4, 5, 4, ['#ff2fb9', '#00e5ff', '#ffd400', '#7b2bff'][i]);
      px(c.x + 3, c.y + 13, c.w - 6, 2, '#e8e8ff');
    }
  }

  /* viewfinder */
  const cx = clr(game.cam.x, RET_W / 2 + 2, W - RET_W / 2 - 2);
  const cy = clr(game.cam.y, RET_H / 2 + 2, H - RET_H / 2 - 2);
  const x0 = Math.round(cx - RET_W / 2), y0 = Math.round(cy - RET_H / 2);
  const acc = t ? accuracy(t) : 0;
  const lock = game.state === 'play' && !game.occluded && acc >= 0.34;
  const col = lock ? (acc >= 0.88 ? '#00ff9c' : acc >= 0.72 ? '#00e5ff' : '#ffd400') : '#ff5b5b';

  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(0, 42, W, H - 42);
  for (const seg of [[0, 42, x0, H - 42], [x0 + RET_W, 42, W - x0 - RET_W, H - 42]]) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(seg[0], seg[1], seg[2], seg[3]);
  }

  ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 0.5, y0 - 0.5, RET_W + 1, RET_H + 1);
  px(x0 - 5, y0 + RET_H / 2 - 1, 5, 2, col);
  px(x0 + RET_W, y0 + RET_H / 2 - 1, 5, 2, col);
  px(cx - 1, y0 - 5, 2, 5, col);
  px(cx - 1, y0 + RET_H, 2, 5, col);
  px(cx - 5, y0 + RET_H / 2, 4, 1, '#ffffff');
  px(cx + 2, y0 + RET_H / 2, 4, 1, '#ffffff');
  text('AF', x0, y0 - 9, 6, col);
  text('REC', x0 + RET_W - 14, y0 - 9, 6, (game.t >> 4) % 2 ? '#ff2fb9' : '#601020');

  /* lock meter */
  const mw = 40;
  px(cx - mw / 2, y0 + RET_H + 5, mw, 3, '#20203a');
  px(cx - mw / 2, y0 + RET_H + 5, Math.round(mw * acc), 3, col);

  /* rings */
  for (const r of game.rings) {
    ctx.globalAlpha = Math.min(1, r.life / 20);
    ctx.strokeStyle = r.c; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* particles */
  for (const p of game.parts) {
    ctx.globalAlpha = Math.min(1, p.life / 18);
    px(p.x, p.y, p.s, p.s, p.c);
  }
  ctx.globalAlpha = 1;

  drawHUD(lv);

  /* rate feedback */
  if (game.shotT > 0) {
    game.shotT--;
    if (game.lastRate) centerBig(game.lastRate.rate, 62, 14, game.lastRate.col, '#30001f');
  }
  if (game.bannerT > 0) centerBig(game.banner, 100, 10, game.bannerCol || '#fff', '#200010');

  if (game.state === 'ready') {
    const n = Math.ceil(game.timer / 26);
    if (game.timer > 8) centerBig(n > 3 ? 'READY' : String(Math.min(3, n)), 76, 16, '#ffd400', '#3a2a00');
  }
  if (game.state === 'clear') {
    px(0, 60, W, 56, 'rgba(6,2,16,.86)');
    centerBig('MODE CLEAR!', 70, 16, '#00ff9c', '#00301f');
    centerBig('PHOTOS ' + game.pips + '/' + LEVELS[game.level].goal, 96, 8, '#ffffff');
    centerBig('SCORE ' + game.score, 112, 8, '#ffd400');
    centerBig('PRESS SPACE', 132, 8, (game.t >> 4) % 2 ? '#00e5ff' : '#0a5a6a');
  }
  if (game.state === 'fail') {
    px(0, 60, W, 56, 'rgba(20,0,8,.86)');
    centerBig('OUT OF FILM', 70, 16, '#ff5b5b', '#300008');
    centerBig('PHOTOS ' + game.pips + '/' + LEVELS[game.level].goal, 96, 8, '#ffffff');
    centerBig('PRESS SPACE TO RETRY', 114, 8, (game.t >> 4) % 2 ? '#ffd400' : '#6a5a00');
  }

  if (game.flashA > 0) {
    ctx.globalAlpha = Math.min(0.85, game.flashA);
    px(0, 0, W, H, '#ffffff');
    ctx.globalAlpha = 1;
  }
}

/* --------------------------------------------------------- title screen -- */
function titleScreen() {
  for (let y = 0; y < H; y++) px(0, y, W, 1, ['#160a33', '#2a0f4a', '#4a1052'][Math.min(2, (y / 60) | 0)]);
  for (let i = 0; i < 40; i++) {
    const x = (i * 83) % W, y = (i * 47 + game.t * (0.4 + (i % 3) * 0.3)) % H;
    px(x, y, 1, 1, i % 4 ? '#ffffff' : '#00e5ff');
  }
  /* perspective grid */
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W;
    px(x, 108, 1, H - 108, '#ff2fb9');
  }
  for (let i = 0; i < 8; i++) {
    const y = 108 + Math.pow(i / 7, 2.1) * (H - 108);
    px(0, y | 0, W, 1, i % 2 ? '#00e5ff' : '#7b2bff');
  }
  px(0, 107, W, 2, '#ffffff');

  /* big logo */
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  setFont('26px');
  ctx.fillStyle = '#2a0a3a'; ctx.fillText('SNAP!', W / 2 + 3, 24 + 3);
  ctx.fillStyle = '#ffd400'; ctx.fillText('SNAP!', W / 2, 24);
  ctx.fillStyle = '#fff8c0'; ctx.fillRect(W / 2 - 44, 54, 88, 3);
  setFont('12px');
  ctx.fillStyle = '#00e5ff'; ctx.fillText('1986', W / 2, 60);
  ctx.restore();

  centerBig('PHOTO HUNTER', 78, 8, '#ffffff', '#3a0a4a');
  if ((game.t >> 5) % 2) centerBig('CLICK OR PRESS SPACE TO START', 96, 8, '#00ff9c', '#00301f');

  /* mode boxes */
  const bw = 92, gap = 8, total = bw * 3 + gap * 2, x0 = (W - total) / 2;
  for (let i = 0; i < 3; i++) {
    const lv = LEVELS[i], x = x0 + i * (bw + gap);
    rct(x, 122, bw, 40, '#0b0530');
    px(x, 122, bw, 2, lv.accent);
    text(lv.tag, x + 4, 126, 6, lv.accent);
    text(lv.name.slice(0, 12), x + 4, 136, 6, '#ffffff');
    text(lv.diff, x + 4, 146, 6, lv.accent);
    text(lv.goal + ' PHOTOS', x + 4, 156, 6, '#9fd8ff');
  }
  centerBig('(C) 1986 PIXELWORKS', 166, 6, '#7fd7e8', '#001820');
}

/* ------------------------------------------------------------- overlays -- */
function hideOverlay() { overlay.classList.remove('on'); overlay.innerHTML = ''; }

function showTitle() {
  game.state = 'title';
  overlay.innerHTML =
    '<div class="panel">' +
    '<h1>SNAP! 1986</h1>' +
    '<h2>PHOTO HUNTER &mdash; 3 MODES</h2>' +
    '<p>Foto <b>subjek</b> ini.<br>Bawa <span class="hl2">viewfinder</span> ke atas subjek lalu tekan <span class="hl">SPACE</span>.</p>' +
    '<div class="mode-list">' +
    '<div class="mode-card"><b>MODE 1</b>MALL CAM<br>EASY (HARD!)<br>Subjek kabur dari mouse</div>' +
    '<div class="mode-card"><b>MODE 2</b>ARCADE ALLEY<br>NORMAL<br>Subjek BERHENTI sesaat, bidik itu</div>' +
    '<div class="mode-card"><b>MODE 3</b>TOWER 300<br>HARD<br>Erratic + 2 decoys</div>' +
    '</div>' +
    '<p>Subjek: <span class="hl2">foto target</span> &mdash; foto juga bisa gagal kabur ke belakang kabinet arcade.</p>' +
    '<div class="row"><button id="startBtn" type="button">Mulai Main</button>' +
    '<button id="helpBtn" class="alt" type="button">Cara Main</button></div>' +
    '<p class="blink" style="margin-top:12px">Klik area layar untuk mulai</p>' +
    '</div>';
  overlay.classList.add('on');
  overlay.querySelector('#startBtn').onclick = () => { actx(); startLevel(0); };
  overlay.querySelector('#helpBtn').onclick = showHelp;
}

function showHelp() {
  overlay.innerHTML =
    '<div class="panel">' +
    '<h1>CARA MAIN</h1>' +
    '<p><span class="hl2">MOUSE</span> &rarr; pergerakan viewfinder.<br>' +
    '<span class="hl2">SPACE / KLIK</span> &rarr; jepret foto (1 film = 1 foto).<br>' +
    '<span class="hl2">R</span> &rarr; ulangi mode dari awal.<br>' +
    '<span class="hl2">M</span> &rarr; nyalakan / mati suara.</p>' +
    '<p>Semakin <span class="hl">dekat dan tepat tengah</span> viewfinder dengan subjek,<br>skor foto makin besar: <span class="hl2">OK</span> &rarr; <span class="hl2">NICE</span> &rarr; <span class="hl2">GREAT!</span> &rarr; <span class="hl">PERFECT!</span></p>' +
    '<p>Bar hijau di bawah viewfinder = tingkat lock.</p>' +
    '<p class="blink">MODE 1: subjek terus KABUR dari cursor.<br>Jendela jepret hanya sebentar:<br>kena tembok (TRIP) atau terpeleset (SLIP).</p>' +
    '<div class="row"><button id="backBtn" type="button">Kembali</button></div>' +
    '</div>';
  overlay.classList.add('on');
  overlay.querySelector('#backBtn').onclick = showTitle;
}

function showIntro(i) {
  const lv = LEVELS[i];
  game.pendingIntro = i;
  overlay.innerHTML =
    '<div class="panel">' +
    '<h1>' + lv.name + '</h1>' +
    '<h2>' + lv.tag + ' &nbsp;/&nbsp; ' + lv.diff + '</h2>' +
    '<p style="white-space:pre-line;color:#ffd400">' + lv.brief + '</p>' +
    '<p>Foto yang dibutuhkan: <span class="hl2">' + lv.goal + '</span> &nbsp;|&nbsp; Film: <span class="hl2">' + lv.film + '</span></p>' +
    '<div class="row"><button id="goBtn" class="gold" type="button">Jepret! (Space)</button></div>' +
    '</div>';
  overlay.classList.add('on');
  overlay.querySelector('#goBtn').onclick = beginPending;
}

function beginPending() {
  const i = game.pendingIntro;
  game.pendingIntro = null;
  hideOverlay();
  loadLevel(i);
}

function showFail() {
  game.pendingIntro = null;
  const lv = LEVELS[game.level];
  overlay.innerHTML =
    '<div class="panel">' +
    '<h1>OUT OF FILM</h1>' +
    '<h2>' + lv.tag + ' ' + lv.name + '</h2>' +
    '<p>Foto terkumpul: <span class="hl2">' + game.pips + '/' + lv.goal + '</span><br>' +
    'Skor: <span class="hl">' + game.score + '</span></p>' +
    '<p class="blink">"Subjeknya licin seperti pixel."</p>' +
    '<div class="row"><button id="retryBtn" class="gold" type="button">Coba Lagi</button>' +
    '<button id="menuBtn" class="alt" type="button">Menu</button></div>' +
    '</div>';
  overlay.classList.add('on');
  overlay.querySelector('#retryBtn').onclick = () => { hideOverlay(); loadLevel(game.level); };
  overlay.querySelector('#menuBtn').onclick = showTitle;
}

function showAlbum() {
  game.pendingIntro = null;
  const shots = game.album.length;
  const perfect = game.album.filter(a => a.rate === 'PERFECT!').length;
  const acc = shots ? Math.round(game.album.reduce((s, a) => s + a.acc, 0) / shots * 100) : 0;

  const polaroids = game.album.map((a, i) =>
    '<div class="polaroid"><canvas width="96" height="54" data-i="' + i + '"></canvas>' +
    '<div class="cap"><span class="rate">' + a.rate + '</span><br>' + a.mode + '<br>' + a.pts + ' PTS</div></div>'
  ).join('') || '<p style="grid-column:1/-1">Tidak ada foto...</p>';

  overlay.innerHTML =
    '<div class="panel">' +
    '<h1>ALBUM SELESAI</h1>' +
    '<h2>SEMUA MODE TAMAT &mdash; 3/3</h2>' +
    '<div class="stats">TOTAL FOTO: ' + shots + ' &nbsp;|&nbsp; PERFECT: ' + perfect +
    ' &nbsp;|&nbsp; RATA-RATA ACCURACY: ' + acc + '%<br>TOTAL SKOR: <span class="hl">' +
    game.album.reduce((s, a) => s + a.pts, 0) + '</span></div>' +
    '<div class="album">' + polaroids + '</div>' +
    '<div class="row"><button id="albumMenuBtn" class="gold" type="button">Menu Utama</button></div>' +
    '</div>';
  overlay.classList.add('on');
  overlay.querySelectorAll('.polaroid canvas').forEach((c) => {
    const a = game.album[+c.dataset.i];
    if (!a) return;
    const cc = c.getContext('2d');
    cc.imageSmoothingEnabled = false;
    cc.drawImage(a.photo, 0, 0, 96, 54);
    cc.fillStyle = 'rgba(255,60,120,.16)'; cc.fillRect(0, 0, 96, 54);
  });
  overlay.querySelector('#albumMenuBtn').onclick = showTitle;
}

/* ----------------------------------------------------------------- flow -- */
function advance() {
  actx();
  if (game.pendingIntro != null) { beginPending(); return; }
  if (game.state === 'clear') {
    hideOverlay();
    if (game.level >= LEVELS.length - 1) {
      game.state = 'done';
      showAlbum();
    } else {
      showIntro(game.level + 1);
    }
  } else if (game.state === 'fail') {
    hideOverlay();
    loadLevel(game.level);
  } else if (game.state === 'title' || game.state === 'done') {
    startLevel(0);
  }
}

function toggleSound() {
  muted = !muted;
  soundBtn.textContent = 'SOUND: ' + (muted ? 'OFF' : 'ON');
  if (!muted) actx();
}

/* ---------------------------------------------------------------- input -- */
function toLocal(e) {
  const r = cvs.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function aim(e) {
  const p = toLocal(e);
  game.cam.x = p.x; game.cam.y = p.y;
}
cvs.addEventListener('mousemove', aim);
cvs.addEventListener('touchmove', (e) => { e.preventDefault(); aim(e.touches[0]); }, { passive: false });
cvs.addEventListener('touchstart', (e) => { e.preventDefault(); aim(e.touches[0]); }, { passive: false });
cvs.addEventListener('mousedown', (e) => {
  e.preventDefault(); aim(e);
  if (game.state === 'intro') { skipIntro(); return; }
  if (!overlay.classList.contains('on')) shoot();
});
cvs.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (game.state === 'intro') { skipIntro(); return; }
  if (!overlay.classList.contains('on')) shoot();
});

overlay.addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  advance();
});
overlay.addEventListener('touchstart', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  advance();
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (game.state === 'intro') { skipIntro(); return; }
    if (overlay.classList.contains('on')) { advance(); return; }
    shoot();
  } else if (k === 'r') {
    if (game.state !== 'title' && game.state !== 'done') { hideOverlay(); loadLevel(game.level); }
  } else if (k === 'm') {
    toggleSound();
  }
});
soundBtn.addEventListener('click', toggleSound);

/* ----------------------------------------------------------------- loop -- */
let last = 0;
function loop(ts) {
  if (!last) last = ts;
  const dt = Math.min(64, ts - last);
  last = ts;
  const f = dt / 16.6667;
  update(f);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* boot: cold start sequence first, then the attract/title screen */
loadLevel(0);
startIntro();