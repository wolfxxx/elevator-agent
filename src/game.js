import * as THREE from 'three';
import { SLAB, FH, HALF_W, SHAFT_W, SHAFT_IN, CAR_ROOF, CAR_SPEED_AI, CAR_SPEED_PLAYER, LAMP_Y, GRAVITY, LANE_Z, SCORE, CAMERA_FOV, NUM_FLOORS } from './config.js';
import { generateLevel, GARAGE_CAR_X } from './level.js';
import { World, Environment } from './world.js';
import { Player, INTRO } from './player.js';
import { Enemy } from './enemy.js';
import { FX, BulletPool } from './fx.js';
import { audio } from './audio.js';
import { clamp, damp, rr, randInt, lerp } from './util.js';
import { glowSprite } from './textures.js';

const MOTES_PER = 16;
const SPLASH = new THREE.Color(0.5, 0.6, 0.8);
const SPARK = new THREE.Color(4, 2.2, 0.6);
const _hand = new THREE.Vector3(), _hp = new THREE.Vector3(), _hp2 = new THREE.Vector3(), _up15 = new THREE.Vector3(0, 0.15, 0);

const SPOT_POOL = 12;
const CAR_LIGHTS = 3;
const SHADOW_SPOTS = 4;

export class Game {
  constructor({ scene, camera, input, hud }) {
    this.scene = scene; this.camera = camera; this.input = input; this.hud = hud;
    this.fx = new FX(scene);
    this.bulletPool = new BulletPool(scene);
    this.env = new Environment(scene);
    this.enemies = []; this.bullets = [];
    this.time = 0; this.state = 'title'; this.stateT = 0;
    this.score = 0; this.lives = 3; this.levelNum = 1; this.nextLife = 10000;
    try { this.hiscore = +localStorage.getItem('ea_hiscore') || 20000; } catch { this.hiscore = 20000; }
    this.camPos = new THREE.Vector3(0, 0, 28);
    this.camLook = new THREE.Vector3();
    this.thunderT = rr(8, 16);

    // lighting rig
    this.hemi = new THREE.HemisphereLight(0x4a5888, 0x231a14, 0.2);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0.12); this.moon.position.set(-30, 60, -40);
    scene.add(this.moon);
    this.fill = new THREE.DirectionalLight(0xffe0c0, 0.12); this.fill.position.set(10, 20, 40);
    scene.add(this.fill);
    this.spots = [];
    for (let i = 0; i < SPOT_POOL; i++) {
      const s = new THREE.SpotLight(0xffd29a, 0, 11, 1.0, 0.6, 0.7);
      if (i < SHADOW_SPOTS) {
        s.castShadow = true;
        s.shadow.mapSize.set(768, 768);
        s.shadow.bias = -0.0006; s.shadow.normalBias = 0.035;
        s.shadow.camera.near = 0.25; s.shadow.camera.far = 11;
        s.shadow.radius = 3;
      }
      scene.add(s, s.target);
      this.spots.push(s);
    }
    // soft key light on the player so the agent always reads, even in the dark
    this.keyLight = new THREE.PointLight(0xb8c8ff, 2.2, 4.5, 1.6);
    scene.add(this.keyLight);
    this.carLights = [];
    for (let i = 0; i < CAR_LIGHTS; i++) { const l = new THREE.PointLight(0xfff1d6, 0, 4.5, 1.5); scene.add(l); this.carLights.push(l); }

