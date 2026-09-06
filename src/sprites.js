// Every sprite is drawn in code. Characters are built from parts so they can animate.
import * as THREE from 'three';

// ---------- palette ----------
export const PAL = {
  // sky stops [top, mid, horizon]
  skyDay: ['#c9705a', '#efa77b', '#ffd9a8'],
  skyDusk: ['#3a1650', '#c04a6c', '#ffb46e'],
  skyNight: ['#07051a', '#150e3a', '#2d1a5a'],
  // world
  mtFar: '#7f4f8a', mtFarTop: '#a071a8',
  mtMid: '#6a3a68', mtMidTop: '#8a5382',
  mtNear: '#4e2a4c', mtNearTop: '#6a3a5f',
  sandTop: '#f0a26e', sand: '#c9634f', sandDark: '#9a4340', sandDeep: '#6f2f38',
  pebble: '#e8b58a', pebbleDark: '#7d3540',
  // materials
  steel: '#9fb0c4', steelL: '#e4edf5', steelD: '#4e5a70', steelXD: '#28304a',
  orange: '#ff9f43', orangeD: '#c25a1c', gold: '#ffe066', cyan: '#5ff5ff', cyanD: '#1cb7c4',
  red: '#ff5a5a', redD: '#a22d3f', green: '#a4ff4a', greenD: '#3d9b3a',
  purple: '#8a4fd0', purpleD: '#4a2378', purpleXD: '#26113f', pink: '#ff7ab8',
  crystal: '#52f0d4', crystalL: '#c8fff4', crystalD: '#1d9e8f', crystalXD: '#0f5c58',
  brown: '#8a5a3a', brownD: '#553521',
};

export function tex(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tiny painter: P(x, y, w, h, color, emissive?)
// Drawing twice (base and emissive) lets glowing pixels sit on an unlit child sprite.
function painter(ctx, mode) {
  return (x, y, w, h, c, em = false) => {
    if (mode === 'em' && !em) return;
    ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
  };
}

// build { base: [canvas...], em: [canvas...] } from a draw(P, frame) function
export function frames(w, h, n, draw) {
  const base = [], em = [];
  for (let f = 0; f < n; f++) {
    for (const mode of ['base', 'em']) {
      const [c, ctx] = canvasOf(w, h);
      draw(painter(ctx, mode), f);
      (mode === 'base' ? base : em).push(c);
    }
  }
  return { w, h, base, em };
}

export function rows(rowsArr, pal) {
  const h = rowsArr.length, w = rowsArr[0].length;
  return frames(w, h, 1, (P) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = pal[rowsArr[y][x]];
      if (col) P(x, y, 1, 1, col);
    }
  });
}

export function drawn(w, h, fn) {
  const [c, ctx] = canvasOf(w, h);
  fn(ctx, w, h);
  return c;
}

// ---------- characters ----------
// walk cycle leg/arm offsets for 4 frames
const GAIT = [
  { l: -2, r: 2, lu: 0, ru: 0, bob: 0 },
  { l: -1, r: 1, lu: 1, ru: 0, bob: 1 },
  { l: 2, r: -2, lu: 0, ru: 0, bob: 0 },
  { l: 1, r: -1, lu: 0, ru: 1, bob: 1 },
];

