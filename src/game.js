import * as THREE from 'three';
import * as S from './sprites.js';

// ---------- tuning ----------
const HUB_X = 0;
const WORLD_HALF = 720;
const WALL_OFF = 124;
const DAY_LEN = 70;          // seconds per sol
const NIGHT_START = 0.55;    // fraction of the sol when night falls
const COST = { bot: 4, miner: 2, guard: 3, wall: [5, 12, 25], repair: 2 };
const WALL_HP = [0, 30, 70, 140];
const HUB_HP = 100;
const PLAYER_SPEED = 100;
const START_SCRAP = 10;
const VIEW_H = 168;          // world pixels tall on screen

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// ---------- animated sprite: base mesh + unlit emissive child ----------
class Sprite {
  constructor(game, set, z) {
    this.game = game;
    this.set = set;               // { walk: {w,h,base:[tex],em:[tex]}, idle: ... }
    this.name = null;
    this.t = 0;
    this.fps = 8;
    this.loop = true;
    const first = Object.values(set)[0];
    const geo = new THREE.PlaneGeometry(first.w, first.h);
    geo.translate(0, first.h / 2, 0);
    this.mat = new THREE.MeshBasicMaterial({ map: first.base[0], transparent: true, depthWrite: false });
    this.emMat = new THREE.MeshBasicMaterial({ map: first.em[0], transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.z = z;
    this.em = new THREE.Mesh(geo, this.emMat);
    this.em.position.z = 0.01;
    this.mesh.add(this.em);
    game.litMaterials.push(this.mat);
    game.scene.add(this.mesh);
    this.play(Object.keys(set)[0]);
  }
  play(name, fps = 8, loop = true) {
    if (this.name === name) return;
    this.name = name; this.fps = fps; this.loop = loop; this.t = 0;
    this.apply();
  }
  apply() {
    const a = this.set[this.name];
    const n = a.base.length;
    let i = Math.floor(Math.max(0, this.t) * this.fps);
    i = this.loop ? ((i % n) + n) % n : Math.min(i, n - 1);
    this.mat.map = a.base[i];
    this.emMat.map = a.em[i];
    if (a.w !== this.mesh.geometry.parameters.width || a.h !== this.mesh.geometry.parameters.height) {
      this.mesh.geometry.dispose();
      const geo = new THREE.PlaneGeometry(a.w, a.h);
      geo.translate(0, a.h / 2, 0);
      this.mesh.geometry = geo; this.em.geometry = geo;
    }
  }
  tick(dt) { this.t += Math.max(0, dt); this.apply(); }
  get frame() { return Math.floor(this.t * this.fps) % this.set[this.name].base.length; }
  set x(v) { this.mesh.position.x = v; }
  set y(v) { this.mesh.position.y = v; }
  set flip(dir) { this.mesh.scale.x = dir; }
  remove() { this.game.scene.remove(this.mesh); }
}

export class Game {
  constructor(canvasEl) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.camera.position.set(0, 58, 100);
    this.litMaterials = [];
    this.keys = new Set();
    this.pressed = new Set();
    this.shake = 0;
    this.ui = {};
    for (const id of ['scrap', 'bots', 'hubfill', 'day', 'phase', 'banner', 'prompt', 'over', 'overtext', 'restart']) {
      this.ui[id] = document.getElementById(id);
    }
    this.ui.restart.addEventListener('click', () => location.reload());
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (k === 'r' && this.over) location.reload();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('resize', () => this.resize());

    this.buildTextures();
    this.buildWorld();
    this.resetState();
    this.resize();
  }

  // ---------- textures ----------
  set(framesObj) {
    const out = {};
    for (const [name, f] of Object.entries(framesObj)) {
      out[name] = { w: f.w, h: f.h, base: f.base.map((c) => S.tex(c)), em: f.em.map((c) => S.tex(c)) };
    }
    return out;
  }
  buildTextures() {
    const T = {};
    T.player = this.set(S.player());
    T.bot = { idle: this.set(S.bot('idle')), miner: this.set(S.bot('miner')), guard: this.set(S.bot('guard')) };
    T.alien = this.set(S.alien(false));
    T.alienBig = this.set(S.alien(true));
    T.crystal = this.set({ shimmer: S.crystal() });
    T.scrap = this.set({ a: S.scrap() });
    T.bullet = this.set({ a: S.bullet() });
    T.rock = this.set({ a: S.rock() });
    T.rockSmall = this.set({ a: S.rockSmall() });
    T.hub = this.set({ a: S.hub() });
    T.fab = this.set({ a: S.fabricator() });
    T.stMiner = this.set({ a: S.stationMiner() });
    T.stGuard = this.set({ a: S.stationGuard() });
    T.stHub = this.set({ a: S.stationHub() });
    const w = S.walls();
    T.walls = this.set({ l0: w[0], l1: w[1], l2: w[2], l3: w[3] });
    T.ground = S.tex(S.ground(), true);
    T.mtFar = S.tex(S.mountains(3, S.PAL.mtFar, S.PAL.mtFarTop, 100, 12), true);
    T.mtMid = S.tex(S.mountains(8, S.PAL.mtMid, S.PAL.mtMidTop, 70, 16), true);
    T.mtNear = S.tex(S.mountains(11, S.PAL.mtNear, S.PAL.mtNearTop, 44, 22), true);
    T.starsA = S.tex(S.stars(99, 70), true);
    T.starsB = S.tex(S.stars(123, 70), true);
    T.sun = S.tex(S.disc(9, '#fff4dc'));
    T.moonA = S.tex(S.disc(9, '#d8cbb8', 'rgba(0,0,0,.25)'));
    T.moonB = S.tex(S.disc(5, '#b0a494', 'rgba(0,0,0,.25)'));
    T.glowWarm = S.tex(S.glow('255,200,110', 0.55));
    T.glowTeal = S.tex(S.glow('82,240,212', 0.5));
    T.glowSun = S.tex(S.glow('255,240,210', 0.9));
    T.white = S.tex(S.white());
    this.sky = S.skyCanvas();
    T.sky = S.tex(this.sky.canvas);
    T.sky.magFilter = THREE.LinearFilter; T.sky.minFilter = THREE.LinearFilter;
    this.T = T;
  }

  // flat mesh (non-animated) anchored bottom-center (or centered)
  flat(texture, z, opts = {}) {
    const w = opts.w ?? texture.image.width;
    const h = opts.h ?? texture.image.height;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, opts.center ? 0 : h / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z;
    if (!opts.unlit) this.litMaterials.push(mat);
    this.scene.add(m);
    return m;
  }

  // ---------- static world ----------
  buildWorld() {
    const T = this.T;
    this.skyMesh = this.flat(T.sky, -40, { w: 1, h: 1, unlit: true, center: true });
    T.starsA.repeat.set(4, 2); T.starsB.repeat.set(4, 2);
    this.starsA = this.flat(T.starsA, -30, { w: 1024, h: 320, unlit: true, center: true });
    this.starsB = this.flat(T.starsB, -30, { w: 1024, h: 320, unlit: true, center: true });
    this.sunGlow = this.flat(T.glowSun, -29, { w: 90, h: 90, unlit: true, additive: true, center: true });
    this.sun = this.flat(T.sun, -28, { unlit: true, center: true });
    this.moonA = this.flat(T.moonA, -28, { unlit: true, center: true });
    this.moonB = this.flat(T.moonB, -28, { unlit: true, center: true });
    for (const t of [T.mtFar, T.mtMid, T.mtNear]) t.repeat.set(4, 1);
    this.mtFar = this.flat(T.mtFar, -12, { w: 2048, h: 120 });
    this.mtMid = this.flat(T.mtMid, -11, { w: 2048, h: 120 });
    this.mtNear = this.flat(T.mtNear, -10, { w: 2048, h: 120 });
    this.haze = this.flat(T.glowWarm, -9.5, { w: 2400, h: 120, unlit: true, additive: true, center: true });
    const gw = WORLD_HALF * 2 + 800, gh = 96;
    T.ground.repeat.set(gw / 96, 1);
    const ground = this.flat(T.ground, -5, { w: gw, h: gh });
    ground.geometry.translate(0, -gh, 0);
    const r = S.rng(42);
    for (let i = 0; i < 40; i++) {
      const small = r() < 0.5;
      const m = new Sprite(this, small ? T.rockSmall : T.rock, small ? -4.4 : -4.6);
      let x = (r() - 0.5) * 2 * WORLD_HALF;
      if (Math.abs(x) < 110) x += 200 * Math.sign(x || 1);
      m.x = x; m.flip = r() < 0.5 ? -1 : 1;
    }
    this.hubSprite = new Sprite(this, T.hub, -3); this.hubSprite.play('a', 3); this.hubSprite.x = HUB_X;
    this.hubGlow = this.flat(T.glowWarm, -3.5, { w: 200, h: 200, unlit: true, additive: true, center: true });
    this.hubGlow.position.set(HUB_X, 24, -3.5);
    this.fab = new Sprite(this, T.fab, -2.5); this.fab.play('a', 4); this.fab.x = HUB_X + 66;
    this.stHub = new Sprite(this, T.stHub, -2.5); this.stHub.play('a', 2); this.stHub.x = HUB_X + 96;
    this.stMiner = new Sprite(this, T.stMiner, -2.5); this.stMiner.play('a', 2); this.stMiner.x = HUB_X - 62;
    this.stGuard = new Sprite(this, T.stGuard, -2.5); this.stGuard.play('a', 2); this.stGuard.x = HUB_X - 86;
    this.props = [this.hubSprite, this.fab, this.stHub, this.stMiner, this.stGuard];
    this.particles = [];
    this.motes = [];
    for (let i = 0; i < 40; i++) {
      const m = this.flat(T.white, -6, { w: 1, h: 1, unlit: true, center: true });
      m.material.color.set('#ffd9a8'); m.material.opacity = 0.5;
      this.motes.push({ mesh: m, x: (Math.random() - 0.5) * 2 * WORLD_HALF, y: Math.random() * 120, s: Math.random() * 6.28 });
    }
  }

  // ---------- dynamic state ----------
  resetState() {
    const T = this.T;
    this.time = DAY_LEN * 0.08; this.day = 1; this.scrap = START_SCRAP; this.hubHp = HUB_HP;
    this.over = false; this.night = false; this.spawnQueue = 0; this.spawnTimer = 0;
    this.bannerTimer = 0; this.elapsed = 0; this.stepT = 0;

    this.player = { x: HUB_X + 30, dir: 1, hurtCd: 0, mineCd: 0, moving: false, spr: new Sprite(this, T.player, 0) };

    this.walls = [-1, 1].map((side) => {
      const w = { side, x: HUB_X + side * WALL_OFF, level: 0, hp: 0, spr: new Sprite(this, T.walls, -2) };
      w.spr.play('l0', 2); w.spr.x = w.x;
      return w;
    });

    this.crystals = [];
    for (const off of [190, 270, 360, 460, 580]) {
      for (const side of [-1, 1]) {
        const c = { x: HUB_X + side * off, amount: 12, max: 12, regen: 0, spr: new Sprite(this, T.crystal, -2.2) };
        c.spr.play('shimmer', 3 + Math.random() * 2); c.spr.x = c.x; c.spr.flip = side;
        c.spr.t = Math.random() * 3;
        c.glow = this.flat(T.glowTeal, -2.3, { w: 70, h: 70, unlit: true, additive: true, center: true });
        c.glow.position.set(c.x, 14, -2.3);
        this.crystals.push(c);
      }
    }

    this.bots = []; this.aliens = []; this.bullets = []; this.chunks = [];
    this.updateHud();
  }

  // ---------- particles ----------
  burst(x, y, n, color, opts = {}) {
    for (let i = 0; i < n; i++) {
      const m = this.flat(this.T.white, 0.6, { w: opts.size ?? 1, h: opts.size ?? 1, unlit: true, center: true });
      m.material.color.set(color);
      const ang = Math.random() * Math.PI * 2, sp = (opts.speed ?? 60) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        mesh: m, x, y, vx: Math.cos(ang) * sp * (opts.spread ?? 1), vy: Math.abs(Math.sin(ang)) * sp + (opts.up ?? 10),
        life: opts.life ?? 0.6, max: opts.life ?? 0.6, grav: opts.grav ?? 160,
      });
    }
  }
  puff(x) { this.burst(x, 1, 2, '#f0b58a', { speed: 14, up: 12, life: 0.4, grav: -10, size: 1 }); }

  // ---------- spawning ----------
  addBot() {
    const b = {
      role: 'idle', x: HUB_X + 66, hp: 4, carry: 0, target: null, mineT: 0, wanderT: 0, wanderX: HUB_X,
      shootCd: 0, post: HUB_X, hidden: false, anim: 'idle', spr: new Sprite(this, this.T.bot.idle, -1),
    };
    b.carryMesh = this.flat(this.T.scrap.a.base[0], -0.9);
    this.scene.remove(b.carryMesh);
    b.carryMesh.position.set(0, 24, 0.02); b.carryMesh.visible = false;
    b.spr.mesh.add(b.carryMesh);
    this.bots.push(b);
    this.burst(b.x, 10, 14, S.PAL.cyan, { speed: 50, life: 0.5 });
    this.assignPosts();
    return b;
  }

  setRole(b, role) {
    b.role = role;
    b.spr.set = this.T.bot[role];
    b.spr.name = null; b.spr.play('idle', 3);
    b.target = null; b.carry = 0; b.carryMesh.visible = false;
    this.burst(b.x, 12, 10, role === 'guard' ? S.PAL.red : S.PAL.gold, { speed: 40, life: 0.5 });
    this.assignPosts();
  }

  assignPosts() {
    const guards = this.bots.filter((b) => b.role === 'guard');
    guards.forEach((g, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const slot = Math.floor(i / 2);
      g.post = HUB_X + side * (WALL_OFF - 18 - slot * 11);
    });
  }

  spawnAlien() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const big = this.day >= 4 && Math.random() < 0.15 + this.day * 0.02;
    const a = {
      side, x: HUB_X + side * (330 + Math.random() * 80),
      hp: big ? 8 + this.day : 2 + Math.floor(this.day / 2),
      speed: (big ? 22 : 30) + this.day * 1.2,
      dmg: big ? 3 : 1, atkCd: 0, state: 'advance', flash: 0, big, lunge: 0,
      spr: new Sprite(this, big ? this.T.alienBig : this.T.alien, -0.5),
    };
    a.spr.play('walk', 10); a.spr.t = Math.random();
    this.aliens.push(a);
  }

  dropScrap(x, n) {
    for (let i = 0; i < n; i++) {
      const spr = new Sprite(this, this.T.scrap, -1.5);
      this.chunks.push({ x, y: 8, vx: (Math.random() - 0.5) * 70, vy: 50 + Math.random() * 60, spr, spin: Math.random() * 6 });
    }
  }

  killAlien(a) {
    a.spr.remove();
    this.aliens.splice(this.aliens.indexOf(a), 1);
    this.burst(a.x, 6, a.big ? 26 : 14, S.PAL.purple, { speed: 70, life: 0.7 });
    this.burst(a.x, 6, 4, S.PAL.green, { speed: 40, life: 0.5 });
    this.dropScrap(a.x, a.big ? 4 : 1 + (Math.random() < 0.35 ? 1 : 0));
    this.shake = Math.max(this.shake, a.big ? 3 : 1);
  }

  killBot(b) {
    b.spr.remove();
    this.bots.splice(this.bots.indexOf(b), 1);
    this.burst(b.x, 8, 16, S.PAL.steel, { speed: 60, life: 0.7 });
    this.dropScrap(b.x, 2);
    this.assignPosts();
  }

  banner(text, secs = 2.5) {
    this.ui.banner.textContent = text;
    this.ui.banner.style.opacity = 1;
    this.bannerTimer = secs;
  }

  // ---------- interactions ----------
  interactables() {
    const list = [];
    const near = (x, r = 20) => Math.abs(this.player.x - x) < r;
    if (near(this.fab.mesh.position.x)) {
      list.push({ label: `[E] Fabricate bot (${COST.bot} scrap)`, cost: COST.bot, act: () => this.addBot() });
    }
    if (near(this.stMiner.mesh.position.x, 14)) {
      const idle = this.bots.find((b) => b.role === 'idle');
      list.push({
        label: idle ? `[E] Miner kit (${COST.miner} scrap)` : 'Miner kit - needs an idle bot',
        cost: idle ? COST.miner : Infinity, act: () => this.setRole(idle, 'miner'),
      });
    }
    if (near(this.stGuard.mesh.position.x, 14)) {
      const idle = this.bots.find((b) => b.role === 'idle');
      list.push({
        label: idle ? `[E] Blaster kit (${COST.guard} scrap)` : 'Blaster kit - needs an idle bot',
        cost: idle ? COST.guard : Infinity, act: () => this.setRole(idle, 'guard'),
      });
    }
    if (near(this.stHub.mesh.position.x, 14)) {
      const full = this.hubHp >= HUB_HP;
      list.push({
        label: full ? 'Hab is fully repaired' : `[E] Repair hab +25 (${COST.repair} scrap)`,
        cost: full ? Infinity : COST.repair,
        act: () => { this.hubHp = Math.min(HUB_HP, this.hubHp + 25); this.burst(HUB_X, 40, 12, S.PAL.cyan, { speed: 50 }); },
      });
    }
    for (const w of this.walls) {
      if (!near(w.x, 22)) continue;
      if (w.level >= 3) {
        if (w.hp < WALL_HP[3]) list.push({ label: `[E] Repair wall (${COST.repair} scrap)`, cost: COST.repair, act: () => { w.hp = Math.min(WALL_HP[3], w.hp + 40); this.burst(w.x, 20, 8, S.PAL.cyan); } });
        else list.push({ label: 'Wall is maxed out', cost: Infinity });
      } else {
        const cost = COST.wall[w.level];
        list.push({ label: `[E] ${w.level === 0 ? 'Build' : 'Upgrade'} wall (${cost} scrap)`, cost, act: () => this.upgradeWall(w) });
      }
    }
    for (const c of this.crystals) {
      if (near(c.x, 18) && c.amount > 0) {
        list.push({ label: '[E] Mine scrap (hold)', cost: 0, hold: true, act: () => this.playerMine(c) });
      }
    }
    return list;
  }

  upgradeWall(w) {
    w.level += 1;
    w.hp = WALL_HP[w.level];
    w.spr.play(`l${w.level}`, 2);
    this.burst(w.x, 10, 18, S.PAL.pebble, { speed: 60, life: 0.6, size: 2 });
    this.shake = 2;
  }

  damageWall(w, dmg) {
    w.hp -= dmg;
    this.burst(w.x, 12, 3, S.PAL.pebble, { speed: 40, life: 0.4 });
    if (w.hp <= 0) {
      w.level = 0; w.hp = 0;
      w.spr.play('l0', 2);
      this.burst(w.x, 10, 30, S.PAL.sandDark, { speed: 90, life: 0.9, size: 2 });
      this.shake = 5;
      this.banner('WALL BREACHED', 1.5);
    }
  }

  playerMine(c) {
    if (this.player.mineCd > 0) return;
    this.player.mineCd = 0.45;
    c.amount -= 1;
    this.burst(c.x, 14, 6, S.PAL.crystalL, { speed: 50, life: 0.5 });
    this.dropScrap(c.x + (Math.random() - 0.5) * 8, 1);
  }

  // ---------- update ----------
  update(dt) {
    if (this.over) return;
    this.elapsed += dt;
    const p = this.player;

    // --- time of day ---
    this.time += dt;
    const wasNight = this.night;
    this.night = this.time / DAY_LEN >= NIGHT_START;
    if (this.night && !wasNight) {
      this.spawnQueue = 1 + Math.floor(this.day * 1.5);
      this.spawnTimer = 1.5;
      this.banner(`NIGHT ${this.day} · ${this.spawnQueue} INCOMING`);
    }
    if (this.time >= DAY_LEN) {
      this.time -= DAY_LEN; this.day += 1; this.night = false;
      this.hubHp = Math.min(HUB_HP, this.hubHp + 10);
      for (const a of this.aliens) a.state = 'flee';
      this.banner(`SOL ${this.day}`);
    }
    if (this.night && this.spawnQueue > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnAlien(); this.spawnQueue -= 1; this.spawnTimer = 1.2 + Math.random() * 1.6; }
    }

    // --- player ---
    let mv = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mv -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mv += 1;
    if (mv !== 0) p.dir = mv;
    p.moving = mv !== 0;
    p.x = clamp(p.x + mv * PLAYER_SPEED * dt, -WORLD_HALF + 10, WORLD_HALF - 10);
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    p.mineCd = Math.max(0, p.mineCd - dt);
    p.spr.play(p.moving ? 'walk' : 'idle', p.moving ? 10 : 2);
    p.spr.tick(dt);
    p.spr.x = p.x; p.spr.flip = p.dir;
    p.spr.y = p.moving && p.spr.frame % 2 === 1 ? 1 : 0;
    if (p.moving) { this.stepT += dt; if (this.stepT > 0.22) { this.stepT = 0; this.puff(p.x - p.dir * 4); } }
    p.spr.mat.opacity = p.hurtCd > 0 && Math.floor(this.elapsed * 20) % 2 ? 0.3 : 1;

    // interaction prompt + action
    const opt = this.interactables()[0];
    if (opt) {
      const afford = this.scrap >= opt.cost;
      this.ui.prompt.textContent = afford || opt.cost === Infinity ? opt.label : `${opt.label} · not enough scrap`;
      this.ui.prompt.style.color = afford ? '#ffe066' : '#ff7a7a';
      const fire = opt.hold ? this.keys.has('e') : this.pressed.has('e');
      if (fire && afford && opt.act) { this.scrap -= opt.cost; opt.act(); }
    } else this.ui.prompt.textContent = '';

    // --- scrap chunks ---
    for (const c of [...this.chunks]) {
      c.vy -= 240 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y <= 0) { c.y = 0; c.vy = Math.abs(c.vy) * 0.35; c.vx *= 0.6; if (c.vy < 8) c.vy = 0; }
      c.spr.x = c.x; c.spr.y = c.y + (c.vy === 0 ? Math.abs(Math.sin(this.elapsed * 3 + c.spin)) * 2 : 0);
      c.spr.flip = c.vy === 0 ? (Math.sin(this.elapsed * 4 + c.spin) > 0 ? 1 : -1) : 1;
      if (c.y < 10 && Math.abs(c.x - p.x) < 12) {
        this.scrap += 1;
        this.burst(c.x, 4, 5, S.PAL.gold, { speed: 30, life: 0.35 });
        c.spr.remove();
        this.chunks.splice(this.chunks.indexOf(c), 1);
      }
    }

    // --- crystals ---
    for (const c of this.crystals) {
      if (c.amount < c.max) { c.regen += dt; if (c.regen > 7) { c.regen = 0; c.amount += 1; } }
      const s = 0.4 + 0.6 * (c.amount / c.max);
      c.spr.mesh.scale.y = s;
      c.spr.tick(dt);
      c.glow.material.opacity = (0.35 + 0.15 * Math.sin(this.elapsed * 2 + c.x)) * s;
      if (Math.random() < dt * 1.5 * s) this.burst(c.x + (Math.random() - 0.5) * 14, 6 + Math.random() * 18, 1, S.PAL.crystalL, { speed: 4, up: 12, life: 1.2, grav: -6 });
    }

    // --- props / walls animate ---
    for (const s of this.props) s.tick(dt);
    for (const w of this.walls) w.spr.tick(dt);

    // --- bots / aliens ---
    for (const b of [...this.bots]) this.updateBot(b, dt);
    for (const a of [...this.aliens]) this.updateAlien(a, dt);

    // --- bullets ---
    for (const bl of [...this.bullets]) {
      bl.x += bl.vx * dt; bl.life -= dt;
      bl.spr.x = bl.x;
      let hit = null;
      for (const a of this.aliens) if (a.state !== 'flee' && Math.abs(a.x - bl.x) < (a.big ? 10 : 7)) { hit = a; break; }
      if (hit) {
        hit.hp -= 1; hit.flash = 0.08;
        this.burst(bl.x, 8, 4, S.PAL.cyan, { speed: 40, life: 0.3 });
        if (hit.hp <= 0) this.killAlien(hit);
      }
      if (hit || bl.life <= 0) { bl.spr.remove(); this.bullets.splice(this.bullets.indexOf(bl), 1); }
    }

    // --- particles ---
    for (const q of [...this.particles]) {
      q.life -= dt; q.vy -= q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.y < 0 && q.grav > 0) { q.y = 0; q.vy *= -0.3; q.vx *= 0.7; }
      q.mesh.position.set(q.x, q.y, 0.6);
      q.mesh.material.opacity = clamp(q.life / q.max * 1.5, 0, 1);
      if (q.life <= 0) { this.scene.remove(q.mesh); this.particles.splice(this.particles.indexOf(q), 1); }
    }
    for (const m of this.motes) {
      m.s += dt;
      m.x += Math.sin(m.s * 0.7) * 6 * dt + 3 * dt; m.y += Math.cos(m.s * 0.5) * 4 * dt;
      if (m.x > WORLD_HALF) m.x = -WORLD_HALF;
      if (m.y < 2) m.y = 100; if (m.y > 120) m.y = 2;
      m.mesh.position.set(m.x, m.y, -6);
      m.mesh.material.opacity = 0.25 + 0.25 * Math.sin(m.s * 2);
    }

    // --- hub death ---
    if (this.hubHp <= 0) {
      this.over = true;
      this.ui.overtext.innerHTML = `The colony lasted ${this.day} sol${this.day === 1 ? '' : 's'}.<br>${this.bots.length} bots were still online.`;
      this.ui.over.style.display = 'flex';
    }

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.ui.banner.style.opacity = 0;
    this.shake = Math.max(0, this.shake - dt * 12);
    this.pressed.clear();
    this.updateHud();
  }

  moveToward(ent, targetX, speed, dt) {
    const d = targetX - ent.x;
    if (Math.abs(d) < 1.5) return true;
    ent.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    ent.spr.flip = Math.sign(d) || 1;
    return false;
  }

  updateBot(b, dt) {
    const speed = 62;
    let anim = 'idle';
    b.hidden = false;

    if (b.role === 'guard') {
      if (!this.moveToward(b, b.post, speed, dt)) anim = 'walk';
      b.shootCd -= dt;
      let best = null, bd = 110;
      for (const a of this.aliens) {
        if (a.state === 'flee') continue;
        const d = Math.abs(a.x - b.x);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) {
        const dir = Math.sign(best.x - b.x) || 1;
        b.spr.flip = dir;
        anim = 'shoot';
        if (b.shootCd <= 0) {
          b.shootCd = 0.7;
          b.spr.t = 0;
          const bl = { x: b.x + dir * 9, vx: dir * 260, life: 0.5, spr: new Sprite(this, this.T.bullet, 0.5) };
          bl.spr.x = bl.x; bl.spr.y = 10; bl.spr.flip = dir;
          this.bullets.push(bl);
          this.burst(bl.x, 11, 3, S.PAL.gold, { speed: 30, life: 0.15, grav: 0 });
        }
      }
    } else if (this.night) {
      const arrived = this.moveToward(b, HUB_X, speed, dt);
      anim = arrived ? 'idle' : 'walk';
      b.hidden = arrived;
    } else if (b.role === 'miner') {
      if (b.carry >= 3) {
        if (this.moveToward(b, HUB_X, speed, dt)) { this.scrap += b.carry; b.carry = 0; this.burst(HUB_X, 20, 6, S.PAL.gold, { speed: 30 }); }
        else anim = 'walk';
      } else {
        if (!b.target || b.target.amount <= 0) {
          b.target = null;
          let bd = Infinity;
          for (const c of this.crystals) {
            if (c.amount <= 0) continue;
            const d = Math.abs(c.x - b.x) + Math.random() * 20;
            if (d < bd) { bd = d; b.target = c; }
          }
        }
        if (b.target) {
          const standX = b.target.x + (b.target.x > HUB_X ? -14 : 14);
          if (this.moveToward(b, standX, speed, dt)) {
            anim = 'mine';
            b.spr.flip = b.target.x > b.x ? 1 : -1;
            b.mineT += dt;
            if (b.mineT >= 1.5) {
              b.mineT = 0; b.target.amount -= 1; b.carry += 1;
              this.burst(b.target.x, 12, 5, S.PAL.crystalL, { speed: 40, life: 0.4 });
            }
          } else anim = 'walk';
        } else if (b.carry > 0) {
          if (this.moveToward(b, HUB_X, speed, dt)) { this.scrap += b.carry; b.carry = 0; }
          else anim = 'walk';
        }
      }
    } else {
      b.wanderT -= dt;
      if (b.wanderT <= 0) { b.wanderT = 2 + Math.random() * 3; b.wanderX = HUB_X + (Math.random() - 0.5) * 120; }
      if (!this.moveToward(b, b.wanderX, 30, dt)) anim = 'walk';
    }

    const fps = { idle: 2, walk: 10, mine: 4, shoot: 6 }[anim];
    if (anim === 'shoot') { b.spr.play('shoot', fps, false); if (b.spr.t > 0.34) b.spr.t = 0.34; }
    else b.spr.play(anim, fps);
    b.spr.tick(dt);
    if (anim === 'walk' && b.spr.frame % 2 === 1 && Math.random() < 0.3) this.puff(b.x);
    b.carryMesh.visible = b.carry > 0;
    b.spr.mesh.visible = !b.hidden;
    b.spr.x = b.x;
    b.spr.y = anim === 'walk' && b.spr.frame % 2 === 1 ? 1 : 0;
  }

  updateAlien(a, dt) {
    a.flash = Math.max(0, a.flash - dt);
    a.atkCd -= dt;
    const toHub = -a.side;
    let target = null;

    if (a.state === 'flee') {
      a.x += a.side * a.speed * 1.8 * dt;
      a.spr.flip = a.side;
      if (Math.abs(a.x) > WORLD_HALF + 40) {
        a.spr.remove();
        this.aliens.splice(this.aliens.indexOf(a), 1);
        return;
      }
    } else {
      a.spr.flip = toHub;
      const wall = this.walls[a.side === -1 ? 0 : 1];
      const passedWall = a.side === -1 ? a.x > wall.x : a.x < wall.x;
      const reach = a.big ? 16 : 12;
      if (wall.level > 0 && !passedWall && Math.abs(a.x - wall.x) < reach + 2) target = { kind: 'wall', w: wall };
      else {
        for (const b of this.bots) if (!b.hidden && Math.abs(b.x - a.x) < reach) { target = { kind: 'bot', b }; break; }
        if (!target && Math.abs(a.x - HUB_X) < 36) target = { kind: 'hub' };
      }
      const p = this.player;
      if (p.hurtCd <= 0 && Math.abs(p.x - a.x) < reach) {
        p.hurtCd = 2;
        p.x = clamp(p.x + toHub * 30, -WORLD_HALF + 10, WORLD_HALF - 10);
        const lost = Math.min(this.scrap, 3);
        this.scrap -= lost;
        this.dropScrap(p.x, lost);
        this.burst(p.x, 12, 8, S.PAL.red, { speed: 50 });
        this.shake = 3;
      }
      if (target) {
        if (a.atkCd <= 0) {
          a.atkCd = 1;
          a.lunge = 0.2;
          if (target.kind === 'wall') this.damageWall(target.w, a.dmg);
          else if (target.kind === 'hub') { this.hubHp -= a.dmg * 2; this.shake = Math.max(this.shake, 2); this.burst(a.x + toHub * 8, 14, 5, S.PAL.orange, { speed: 40 }); }
          else { target.b.hp -= a.dmg; this.burst(target.b.x, 10, 4, S.PAL.steel); if (target.b.hp <= 0) this.killBot(target.b); }
        }
      } else a.x += toHub * a.speed * dt;
    }

    a.lunge = Math.max(0, a.lunge - dt);
    a.spr.tick(dt * (target ? 1.8 : 1));
    a.spr.x = a.x + (a.lunge > 0 ? toHub * 4 : 0);
    a.spr.y = target ? Math.abs(Math.sin(this.elapsed * 22)) * 2 : 0;
  }

  // ---------- render ----------
  updateHud() {
    this.ui.scrap.textContent = this.scrap;
    this.ui.bots.textContent = this.bots.length;
    this.ui.hubfill.style.width = `${clamp(this.hubHp / HUB_HP, 0, 1) * 100}%`;
    this.ui.hubfill.style.background = this.hubHp > 40 ? '#5ff5ff' : '#ff5a5a';
    this.ui.day.textContent = this.day;
    const f = this.time / DAY_LEN;
    const hostiles = this.aliens.filter((a) => a.state !== 'flee').length;
    this.ui.phase.textContent = this.night ? (hostiles ? `NIGHT · ${hostiles} HOSTILE${hostiles === 1 ? '' : 'S'}` : 'NIGHT')
      : f > NIGHT_START - 0.12 ? 'DUSK' : 'DAY';
    this.ui.phase.style.color = this.night ? '#ff7a7a' : '#fff';
  }

  resize() {
    const scale = Math.max(3, Math.round(window.innerHeight / VIEW_H));
    const w = Math.ceil(window.innerWidth / scale), h = Math.ceil(window.innerHeight / scale);
    this.renderer.setSize(w, h, false);
    this.viewW = w; this.viewH = h;
    this.camera.left = -w / 2; this.camera.right = w / 2;
    this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
    this.skyMesh.scale.set(w + 2, h + 2, 1);
  }

  nightness() {
    const f = this.time / DAY_LEN;
    if (f < 0.08) return 1 - f / 0.08;
    if (f < NIGHT_START - 0.12) return 0;
    if (f < NIGHT_START) return (f - (NIGHT_START - 0.12)) / 0.12;
    return 1;
  }

  render() {
    const half = this.viewW / 2;
    const cx = clamp(this.player.x, -WORLD_HALF + half, WORLD_HALF - half);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    const camY = 58;
    this.camera.position.x = cx + sx; this.camera.position.y = camY + sy;
    const camTop = camY + this.viewH / 2;

    // sky gradient
    const n = this.nightness();
    const dusk = n < 0.5 ? n * 2 : 1 - (n - 0.5) * 2;
    const stops = [0, 1, 2].map((i) => {
      const dn = lerpColor(S.PAL.skyDay[i], S.PAL.skyNight[i], n);
      return '#' + dn.lerp(new THREE.Color(S.PAL.skyDusk[i]), dusk * 0.85).getHexString();
    });
    this.sky.paint(stops);
    this.T.sky.needsUpdate = true;
    this.skyMesh.position.set(cx, camY, -40);

    // lighting tint
    const light = lerp(1, 0.42, n);
    const tint = new THREE.Color(light, light * 0.9 + 0.02 * (1 - n), light * 1.15 - 0.05 * (1 - n));
    for (const m of this.litMaterials) m.color.copy(tint);
    for (const a of this.aliens) if (a.flash > 0) a.spr.mat.color.setScalar(4);
    this.hubGlow.material.opacity = 0.55 * n;
    this.haze.material.opacity = 0.35 * (1 - n) + 0.25 * dusk;
    this.haze.position.set(cx * 0.9, 30, -9.5);

    // parallax
    this.mtFar.position.x = cx * 0.9; this.mtFar.position.y = 6;
    this.mtMid.position.x = cx * 0.78; this.mtMid.position.y = 0;
    this.mtNear.position.x = cx * 0.62; this.mtNear.position.y = -8;

    // sky objects
    const tw = Math.sin(this.elapsed * 2);
    this.starsA.position.set(cx * 0.97, camTop - 40, -30); this.starsB.position.copy(this.starsA.position);
    this.starsA.material.opacity = n * (0.7 + 0.3 * tw);
    this.starsB.material.opacity = n * (0.7 - 0.3 * tw);
    const f = this.time / DAY_LEN;
    const sunArc = clamp(f / NIGHT_START, 0, 1);
    const sunX = cx + (sunArc - 0.5) * this.viewW * 0.9, sunY = camTop - 30 - Math.abs(sunArc - 0.5) * 2 * 60;
    this.sun.position.set(sunX, sunY, -28); this.sunGlow.position.set(sunX, sunY, -29);
    this.sun.material.opacity = 1 - n; this.sunGlow.material.opacity = (1 - n) * 0.9;
    this.moonA.position.set(cx + 60, camTop - 28, -28);
    this.moonB.position.set(cx - 90, camTop - 48, -28);
    this.moonA.material.opacity = 0.2 + n * 0.8; this.moonB.material.opacity = 0.2 + n * 0.8;

    this.renderer.render(this.scene, this.camera);
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