    // dust motes floating inside the active lamp cones
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPOT_POOL * MOTES_PER * 3), 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.06, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.3, 0.9), toneMapped: false }));
    this.motes.frustumCulled = false;
    this.moteSeeds = Array.from({ length: SPOT_POOL * MOTES_PER }, () => [Math.random(), Math.random() * Math.PI * 2, Math.random(), 0.3 + Math.random()]);
    scene.add(this.motes);

    this.player = null;
    this.loadLevel(1);
    this.player.placeAt(this.level.N, -6);
    this.player.rig.root.visible = false;
    this.titleMode();
  }

  // ---------- state ----------
  titleMode() {
    this.state = 'title'; this.stateT = 0;
    this.hud.showTitle(this.hiscore);
    audio.playMusic('music_title');
  }

  newGame() {
    this.score = 0; this.lives = 3; this.nextLife = 10000;
    this.hud.hideTitle();
    audio.play('ui_start');
    this.startLevel(1);
  }

  startLevel(n) {
    this.loadLevel(n);
    this.player.startIntro();
    this.world.ropeSettled = false;
    this.camPos.set(-25.8, this.player.y + 1.1, this.viewDistance() * 0.74);
    this.state = 'intro'; this.stateT = 0;
    audio.playMusic('music_game', { vol: 0.9 });
    if (n === 1) setTimeout(() => audio.play('vo_briefing', { vol: 1 }), 900);
  }

  loadLevel(n) {
    if (this.world) this.world.dispose();
    for (const e of this.enemies) e.dispose();
    for (const b of this.bullets) this.bulletPool.release(b.mesh);
    this.enemies = []; this.bullets = [];
    this.levelNum = n;
    this.level = generateLevel(n);
    this.world = new World(this.scene, this.level);
    for (const s of this.level.shafts) {
      Object.assign(s, { carY: randInt(Math.random, s.minF, s.maxF) * FH, stopped: true, wait: rr(0.5, 3), dir: Math.random() < 0.5 ? 1 : -1, target: null, ctrl: 0, ctrlPlayer: false, riders: 0, wasMoving: false });
    }
    this.byFloor = [];
    for (let f = 0; f <= this.level.N; f++) this.byFloor[f] = this.level.shafts.filter(s => f >= s.minF && f <= s.maxF);
    this.lamps = this.level.lamps.map(l => ({ ...l, state: 'on', y: l.f * FH + LAMP_Y, vy: 0, rot: 0, flicker: 0 }));
    this.lampsByFloor = [];
    for (const l of this.lamps) (this.lampsByFloor[l.f] ||= []).push(l);
    for (const d of this.level.doors) { d.busy = false; d.collected = false; }
    this.docsTotal = this.level.doors.filter(d => d.red).length;
    this.docs = 0;
    this.spawnT = 3;
    this.deathT = -1; this.warpT = -1; this.exitT = -1;
    this.blackout = 0;
    if (!this.player) this.player = new Player(this);
    this.player.reset();
    this.hud.setLevel(this.level);
  }

  // ---------- queries used by entities ----------
  shaftsOn(f) { return this.byFloor[f] || []; }
  isAligned(s, f) { return s.stopped && Math.abs(s.carY - f * FH) < 0.01; }
  alignedFloor(s) { return s.stopped ? Math.round(s.carY / FH) : -1; }
  carBlocks(s, f, yb, h) {
    if (this.isAligned(s, f)) return false;
    return s.carY - 0.25 < yb + h && s.carY + CAR_ROOF > yb;
  }
  floorDark(f) {
    if (this.blackout > 0) return true;
    const ls = this.lampsByFloor[f];
    return !!ls && ls.every(l => l.state !== 'on');
  }
  doorNear(f, x, r) { return this.level.doors.find(d => d.f === f && Math.abs(d.x - x) < r); }
  playerBulletCount() { return this.bullets.reduce((n, b) => n + (b.owner === 'player' ? 1 : 0), 0); }

  sfx(name, x, y, vol = 1) {
    const dx = x - this.camera.position.x, dy = y - (this.camera.position.y - 1);
    const fall = Math.max(0, 1 - Math.max(0, Math.abs(dy) - 6) / 14);
    audio.play(name, { vol: vol * fall, pan: clamp(dx / 22, -0.9, 0.9) });
  }

  addScore(n, x, y) {
    this.score += n;
    if (x !== undefined) this.hud.popup(`${n}`, new THREE.Vector3(x, y + 2.3, LANE_Z), this.camera);
    if (this.score >= this.nextLife) {
      this.lives++; this.nextLife += 20000;
      audio.play('extra_life'); this.hud.flashMessage('1UP');
    }
    if (this.score > this.hiscore) this.hiscore = this.score;
  }

  spawnBullet({ x, y, vx, owner }) {
    const p = this.player;
    let origin = null;
    const shooter = owner === 'player' ? p : null;
    if (shooter && shooter.mode === 'car') origin = shooter.car;
    if (!shooter) for (const s of this.level.shafts) if (Math.abs(x - vx * 0.025 - s.x) < SHAFT_W / 2) origin = s;
    const mesh = this.bulletPool.get(owner === 'enemy');
    this.bullets.push({ x, y, vx, owner, mesh, life: 1.6, origin });
  }

  // ---------- events ----------
  onLanded() {
    this.state = 'play';
    this.hud.banner(`MISSION ${this.levelNum}`, `${this.docsTotal} SECRET DOCUMENTS · MERIDIAN TOWER`, 3.2);
    audio.play('vo_ready', { vol: 0.8 });
  }

  onDocument(d) {
    this.docs++;
    this.addScore(SCORE.doc, d.x, d.f * FH);
    audio.play('doc_pickup', { vol: 1 });
    this.hud.flashMessage(this.docs === this.docsTotal ? 'ALL DOCUMENTS SECURED — GET TO THE GARAGE' : `DOCUMENT ${this.docs}/${this.docsTotal}`);
  }

  onEnemyKilled(e, how) {
    const pts = how === 'kick' ? SCORE.kick : how === 'lamp' ? SCORE.lampCrush : how === 'crush' ? SCORE.crush : SCORE.shot;
    this.addScore(pts, e.x, e.y);
    this.sfx(how === 'crush' ? 'crush' : how === 'kick' ? 'kick' : 'enemy_die', e.x, e.y, 0.9);
    if (how === 'crush' || how === 'kick') this.sfx('enemy_die', e.x, e.y, 0.6);
    this.fx.burst(e.x, e.y + 1.2, LANE_Z, how === 'crush' ? 22 : 10, { color: new THREE.Color(0.6, 0.05, 0.05), speed: 4, life: 0.6, size: 0.09, gravity: 14, floor: e.y, angle: Math.PI / 2, spread: 1.3 });
    if (how === 'crush' || how === 'lamp') this.fx.shake = 0.35;
  }

  onPlayerDeath(how) {
    this.deathT = 0;
    this.sfx(how === 'crush' ? 'crush' : 'player_die', this.player.x, this.player.y, 1);
    if (how === 'crush') this.sfx('player_die', this.player.x, this.player.y, 0.8);
    this.fx.shake = 0.5;
    this.fx.burst(this.player.x, this.player.y + 1.2, LANE_Z, 18, { color: new THREE.Color(0.7, 0.05, 0.05), speed: 4, life: 0.8, size: 0.1, gravity: 14, floor: this.player.y });
    setTimeout(() => audio.play('vo_agentdown', { vol: 0.9 }), 700);
    audio.duckMusic(0.4);
  }

  // ---------- main update ----------
  update(dt) {
    const inp = this.input;
    inp.update();
    this.time += dt; this.stateT += dt;
    if (inp.pressed('mute')) this.hud.flashMessage(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON');

    switch (this.state) {
      case 'title':
        if (inp.pressed('start') || inp.pressed('fire') || inp.pressed('jump')) { audio.init().then(() => this.newGame()); }
        this.updateTitleCamera(dt);
        break;
      case 'intro':
      case 'play':
        if (inp.pressed('pause')) { this.state = 'paused'; this.hud.pause(true); audio.duckMusic(0.25); break; }
        this.updatePlay(dt);
        break;
      case 'paused':
        if (inp.pressed('pause') || inp.pressed('start')) { this.state = 'play'; this.hud.pause(false); audio.duckMusic(1); }
        return this.renderStep(0);
      case 'exiting':
        this.updateExit(dt);
        this.updateElevators(dt);
        break;
      case 'clear':
        if (this.stateT > 6.5 || (this.stateT > 2 && inp.pressed('start'))) { this.hud.hideClear(); this.startLevel(this.levelNum + 1); }
        break;
      case 'gameover':
        this.updateElevators(dt);
        for (const e of this.enemies) e.update(dt);
        if (this.stateT > 2.5 && (inp.pressed('start') || inp.pressed('fire'))) { this.hud.hideGameOver(); this.loadLevel(1); this.player.placeAt(this.level.N, -6); this.player.rig.root.visible = false; this.titleMode(); }
        if (this.stateT > 30) { this.hud.hideGameOver(); this.titleMode(); }
        break;
    }
    this.renderStep(dt);
  }

  renderStep(dt) {
    this.world.update(dt, this.time, this);
    this.updateLampVisuals();
    this.player.sync(dt);
    this.updateRope();
    for (const e of this.enemies) e.sync(dt);
    for (const b of this.bullets) { b.mesh.position.set(b.x - Math.sign(b.vx) * 0.2, b.y, LANE_Z); }
    this.fx.update(dt);
    if (this.state !== 'title') this.updateCamera(dt);
    this.env.update(dt, this.camera, this.level.N * FH);
    this.updateLights(dt);
    this.updateAmbience(dt);
    if (dt > 0) this.updateSplashes();
    this.hud.update(this);
  }

  updatePlay(dt) {
    const p = this.player;
    if (this.state === 'intro' && !['intro', 'zip', 'drop'].includes(p.mode)) this.state = 'play';
    this.blackout = Math.max(0, this.blackout - dt);
    this.updateElevators(dt);
    p.update(dt, this.input);
    for (const e of this.enemies) e.update(dt);
    this.updateBullets(dt);
    this.updateLamps(dt);
    this.collisions();
    p.ceilingCheck();
    this.updateSpawns(dt);
    this.enemies = this.enemies.filter(e => { if (e.gone) { if (e.mode === 'emerge') { e.door.busy = false; this.world.setDoorState(e.door.id, 'closed'); } e.dispose(); } return !e.gone; });

    // death & respawn
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (this.deathT > 2.8) {
        this.deathT = -1;
        this.lives--;
        if (this.lives < 0) return this.gameOver();
        this.respawn();
      }
    }
    // arriving at the garage
    if (p.mode === 'floor' && p.f === 0 && this.warpT < 0 && this.exitT < 0 && p.alive) {
      const left = this.level.doors.filter(d => d.red && !d.collected);
      if (left.length === 0) { if (Math.abs(p.x - GARAGE_CAR_X) < 2.4) this.startExit(); }
      else this.startWarp(left);
    }
    if (this.warpT >= 0) this.updateWarp(dt);

    // weather
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rr(16, 38);
      this.env.flash = 1; this.lightning = 0.35;
      setTimeout(() => audio.play('thunder', { vol: 0.7 }), 500);
    }
  }

  // ---------- elevators ----------
  updateElevators(dt) {
    const p = this.player;
    for (const s of this.level.shafts) {
      const prevY = s.carY;
      if (s.ctrlPlayer) {
        if (s.stopped) {
          if (s.ctrl) {
            const t = Math.round(s.carY / FH) + s.ctrl;
            if (t >= s.minF && t <= s.maxF) { s.stopped = false; s.target = t; s.dir = s.ctrl; }
          }
        } else {
          if (s.ctrl && s.ctrl === -s.dir) { s.dir = s.ctrl; s.target += s.dir; }
          if (this.moveCar(s, CAR_SPEED_PLAYER, dt)) {
            const nt = s.target + s.dir;
            if (s.ctrl === s.dir && nt >= s.minF && nt <= s.maxF) s.target = nt;
            else { s.stopped = true; this.sfx('ding', s.x, s.carY, 0.5); }
          }
        }
      } else {
        if (s.stopped) {
          s.wait -= dt;
          if (s.wait <= 0) {
            const cur = Math.round(s.carY / FH);
            let t;
            const pf = p.mode === 'floor' ? p.f : -1;
            const waiting = pf >= s.minF && pf <= s.maxF && pf !== cur && Math.abs(p.x - s.x) < 6;
            if (waiting && Math.random() < 0.7) t = pf;
            else {
              const step = randInt(Math.random, 1, 3);
              t = cur + s.dir * step;
              if (t > s.maxF || t < s.minF) { s.dir *= -1; t = cur + s.dir * step; }
              t = clamp(t, s.minF, s.maxF);
            }
            if (t === cur) s.wait = 1;
            else { s.target = t; s.stopped = false; s.dir = Math.sign(t - cur); }
          }
        } else if (this.moveCar(s, CAR_SPEED_AI, dt)) {
          s.stopped = true; s.wait = rr(1.4, 3.0);
          this.sfx('ding', s.x, s.carY, 0.35);
        }
      }
      s.vel = (s.carY - prevY) / Math.max(dt, 1e-4);
    }
  }
  moveCar(s, speed, dt) {
    const ty = s.target * FH, d = ty - s.carY, step = speed * dt;
    if (Math.abs(d) <= step) { s.carY = ty; return true; }
    s.carY += Math.sign(d) * step;
    return false;
  }

  // ---------- bullets ----------
  updateBullets(dt) {
    const p = this.player;
    const keep = [];
    for (const b of this.bullets) {
      const x0 = b.x;
      b.x += b.vx * dt; b.life -= dt;
      const lo = Math.min(x0, b.x) - 0.3, hi = Math.max(x0, b.x) + 0.3;
      let dead = b.life <= 0;
      if (Math.abs(b.x) > HALF_W) {
        dead = true;
        this.fx.burst(Math.sign(b.x) * HALF_W, b.y, LANE_Z, 6, { color: new THREE.Color(3, 2, 0.6), speed: 5, life: 0.3, size: 0.04, angle: b.vx > 0 ? Math.PI : 0, spread: 0.9 });
      }
      // elevator cars between floors stop bullets
      if (!dead) for (const s of this.level.shafts) {
        if (s === b.origin || hi < s.x - SHAFT_W / 2 || lo > s.x + SHAFT_W / 2) continue;
        if (b.y > s.carY - 0.25 && b.y < s.carY + CAR_ROOF) {
          const lvl = Math.floor(b.y / FH);
          if (s.stopped && Math.abs(s.carY - lvl * FH) < 0.01) continue;
          dead = true;
          this.fx.burst(b.vx > 0 ? s.x - SHAFT_W / 2 : s.x + SHAFT_W / 2, b.y, LANE_Z, 8, { color: new THREE.Color(3, 2.4, 1), speed: 6, life: 0.3, size: 0.04, angle: b.vx > 0 ? Math.PI : 0, spread: 1 });
          this.sfx('ricochet', s.x, b.y, 0.5);
          break;
        }
      }
      if (!dead && b.owner === 'player') {
        for (const e of this.enemies) {
          if (!e.hittable || e.x < lo || e.x > hi) continue;
          const yb = e.y + e.jumpH;
          if (b.y >= yb && b.y <= yb + e.h) { e.kill('shot', Math.sign(b.vx)); dead = true; break; }
        }
        if (!dead) for (const l of this.lamps) {
          if (l.state !== 'on' || l.x < lo - 0.15 || l.x > hi + 0.15) continue;
          const by = b.y - l.f * FH;
          if (by >= 2.45 && by <= 3.75) { this.shootLamp(l); dead = true; break; }
        }
      } else if (!dead && b.owner === 'enemy' && p.targetable && p.x >= lo && p.x <= hi) {
        const yb = p.y + p.jumpH;
        if (b.y >= yb && b.y <= yb + p.h) { p.die('shot'); dead = true; }
      }
      if (dead) this.bulletPool.release(b.mesh); else keep.push(b);
    }
    this.bullets = keep;
  }

  // ---------- lamps ----------
  shootLamp(l) {
    l.state = 'falling'; l.vy = 0;
    this.world.lampFell(l.id);
    this.sfx('lamp_break', l.x, l.y, 0.9);
    this.fx.burst(l.x, l.y, -1.6, 20, { color: new THREE.Color(1.6, 1.8, 2.2), speed: 5, life: 0.9, size: 0.07, gravity: 18, floor: l.f * FH + 0.03, bounce: 0.25 });
    this.fx.flashAt(l.x, l.y - 0.3, -1.2, 0xbfd8ff, 40, 0.12);
    this.addScore(SCORE.lamp, l.x, l.f * FH + 1);
    for (const o of this.lampsByFloor[l.f]) if (o !== l) o.flicker = 0.6;
  }
  updateLamps(dt) {
    const cy = this.camera.position.y;
    for (const l of this.lamps) {
      l.flicker = Math.max(0, l.flicker - dt);
      if (l.state !== 'on' && Math.abs(l.f * FH - cy) < 10) {
        l.sparkT = (l.sparkT ?? rr(0.3, 1.5)) - dt;
        if (l.sparkT <= 0) {
          l.sparkT = rr(1.2, 4.5);
          const y = (l.f + 1) * FH - SLAB - 0.05;
          this.fx.burst(l.x, y, -1.6, 10, { color: SPARK, speed: 3, angle: -Math.PI / 2, spread: 1.2, life: 0.7, size: 0.035, gravity: 16, floor: l.f * FH + 0.02, bounce: 0.35, stretch: 2.5 });
          this.fx.flashAt(l.x, y - 0.3, -1.4, 0xffa040, 10, 0.08);
        }
      }
      if (l.state !== 'falling') continue;
      l.vy -= GRAVITY * dt; l.y += l.vy * dt; l.rot += dt * 4;
      const floorY = l.f * FH, bottom = l.y - 0.35;
      for (const e of this.enemies) {
        if (!e.alive || e.mode === 'emerge' || Math.abs(e.y - floorY) > 0.1 || Math.abs(e.x - l.x) > 0.9) continue;
        if (bottom < e.y + e.h) e.kill('lamp');
      }
      const p = this.player;
      if (p.targetable && Math.abs(p.y - floorY) < 0.1 && Math.abs(p.x - l.x) < 0.8 && bottom < p.y + p.jumpH + p.h && bottom > p.y + p.jumpH) p.die('lamp');
      if (bottom <= floorY) {
        l.y = floorY + 0.35; l.state = 'broken'; l.rot = 1.3;
        this.sfx('lamp_crash', l.x, l.y, 0.9);
        this.fx.burst(l.x, floorY + 0.1, -1.6, 16, { color: new THREE.Color(3, 2, 0.6), speed: 4, life: 0.5, size: 0.05, gravity: 10, floor: floorY + 0.02 });
        this.fx.shake = Math.max(this.fx.shake, 0.15);
      }
      this.world.setLampY(l.id, l.y, l.rot);
    }
  }
  updateLampVisuals() {
    for (const l of this.lamps) if (l.state === 'broken') this.world.setLampY(l.id, l.y, l.rot);
  }

  // ---------- collisions: kicks & crushes ----------
  collisions() {
    const p = this.player;
    if (p.alive && p.kicking && p.jumpH > 0.15) {
      for (const e of this.enemies) {
        if (!e.hittable || Math.abs(e.y - p.y) > 0.7) continue;
        const dx = e.x - p.x;
        if (Math.abs(dx) < 1.05 && (Math.sign(dx) === p.facing || Math.abs(dx) < 0.45)) e.kill('kick', p.facing);
      }
    }
    for (const e of this.enemies) if (e.alive && e.mode === 'floor' && this.crushed(e, e.f)) e.kill('crush');
    if (p.alive && p.mode === 'floor' && this.crushed(p, p.f)) p.die('crush');
    if (p.alive && p.mode === 'fall') {
      const s = p.car, yb = p.y;
      if (s.carY > yb + 0.05 && s.carY - 0.25 < yb + p.h) p.die('crush');
    }
  }
  crushed(ent, f) {
    for (const s of this.shaftsOn(f)) {
      if (Math.abs(ent.x - s.x) >= SHAFT_IN) continue;
      const yb = ent.y + (ent.jumpH || 0);
      if (s.carY > yb + 0.05 && s.carY - 0.25 < yb + ent.h) return true;
    }
    return false;
  }

  // ---------- enemy spawning ----------
  updateSpawns(dt) {
    const p = this.player;
    if (this.state !== 'play' || !p.alive || this.deathT >= 0 || this.warpT >= 0) return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const L = this.levelNum;
    this.spawnT = rr(1.0, 2.4) * Math.max(0.45, 1 - L * 0.06);
    const maxE = Math.min(7, 2 + L);
    if (this.enemies.filter(e => e.alive).length >= maxE) return;
    const pf = p.floorIndex;
    const cands = this.level.doors.filter(d => !d.red && !d.busy && Math.abs(d.f - pf) <= 1 && d.f < this.level.N &&
      Math.abs(d.x - p.x) > 3.5 && Math.abs(d.x - p.x) < 24 && !(p.mode === 'floor' && d.f === 0 && pf !== 0));
    if (!cands.length) return;
    const same = cands.filter(d => d.f === pf);
    const pool = same.length && Math.random() < 0.65 ? same : cands;
    const d = pool[Math.floor(Math.random() * pool.length)];
    d.busy = true;
    this.enemies.push(new Enemy(this, d, L >= 2 && Math.random() < 0.08 + L * 0.03));
  }

  // ---------- respawn, warp, exit ----------
  respawn() {
    const p = this.player;
    for (const e of this.enemies) e.dispose();
    for (const b of this.bullets) this.bulletPool.release(b.mesh);
    this.enemies = []; this.bullets = [];
    for (const d of this.level.doors) { d.busy = false; if (!d.collected || !d.red) this.world.setDoorState(d.id, 'closed'); }
    const f = clamp(Math.round((p.mode === 'floor' ? p.f * FH : p.y) / FH + (p.mode === 'floor' ? 0 : 0.4)), 0, this.level.N);
    let x = clamp(p.x, -HALF_W + 1, HALF_W - 1);
    for (const s of this.shaftsOn(f)) if (Math.abs(x - s.x) < SHAFT_W / 2 + 0.6) x = s.x + (x >= s.x ? 1 : -1) * (SHAFT_W / 2 + 0.8);
    x = clamp(x, -HALF_W + 1, HALF_W - 1);
    for (const s of this.shaftsOn(f)) if (Math.abs(x - s.x) < SHAFT_W / 2 + 0.6) x = s.x - Math.sign(x) * (SHAFT_W / 2 + 0.8);
    p.placeAt(f, x);
    this.spawnT = 2.5;
    audio.duckMusic(1);
  }

  startWarp(left) {
    this.warpT = 0;
    this.warpDoor = left.reduce((a, b) => (b.f < a.f ? b : a));
    this.player.mode = 'warp'; this.player.moving = false;
    audio.play('alarm', { vol: 0.6 });
    setTimeout(() => audio.play('vo_missed'), 400);
    this.hud.flashMessage(`${left.length} DOCUMENT${left.length > 1 ? 'S' : ''} MISSING — RETURNING TO FLOOR ${this.warpDoor.f}`, 2.6);
  }
  updateWarp(dt) {
    const prev = this.warpT; this.warpT += dt;
    if (prev < 1.6 && this.warpT >= 1.6) this.hud.fade(1);
    if (prev < 2.3 && this.warpT >= 2.3) {
      for (const e of this.enemies) e.dispose();
      this.enemies = [];
      this.player.placeAt(this.warpDoor.f, this.warpDoor.x);
      this.camPos.y = this.player.y + 2; this.hud.fade(0);
    }
    if (this.warpT > 2.6) this.warpT = -1;
  }

  startExit() {
    const p = this.player;
    this.state = 'exiting'; this.exitT = 0; this.stateT = 0;
    p.mode = 'exit'; p.hidden = true;
    audio.stopMusic(1);
    audio.play('car_escape', { vol: 1 });
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const b of this.bullets) this.bulletPool.release(b.mesh);
    this.bullets = [];
  }
  updateExit(dt) {
    this.exitT += dt;
    const w = this.world, t = this.exitT;
    if (w.garageDoor) w.garageDoor.position.y = clamp(1.6 + (t - 0.3) * 3, 1.6, 4.8);
    if (w.headlight) w.headlight.intensity = 60;
    if (w.getaway && t > 1.3) {
      const k = t - 1.3;
      w.getaway.position.x = GARAGE_CAR_X + k * k * 9;
      this.player.x = w.getaway.position.x;
      if (Math.random() < 0.3) this.fx.burst(w.getaway.position.x - 2.4, 0.3, -1.7, 2, { color: new THREE.Color(0.09, 0.09, 0.1), speed: 1.5, life: 0.7, size: 0.18, gravity: -1, angle: Math.PI, spread: 0.6 });
    }
    if (t > 4.2) this.levelClear();
  }
  levelClear() {
    this.state = 'clear'; this.stateT = 0;
    const bonus = SCORE.levelBase * this.levelNum;
    this.addScore(bonus);
    audio.playMusic('music_clear', { loop: false });
    setTimeout(() => audio.play('vo_complete'), 1200);
    this.saveHi();
    this.hud.showClear(this.levelNum, bonus, this.score);
  }

  gameOver() {
    this.state = 'gameover'; this.stateT = 0;
    this.saveHi();
    audio.stopMusic(1.5);
    audio.play('vo_gameover');
    this.hud.showGameOver(this.score, this.hiscore);
  }
  saveHi() { try { localStorage.setItem('ea_hiscore', String(this.hiscore)); } catch { /* ignore */ } }

  // ---------- camera, lights, sound ----------
  viewDistance() {
    const tan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const aspect = this.camera.aspect;
    return Math.max(7.6 / tan, 7.5 / (tan * aspect));
  }
  updateCamera(dt) {
    const p = this.player, cam = this.camera;
    const dist = this.viewDistance();
    const tan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    const halfW = dist * tan * cam.aspect;
    const roofY = this.level.N * FH;
    let tx = p.x, ty = p.y + 1.9;
    if (p.mode === 'zip' || p.mode === 'drop') ty = p.y + 1.2;
    if (p.mode === 'dead') ty = p.y + 1.5;
    ty = Math.max(ty, 4.6); // never show below street level
    const outside = p.y > roofY - 1 || p.mode === 'exit';
    const xLim = outside ? 60 : Math.max(0, HALF_W + 2.2 - halfW);
    tx = clamp(tx, -xLim, xLim);
    if (p.mode === 'zip') tx = clamp(p.x + 6, -60, 60);
    let dist2 = dist;
    if (p.mode === 'intro') { tx = -25.8; ty = this.world.ledgeY + 1.1; dist2 = dist * 0.74; }
    this.camPos.x = damp(this.camPos.x, tx, 4, dt);
    this.camPos.y = damp(this.camPos.y, ty, p.mode === 'fall' ? 10 : 5, dt);
    this.camPos.z = damp(this.camPos.z, dist2, 3, dt);
    const sh = this.fx.shake;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + 1.4 + (Math.random() - 0.5) * sh, this.camPos.z);
    cam.lookAt(this.camPos.x, this.camPos.y - 0.4, -2.5);
  }
  updateTitleCamera(dt) {
    const N = this.level.N, cam = this.camera;
    const t = this.time * 0.05;
    const y = (0.5 + 0.5 * Math.sin(t)) * N * FH * 0.95 + 2;
    const dist = this.viewDistance() * 1.25;
    cam.position.set(Math.sin(this.time * 0.1) * 6, y + 2, dist);
    cam.lookAt(0, y, -2.5);
    this.camPos.set(cam.position.x, y, dist);
  }

  updateLights(dt) {
    const cy = this.camera.position.y - 1.4, cx = this.camera.position.x;
    const cands = [];
    for (const l of this.lamps) {
      if (l.state !== 'on') continue;
      const ly = l.f * FH + LAMP_Y;
      const d = Math.abs(ly - cy) + Math.abs(l.x - cx) * 0.25;
      if (Math.abs(ly - cy) < 14) cands.push([d, l]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const black = this.blackout > 0;
    const mp = this.motes.geometry.attributes.position.array;
    const T = this.time;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const c = cands[i];
      if (!c || black) {
        s.intensity = 0;
        for (let j = 0; j < MOTES_PER; j++) mp[(i * MOTES_PER + j) * 3 + 1] = -9999;
        continue;
      }
      {
        const l = c[1], top = l.f * FH + LAMP_Y - 0.25;
        for (let j = 0; j < MOTES_PER; j++) {
          const k = i * MOTES_PER + j, [h0, a0, r0, sp] = this.moteSeeds[k];
          const h = (h0 + T * 0.03 * sp) % 1;
          const y = top - h * 2.8, rad = (0.15 + h * 2.4) * Math.sqrt(r0);
          const a = a0 + T * 0.15 * sp;
          mp[k * 3] = l.x + Math.cos(a) * rad + Math.sin(T * 0.7 + a0) * 0.08;
          mp[k * 3 + 1] = y + Math.sin(T * 0.9 + h0 * 9) * 0.05;
          mp[k * 3 + 2] = -1.6 + Math.sin(a) * rad * 0.7;
        }
      }
      const l = c[1];
      const ly = l.f * FH + LAMP_Y;
      s.position.set(l.x, ly - 0.1, -1.6);
      s.target.position.set(l.x, l.f * FH, -1.2);
      let k = 1;
      if (l.flicker > 0) k = Math.random() < 0.5 ? 0.1 : 1;
      s.intensity = 40 * k;
    }
    // elevator interior lights for nearest cars
    const cars = this.level.shafts.map(s => [Math.abs(s.carY + 2 - cy) + Math.abs(s.x - cx) * 0.2, s]).sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.carLights.length; i++) {
      const L = this.carLights[i], c = cars[i];
      if (!c || c[0] > 16) { L.intensity = 0; continue; }
      L.position.set(c[1].x, c[1].carY + 2.6, -1.4);
      L.intensity = 9;
    }
    const p = this.player;
    this.keyLight.position.set(p.x + 0.8, p.y + p.jumpH + 2.2, p.z + 1.6);
    this.keyLight.intensity = p.mode === 'zip' || p.mode === 'drop' ? 7 : p.hidden ? 0 : 1.2;
    this.lightning = Math.max(0, (this.lightning || 0) - dt);
    const flash = this.lightning > 0 && Math.random() < 0.7 ? 1 : 0;
    this.lightningLevel = flash;
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.hemi.intensity = 0.2 + flash * 2.5;
    this.moon.intensity = 0.12 + flash * 3;
    if (this.state === 'exiting' || this.state === 'clear') return;
    if (this.world.headlight) this.world.headlight.intensity = 0;
  }

  updateRope() {
    const p = this.player, w = this.world, I = INTRO;
    if (p.mode === 'intro') {
      const t = p.t;
      const hand = p.rig.hand.getWorldPosition(_hand);
      const anchor = w.zipEnd;
      if (t < I.release) {
        w.placeHook(hand, 0, false); w.hook.rotation.set(0, 0, 2.6);
        w.rope.visible = false;
      } else if (t < I.land) {
        const k = (t - I.release) / (I.land - I.release);
        if (!this.releasePos) this.releasePos = hand.clone();
        _hp.copy(this.releasePos).lerp(_hp2.copy(anchor).add(_up15), k);
        _hp.y += 4 * 3.2 * k * (1 - k);
        w.placeHook(_hp, t * 16, false);
        w.rope.visible = true;
        w.setRope([hand, _hp], 0.15 + 0.5 * k);
      } else {
        this.releasePos = null;
        w.placeHook(anchor, 0, true);
        w.rope.visible = true;
        const since = t - I.land;
        // slack until yanked tight, then a decaying twang
        let sag = t < I.tight ? 0.9 - since * 2 : Math.max(0, 0.25 * Math.exp(-(t - I.tight) * 6) * Math.cos((t - I.tight) * 34));
        const tieK = clamp((t - I.tie) / (I.grab - I.tie), 0, 1);
        const start = _hp.copy(hand).lerp(w.zipStart, tieK * tieK * (3 - 2 * tieK));
        if (t >= I.grab) { const hk = _hp2.set(p.x, p.y + p.rig.gripHeight, -0.9); w.setRope([w.zipStart, hk, anchor]); }
        else w.setRope([start, anchor], Math.max(0, sag));
      }
      w.ropeSettled = false;
    } else if (p.mode === 'zip') {
      w.setRope([w.zipStart, _hp2.set(p.x, p.y + p.rig.gripHeight + 0.06, -0.9), w.zipEnd]);
      w.ropeSettled = false;
    } else if (!w.ropeSettled) {
      w.rope.visible = true;
      w.setRope([w.zipStart, w.zipEnd]);
      w.placeHook(w.zipEnd, 0, true);
      w.ropeSettled = true;
    }
  }

  updateSplashes() {
    const cx = this.camera.position.x, cy = this.camera.position.y;
    const roof = this.level.N * FH;
    if (cy > roof - 9) for (let i = 0; i < 5; i++) {
      const x = cx + (Math.random() - 0.5) * 34;
      if (Math.abs(x) > HALF_W + 1.4) continue;
      this.fx.spawn(x, roof + 0.03, -4.6 + Math.random() * 5.2, { color: SPLASH, speed: 1.4, angle: Math.PI / 2, spread: 0.9, life: 0.2, size: 0.035, gravity: 14, zSpread: 0.3 });
    }
    if (cy < 12) for (let i = 0; i < 4; i++) {
      const x = cx + (Math.random() - 0.5) * 40;
      if (x < HALF_W + 1.8) continue;
      this.fx.spawn(x, 0.02, -8 + Math.random() * 10, { color: SPLASH, speed: 1.4, angle: Math.PI / 2, spread: 0.9, life: 0.2, size: 0.035, gravity: 14, zSpread: 0.3 });
    }
  }

  updateAmbience() {
    if (!audio.ctx) return;
    const cy = this.camera.position.y;
    const roof = this.level.N * FH;
    audio.loop('rain_loop', this.state === 'title' ? 0.12 : cy > roof - 2 ? 0.45 : 0.1);
    let best = 0;
    for (const s of this.level.shafts) {
      if (s.stopped) continue;
      const d = Math.abs(s.carY + 1.5 - cy) + Math.abs(s.x - this.camera.position.x) * 0.3;
      best = Math.max(best, s.ctrlPlayer ? 0.5 : clamp(1 - d / 12, 0, 1) * 0.3);
    }
    audio.loop('elevator_loop', this.state === 'paused' ? 0 : best);
  }
}

export { lerp, NUM_FLOORS };