// Commander: 18 x 30. Facing right.
export function player() {
  const W = 18, H = 30;
  const draw = (P, f, mode) => {
    const g = mode === 'walk' ? GAIT[f] : { l: 0, r: 0, lu: 0, ru: 0, bob: 0 };
    const idleDip = mode === 'idle' && f === 1 ? 1 : 0;
    const y0 = 2 + idleDip; // top of helmet
    // antenna
    P(9, y0 - 2, 1, 3, PAL.steelD);
    P(9, y0 - 3, 1, 1, f % 2 ? PAL.red : PAL.redD, true);
    // helmet
    P(5, y0, 8, 1, PAL.steelXD);
    P(4, y0 + 1, 10, 8, PAL.steelXD);
    P(5, y0 + 1, 8, 7, PAL.steel);
    P(6, y0 + 1, 6, 1, PAL.steelL);
    P(5, y0 + 2, 1, 4, PAL.steelL);
    // visor
    P(6, y0 + 3, 7, 3, PAL.cyanD, true);
    P(7, y0 + 3, 5, 2, PAL.cyan, true);
    P(8, y0 + 3, 2, 1, '#ffffff', true);
    P(13, y0 + 3, 1, 3, PAL.steelXD);
    // neck
    P(8, y0 + 9, 2, 1, PAL.steelXD);
    // backpack
    P(2, y0 + 11, 3, 8, PAL.steelXD);
    P(3, y0 + 12, 1, 6, PAL.steelD);
    // torso
    const ty = y0 + 10;
    P(5, ty, 9, 10, PAL.orangeD);
    P(6, ty + 1, 7, 8, PAL.orange);
    P(6, ty + 1, 7, 1, '#ffc27a');
    P(8, ty + 3, 3, 3, PAL.gold, true);
    P(9, ty + 4, 1, 1, '#ffffff', true);
    P(6, ty + 8, 7, 1, PAL.orangeD);
    // arms (swing opposite to legs)
    const la = -g.r, ra = -g.l;
    P(4 + Math.round(la / 2), ty + 2, 2, 6, PAL.steelD);   // back arm
    P(13 + Math.round(ra / 2), ty + 2, 2, 6, PAL.steel);   // front arm
    P(13 + Math.round(ra / 2), ty + 7, 2, 2, PAL.steelXD);
    // hips
    P(6, ty + 10, 7, 1, PAL.steelXD);
    // legs
    const ly = ty + 11;
    const legH = H - ly;
    P(6 + g.l, ly, 3, legH - g.lu, PAL.steelD);
    P(6 + g.l, H - 1 - g.lu, 3, 1, PAL.steelXD);
    P(10 + g.r, ly, 3, legH - g.ru, PAL.steel);
    P(10 + g.r, H - 1 - g.ru, 3, 1, PAL.steelXD);
  };
  return {
    walk: frames(W, H, 4, (P, f) => draw(P, f, 'walk')),
    idle: frames(W, H, 2, (P, f) => draw(P, f, 'idle')),
  };
}

// Bots: 16 x 22. role in {idle, miner, guard}
export function bot(role) {
  const W = 16, H = 22;
  const body = { idle: PAL.steelD, miner: '#d9a52a', guard: PAL.redD }[role];
  const bodyL = { idle: '#7284a0', miner: PAL.gold, guard: PAL.red }[role];
  const eye = { idle: '#b8c6d8', miner: PAL.gold, guard: PAL.red }[role];
  const draw = (P, f, mode) => {
    const g = mode === 'walk' ? GAIT[f] : { l: 0, r: 0, lu: 0, ru: 0, bob: 0 };
    const y0 = 1;
    // head
    P(4, y0, 8, 1, PAL.steelXD);
    P(3, y0 + 1, 10, 6, PAL.steelXD);
    P(4, y0 + 1, 8, 5, PAL.steel);
    P(5, y0 + 1, 6, 1, PAL.steelL);
    P(4, y0 + 2, 1, 3, PAL.steelL);
    // eyes
    P(6, y0 + 3, 2, 2, eye, true);
    P(9, y0 + 3, 2, 2, eye, true);
    P(6, y0 + 3, 1, 1, '#ffffff', true);
    P(9, y0 + 3, 1, 1, '#ffffff', true);
    // ear bolts
    P(2, y0 + 3, 1, 2, PAL.steelD); P(13, y0 + 3, 1, 2, PAL.steelD);
    // neck + body
    const ty = y0 + 8;
    P(7, ty - 1, 2, 1, PAL.steelXD);
    P(4, ty, 8, 8, PAL.steelXD);
    P(5, ty + 1, 6, 6, body);
    P(5, ty + 1, 6, 1, bodyL);
    P(7, ty + 3, 2, 2, bodyL);
    // arms
    const la = -g.r, ra = -g.l;
    if (mode === 'mine') {
      // pick swing: 0 raised behind, 1 mid, 2 struck down
      const arm = [[12, ty - 3], [13, ty], [13, ty + 4]][f];
      P(11, ty + 1, 2, 3, PAL.steel);
      // handle
      if (f === 0) { P(12, ty - 6, 1, 6, PAL.brown); P(10, ty - 8, 5, 2, PAL.steel); }
      if (f === 1) { P(13, ty - 1, 4, 1, PAL.brown); P(16, ty - 3, 2, 5, PAL.steel); }
      if (f === 2) { P(13, ty + 2, 1, 6, PAL.brown); P(11, ty + 8, 5, 2, PAL.steel); }
      void arm;
    } else if (mode === 'shoot') {
      // blaster forward, recoil on frame 1
      const k = f === 1 ? -1 : 0;
      P(11 + k, ty + 1, 4, 2, PAL.steel);
      P(14 + k, ty, 2, 4, PAL.steelXD);
      P(15 + k, ty + 1, 1, 2, PAL.red, true);
      if (f === 1) { P(16 + k, ty, 1, 4, PAL.gold, true); }
      P(3, ty + 1, 2, 5, PAL.steelD);
    } else {
      P(3 + Math.round(la / 2), ty + 1, 2, 5, PAL.steelD);
      P(11 + Math.round(ra / 2), ty + 1, 2, 5, PAL.steel);
      if (role === 'guard') { P(12 + Math.round(ra / 2), ty + 5, 3, 2, PAL.steelXD); P(14 + Math.round(ra / 2), ty + 5, 1, 1, PAL.red, true); }
      if (role === 'miner') { P(1, ty - 2, 1, 7, PAL.brown); P(0, ty - 3, 3, 1, PAL.steel); }
    }
    // legs
    const ly = ty + 8;
    const legH = H - ly;
    P(5 + g.l, ly, 2, legH - g.lu, PAL.steelD);
    P(5 + g.l, H - 1 - g.lu, 3, 1, PAL.steelXD);
    P(9 + g.r, ly, 2, legH - g.ru, PAL.steel);
    P(9 + g.r, H - 1 - g.ru, 3, 1, PAL.steelXD);
  };
  return {
    walk: frames(W, H, 4, (P, f) => draw(P, f, 'walk')),
    idle: frames(W, H, 2, (P, f) => draw(P, f, 'idle')),
    mine: frames(W, H, 3, (P, f) => draw(P, f, 'mine')),
    shoot: frames(W, H, 2, (P, f) => draw(P, f, 'shoot')),
  };
}

// Alien crawler. Facing right. big=false: 20x16, big: 30x24
export function alien(big) {
  const W = big ? 30 : 20, H = big ? 24 : 16;
  const bw = big ? 26 : 16, bh = big ? 15 : 9;   // body width/height
  const x0 = (W - bw) / 2;
  const draw = (P, f) => {
    const y0 = 1 + (f % 2);
    // body dome
    P(x0 + 3, y0, bw - 6, 1, PAL.purpleXD);
    P(x0 + 1, y0 + 1, bw - 2, 1, PAL.purpleXD);
    P(x0, y0 + 2, bw, bh - 2, PAL.purpleXD);
    P(x0 + 3, y0 + 1, bw - 6, 1, PAL.purple);
    P(x0 + 1, y0 + 2, bw - 2, bh - 4, PAL.purple);
    P(x0 + 4, y0 + 1, bw - 8, 1, '#b07ae8');
    P(x0 + 1, y0 + 3, 1, 3, '#b07ae8');
    P(x0 + 2, y0 + bh - 3, bw - 4, 2, PAL.purpleD);
    // spots
    P(x0 + 3, y0 + 4, 2, 2, PAL.purpleD); P(x0 + bw - 6, y0 + 3, 2, 1, PAL.purpleD);
    // eyes (front-heavy)
    const ey = y0 + 3;
    const ex = x0 + bw - (big ? 11 : 7);
    P(ex, ey, big ? 3 : 2, big ? 3 : 2, PAL.green, true);
    P(ex + (big ? 5 : 4), ey, big ? 3 : 2, big ? 3 : 2, PAL.green, true);
    P(ex, ey, 1, 1, '#ffffff', true); P(ex + (big ? 5 : 4), ey, 1, 1, '#ffffff', true);
    // mouth
    const my = y0 + bh - 3;
    P(x0 + bw - (big ? 14 : 9), my, big ? 12 : 7, 1, PAL.purpleXD);
    for (let i = 0; i < (big ? 6 : 3); i++) P(x0 + bw - (big ? 13 : 8) + i * 2, my - 1, 1, 1, '#f0f0ff');
    // legs: scuttle
    const ly = y0 + bh - 1;
    const n = big ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const phase = (i + f) % 2;
      const lx = x0 + 2 + i * (big ? 6 : 5);
      const up = phase ? 1 : 0;
      P(lx, ly, 2, H - ly - up, PAL.purpleD);
      P(lx - 1, H - 1 - up, 2, 1, PAL.purpleXD);
      const rx = lx + 3;
      const up2 = phase ? 0 : 1;
      P(rx, ly, 2, H - ly - up2, PAL.purple);
      P(rx + 1, H - 1 - up2, 2, 1, PAL.purpleXD);
    }
  };
  return { walk: frames(W, H, 4, draw) };
}

// ---------- world props ----------
export function crystal() {
  const W = 22, H = 30;
  return frames(W, H, 3, (P, f) => {
    // rock base
    P(1, 25, 20, 4, PAL.sandDark); P(3, 24, 16, 1, PAL.sandDark); P(0, 27, 22, 2, PAL.sandDeep);
    P(4, 25, 4, 1, PAL.pebble);
    // main shard
    const shard = (cx, top, w, bottom, col, colD, colL) => {
      for (let y = top; y <= bottom; y++) {
        const t = (y - top) / (bottom - top);
        const hw = Math.max(1, Math.round(w * Math.min(1, t * 1.6)));
        P(cx - hw, y, hw * 2 + 1, 1, colD, true);
        P(cx - hw + 1, y, Math.max(0, hw * 2 - 1), 1, col, true);
        if (y > top + 1 && y < bottom - 2) P(cx - hw + 1, y, 1, 1, colL, true);
      }
    };
    shard(11, 1, 4, 25, PAL.crystal, PAL.crystalD, PAL.crystalL);
    shard(4, 12, 2, 25, PAL.crystal, PAL.crystalD, PAL.crystalL);
    shard(17, 10, 2, 25, PAL.crystal, PAL.crystalD, PAL.crystalL);
    // shimmer highlight moves between frames
    const hy = [4, 9, 15][f];
    P(10, hy, 2, 1, '#ffffff', true); P(11, hy + 1, 1, 1, '#ffffff', true);
    P(16, 22 - hy / 3, 1, 1, '#ffffff', true);
  });
}

export const scrap = () => rows([
  '..GG..G.',
  '.GYYYYG.',
  'GYYGGYYG',
  '.YGWWGY.',
  '.YGWWGY.',
  'GYYGGYYG',
  '.GYYYYG.',
  '.G..GG..',
], { G: PAL.steelD, Y: PAL.gold, W: '#ffffff' });

export const bullet = () => frames(6, 2, 1, (P) => { P(0, 0, 4, 2, PAL.cyan, true); P(4, 0, 2, 2, '#ffffff', true); });

export const rock = () => rows([
  '.....SSSS.....',
  '...SSLLLSSS...',
  '..SLLSSSSSSS..',
  '.SSSSSSSSSDDS.',
  'SSSSSSSSDDDDDS',
  'SSSSSSDDDDDDDS',
  '.SDDDDDDDDDDD.',
], { S: PAL.sand, L: PAL.pebble, D: PAL.sandDark });

export const rockSmall = () => rows([
  '..SLS..',
  '.SSSSD.',
  'SSSDDDD',
  '.DDDDD.',
], { S: PAL.sand, L: PAL.pebble, D: PAL.sandDark });

// Hab dome: 80 x 60, 2 frames (window flicker + antenna blink)
export function hub() {
  const W = 80, H = 60;
  return frames(W, H, 2, (P, f) => {
    const cx = 40, cy = 44, r = 32;
    for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (y > cy || d > r) continue;
      let col = '#a9bfd6';
      if (d > r - 1.5) col = PAL.steelXD;
      else if (d > r - 3) col = '#7f93ad';
      else if (dx < -8 && dy < -8 && d < r - 6 && d > r - 12) col = '#dbe8f4';
      else if ((x + y) % 9 === 0 || (x - y) % 11 === 0) col = '#8ea6c2';
      P(x, y, 1, 1, col);
    }
    // ribs
    for (const rx of [-20, -8, 8, 20]) {
      for (let y = 12; y < cy; y++) {
        const dy = y - cy, dx = Math.round(rx * Math.sqrt(1 - (dy * dy) / (r * r)));
        if (Number.isFinite(dx)) P(cx + dx, y, 1, 1, '#7f93ad');
      }
    }
    // slab
    P(2, 44, 76, 16, PAL.steelD); P(2, 44, 76, 2, '#7f93ad'); P(2, 58, 76, 2, PAL.steelXD);
    P(0, 56, 80, 4, PAL.steelXD);
    // door
    P(35, 47, 10, 12, PAL.steelXD); P(36, 48, 8, 10, '#1a2030');
    P(37, 49, 6, 1, PAL.cyan, true); P(39, 52, 2, 2, PAL.cyan, true);
    // windows
    const win = f === 0 ? PAL.gold : '#ffd27a';
    for (const wx of [8, 16, 24, 50, 58, 66]) { P(wx, 48, 5, 5, PAL.steelXD); P(wx + 1, 49, 3, 3, win, true); P(wx + 1, 49, 1, 1, '#ffffff', true); }
    // stripes
    for (let x = 4; x < 76; x += 10) P(x, 54, 5, 2, PAL.orange);
    // antenna
    P(40, 2, 1, 12, PAL.steelXD); P(38, 5, 5, 1, PAL.steelXD);
    P(39, 0, 3, 2, f === 0 ? PAL.red : PAL.redD, true);
    // solar panel on top left
    P(10, 30, 14, 3, PAL.steelXD); P(11, 31, 12, 1, '#3b78c9', true);
  });
}

export function fabricator() {
  const W = 30, H = 34;
  return frames(W, H, 3, (P, f) => {
    P(0, 6, 30, 28, PAL.steelXD);
    P(1, 7, 28, 26, PAL.steelD);
    P(2, 8, 26, 1, '#7f93ad');
    // screen
    P(4, 11, 22, 12, '#101624');
    P(6, 13, 4, 4, PAL.cyan, true);
    P(12, 13, 4, 4, PAL.cyan, true);
    P(6, 19, 4 + f * 6, 2, PAL.green, true);
    if (f === 2) { P(20, 13, 4, 4, PAL.gold, true); }
    // hazard base
    for (let x = 1; x < 29; x += 6) { P(x, 27, 3, 5, PAL.gold); P(x + 3, 27, 3, 5, PAL.steelXD); }
    // pipes
    P(6, 0, 4, 6, PAL.steelD); P(20, 0, 4, 6, PAL.steelD);
    P(6, 0, 4, 1, PAL.orange); P(20, 0, 4, 1, PAL.orange);
    // vent glow
    P(2, 24, 26, 1, f === 1 ? PAL.orange : PAL.orangeD, true);
  });
}

function station(icon) {
  return frames(14, 20, 2, (P, f) => {
    P(5, 8, 3, 9, PAL.steelXD); P(6, 8, 1, 9, PAL.steelD);
    P(2, 17, 10, 3, PAL.steelXD); P(3, 17, 8, 1, PAL.steelD);
    P(1, 0, 12, 9, PAL.steelXD); P(2, 1, 10, 7, '#1a2030');
    icon(P, f);
  });
}
export const stationMiner = () => station((P) => { P(4, 2, 1, 5, PAL.brown); P(3, 2, 6, 1, PAL.steel); P(8, 3, 1, 1, PAL.steel); P(9, 5, 2, 2, PAL.gold, true); });
export const stationGuard = () => station((P, f) => { P(3, 3, 6, 2, PAL.red); P(8, 2, 3, 4, PAL.steel); P(4, 5, 2, 2, PAL.steel); P(10, 3, 1, 2, f ? PAL.gold : PAL.red, true); });
export const stationHub = () => station((P, f) => { P(4, 2, 6, 5, PAL.steelD); P(5, 3, 4, 3, f ? PAL.cyan : PAL.cyanD, true); P(6, 2, 2, 1, PAL.red, true); });

export function walls() {
  const W = 24;
  const lv0 = frames(W, 18, 2, (P, f) => {
    P(10, 0, 3, 14, PAL.steelXD);
    for (let y = 1; y < 12; y += 2) P(11, y, 1, 1, f ? PAL.gold : PAL.orange, true);
    P(2, 14, 20, 4, PAL.sandDark); P(4, 13, 6, 1, PAL.sandDark); P(0, 16, 24, 2, PAL.sandDeep);
  });
  const lv1 = frames(W, 16, 1, (P) => {
    const r = rng(5);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * 22), y = 4 + Math.floor(r() * 10);
      P(x, y, 3, 2, r() < 0.5 ? PAL.sand : PAL.pebble);
      P(x, y + 1, 3, 1, PAL.sandDark);
    }
    P(0, 14, 24, 2, PAL.sandDeep); P(6, 2, 10, 2, PAL.sand); P(6, 3, 10, 1, PAL.sandDark);
  });
  const lv2 = frames(W, 28, 1, (P) => {
    P(0, 0, 24, 28, PAL.steelXD);
    for (let y = 1; y < 27; y += 9) { P(1, y, 22, 8, PAL.steelD); P(2, y + 1, 20, 6, PAL.steel); P(2, y + 1, 20, 1, PAL.steelL); P(4, y + 3, 3, 3, PAL.orange); P(17, y + 3, 3, 3, PAL.orange); }
    P(0, 26, 24, 2, PAL.steelXD);
  });
  const lv3 = frames(W, 40, 2, (P, f) => {
    P(0, 4, 24, 36, PAL.steelXD);
    for (let y = 5; y < 38; y += 9) { P(1, y, 22, 8, PAL.steelD); P(2, y + 1, 20, 6, PAL.steel); P(2, y + 1, 20, 1, PAL.steelL); P(4, y + 3, 3, 3, PAL.orange); P(17, y + 3, 3, 3, PAL.orange); }
    // crown lights
    for (let x = 2; x < 24; x += 6) { P(x, 0, 3, 4, PAL.steelXD); P(x + 1, 1, 1, 2, (f + x / 6) % 2 ? PAL.cyan : PAL.cyanD, true); }
    P(0, 38, 24, 2, PAL.steelXD);
  });
  return [lv0, lv1, lv2, lv3];
}

// ---------- backdrop ----------
export const ground = () => drawn(96, 96, (ctx, w, h) => {
  const r = rng(7);
  const P = painter(ctx, 'base');
  P(0, 0, w, h, PAL.sand);
  P(0, 0, w, 3, PAL.sandTop);
  P(0, 3, w, 1, '#e08a63');
  P(0, 14, w, h - 14, PAL.sandDark);
  P(0, 40, w, h - 40, PAL.sandDeep);
  for (let i = 0; i < 120; i++) {
    const y = 4 + Math.floor(r() * (h - 4));
    const col = y < 14 ? (r() < 0.5 ? PAL.pebble : PAL.sandDark) : y < 40 ? (r() < 0.5 ? PAL.sand : PAL.pebbleDark) : PAL.sandDark;
    P(Math.floor(r() * w), y, 1 + Math.floor(r() * 3), 1, col);
  }
  for (let i = 0; i < 18; i++) { P(Math.floor(r() * w), 5 + Math.floor(r() * 8), 2, 1, PAL.pebble); }
});

export const mountains = (seed, base, top, height, spikiness, w = 512, h = 120) => drawn(w, h, (ctx) => {
  const r = rng(seed);
  let y = h - height * 0.6;
  const pts = [];
  const step = 6;
  for (let x = 0; x <= w; x += step) {
    y += (r() - 0.5) * spikiness;
    y = Math.max(h - height, Math.min(h - 10, y));
    pts.push(y);
  }
  pts[pts.length - 1] = pts[0];
  for (let x = 0; x < w; x++) {
    const i = Math.floor(x / step), f = (x % step) / step;
    const yy = Math.floor(pts[i] * (1 - f) + pts[i + 1] * f);
    ctx.fillStyle = base; ctx.fillRect(x, yy, 1, h - yy);
    ctx.fillStyle = top; ctx.fillRect(x, yy, 1, 2);
    // faint snow/ice caps on peaks
    if (yy < h - height + 10) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, yy, 1, 3); }
  }
});

export const stars = (seed, n) => drawn(256, 160, (ctx, w, h) => {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const b = r();
    ctx.fillStyle = b < 0.15 ? '#ffffff' : b < 0.5 ? '#d7dcff' : b < 0.8 ? '#8f97c9' : '#ffd9a8';
    const x = Math.floor(r() * w), y = Math.floor(r() * h);
    ctx.fillRect(x, y, 1, 1);
    if (b < 0.08) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
  }
});

export const disc = (d, col, shade) => drawn(d, d, (ctx) => {
  const c = d / 2;
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x - c + 0.5, dy = y - c + 0.5;
    if (dx * dx + dy * dy <= c * c) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }
  if (shade) {
    ctx.fillStyle = shade;
    ctx.fillRect(Math.floor(c), Math.floor(c / 2), 2, 2);
    ctx.fillRect(Math.floor(c / 3), Math.floor(c), 1, 2);
  }
});

export const glow = (rgb, a = 0.6) => drawn(64, 64, (ctx) => {
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.5, `rgba(${rgb},${a * 0.25})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
});

export const white = () => drawn(1, 1, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); });

// vertical sky gradient, redrawn per frame
export function skyCanvas() {
  const [c, ctx] = canvasOf(1, 96);
  return {
    canvas: c,
    paint(stops) {
      const g = ctx.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, stops[0]); g.addColorStop(0.55, stops[1]); g.addColorStop(1, stops[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1, 96);
    },
  };
}
