import { FH, HALF_W, SHAFT_IN, PLAYER_H, DUCK_H, GRAVITY, JUMP_V, WALK, PLAYER_BULLET_SPEED, MAX_PLAYER_BULLETS,
  GUN_Y, GUN_Y_DUCK, LANE_Z, DEPTH, CAR_ROOF, SLAB } from './config.js';
import { makeHumanoid, makeSkinnedHumanoid, animateHumanoid } from './characters.js';
import { models } from './world.js';
import { clamp, lerp } from './util.js';
import { Color } from 'three';

// intro timeline (seconds)
export const INTRO = { wind: 0.7, release: 1.25, land: 2.2, tight: 2.42, tie: 2.6, grab: 3.15, zip: 3.5 };
const HOOK_SPARK = new Color(3.5, 2.4, 1.0);

const CASING = new Color(1.2, 0.85, 0.3);

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = models.granny ? makeSkinnedHumanoid(models.granny, { height: 1.95, matte: true }) : makeHumanoid('player');
    game.scene.add(this.rig.root);
    this.reset();
  }

  reset() {
    Object.assign(this, {
      mode: 'floor', f: 0, x: 0, y: 0, z: LANE_Z, facing: 1, ducking: false, jumpH: 0, jumpV: 0, jumpDir: 0,
      kicking: false, vy: 0, car: null, shootCD: 0, aimT: 0, recoil: 0, phase: 0, invuln: 0, deadT: 0,
      h: PLAYER_H, hidden: false, deadCar: null, deadOff: 0, moving: false, time: 0, crushed: false, t: 0, door: null, esc: null, backTurned: false,
    });
  }

  get alive() { return this.mode !== 'dead'; }
  get targetable() { return this.alive && this.invuln <= 0 && !['intro', 'door', 'zip', 'drop', 'exit', 'warp'].includes(this.mode) && !this.hidden; }
  get floorIndex() { return this.mode === 'floor' ? this.f : Math.round(this.y / FH); }

  // Level intro, as in the arcade: throw the grappling line across, tie it off, slide over.
  startIntro() {
    this.reset();
    const w = this.game.world;
    this.mode = 'intro'; this.t = 0;
    this.x = w.zipStart.x - 0.8; this.y = w.ledgeY; this.facing = 1;
    this.rig.gun.visible = false;
  }

  updateIntro(dt) {
    const g = this.game, w = g.world, I = INTRO;
    const prev = this.t; this.t += dt;
    const t = this.t, hit = (k) => prev < k && t >= k;
    this.moving = false; this.ducking = false; this.climb = false;
    if (hit(I.release)) g.sfx('hook_throw', this.x + 4, this.y, 1);
    if (hit(I.land)) {
      g.sfx('hook_clink', w.zipEnd.x, w.zipEnd.y, 1.1);
      g.fx.burst(w.zipEnd.x, w.zipEnd.y + 0.05, -0.9, 14, { color: HOOK_SPARK, speed: 4, angle: Math.PI / 2, spread: 1.4, life: 0.45, size: 0.04, gravity: 16, stretch: 2 });
      g.fx.flashAt(w.zipEnd.x, w.zipEnd.y + 0.3, -0.5, 0xffd8a0, 14, 0.07);
      g.fx.shake = 0.12;
    }
    if (hit(I.tight)) g.sfx('rope_tight', this.x + 2, this.y + 1, 0.9);
    if (t < I.grab) return;
    // hop up and grab the line
    const k = Math.min(1, (t - I.grab) / (I.zip - I.grab));
    this.climb = true;
    this.y = lerp(w.ledgeY, w.zipStart.y - this.rig.gripHeight, k * k);
    this.x = lerp(w.zipStart.x - 0.8, w.zipStart.x, k);
    if (t >= I.zip) { this.mode = 'zip'; this.t = 0; g.sfx('zipline', this.x, this.y, 0.9); }
  }

  introPose() {
    const I = INTRO, t = this.t;
    if (t < I.wind) return {};
    if (t < I.release) { const k = (t - I.wind) / (I.release - I.wind); const e = k * k * (3 - 2 * k); return { armR: 2.6 * e, elR: 1.5 * e, lean: -0.12 * e }; }
    if (t < I.release + 0.18) { const k = (t - I.release) / 0.18; return { armR: lerp(2.6, -1.7, k), elR: lerp(1.5, 0, k), lean: lerp(-0.12, 0.3, k) }; }
    if (t < I.tie) return { armR: -1.25, elR: 0.2, lean: 0.15 };
    if (t < I.grab) { const k = (t - I.tie) / (I.grab - I.tie); return { armR: lerp(-1.25, -0.5, k), elR: lerp(0.2, 1.2, k), lean: 0.25 * Math.sin(k * Math.PI) }; }
    return {};
  }

  placeAt(f, x) {
    this.reset();
    this.mode = 'floor'; this.f = f; this.x = x; this.y = f * FH;
    this.invuln = 2.5;
    this.rig.gun.visible = true;
  }

  update(dt, inp) {
    const g = this.game;
    this.time += dt;
    this.shootCD -= dt; this.invuln -= dt; this.aimT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 8);

    if (this.mode === 'intro') return this.updateIntro(dt);
    if (this.mode === 'zip') return this.updateZip(dt);
    if (this.mode === 'drop') return this.updateDrop(dt);
    if (this.mode === 'door') return this.updateDoor(dt);
    if (this.mode === 'esc') return this.updateEsc(dt);
    if (this.mode === 'dead') {
      this.deadT += dt;
      if (this.deadCar) this.y = this.deadCar.carY + this.deadOff;
      return;
    }
    if (this.mode === 'exit' || this.mode === 'warp') return;

    this.ducking = inp.down('down') && this.jumpH === 0 && (this.mode === 'floor' || this.mode === 'roof');
    this.h = this.ducking ? DUCK_H : PLAYER_H;

    if (this.mode === 'floor' && this.jumpH === 0) {
      if (inp.pressed('up') && (this.tryDoor() || this.tryEscalator(1))) return;
      if (inp.pressed('down') && this.tryEscalator(-1)) return;
    }

    if (inp.pressed('jump') && this.jumpH === 0 && !this.ducking && ['floor', 'car', 'roof'].includes(this.mode)) {
      this.jumpV = JUMP_V; this.jumpH = 0.001; this.jumpDir = inp.x; this.kicking = true;
      if (inp.x) this.facing = inp.x;
      g.sfx('jump', this.x, this.y, 0.6);
    }
    if (this.jumpH > 0) {
      this.jumpH += this.jumpV * dt; this.jumpV -= GRAVITY * dt;
      if (this.jumpH <= 0) { this.jumpH = 0; this.kicking = false; }
    }

    let vx = 0;
    if (this.jumpH > 0) vx = this.jumpDir * WALK;
    else if (!this.ducking) vx = inp.x * WALK;
    if (this.jumpH === 0 && inp.x) this.facing = inp.x;
    if (this.mode === 'car' && !this.car.stopped) vx = 0;
    if (this.mode === 'fall') vx = 0;
    this.moving = vx !== 0 && this.jumpH === 0;
    if (this.moving) this.phase += dt * 11;
    if (vx) this.moveH(vx * dt);

    if (this.mode === 'floor') { this.y = this.f * FH; this.checkFloorShaft(); }
    else if (this.mode === 'car') {
      this.y = this.car.carY;
      this.car.ctrl = this.jumpH > 0 ? 0 : (inp.down('up') ? 1 : inp.down('down') ? -1 : 0);
    } else if (this.mode === 'roof') {
      this.y = this.car.carY + CAR_ROOF;
    } else if (this.mode === 'fall') this.updateFall(dt);

    if (inp.pressed('fire') && this.shootCD <= 0 && g.playerBulletCount() < MAX_PLAYER_BULLETS && this.mode !== 'fall') this.shoot();
  }

  shoot() {
    const g = this.game;
    const gy = (this.ducking ? GUN_Y_DUCK : GUN_Y) + this.jumpH;
    const mx = this.x + this.facing * 0.75;
    g.spawnBullet({ x: mx, y: this.y + gy, vx: this.facing * PLAYER_BULLET_SPEED, owner: 'player' });
    g.fx.muzzle(mx, this.y + gy, this.z + 0.15, 0xffd080);
    g.fx.spawn(this.x + this.facing * 0.3, this.y + gy + 0.05, this.z + 0.2, { color: CASING, speed: 3, angle: Math.PI / 2 - this.facing * 1.2, spread: 0.3, life: 0.9, size: 0.06, gravity: 22, floor: this.y + 0.03, bounce: 0.45, stretch: 1.8 });
    this.aimT = 0.4; this.recoil = 1; this.shootCD = 0.16;
    g.sfx('shot_player', this.x, this.y, 0.8);
  }

  moveH(dx) {
    const g = this.game;
    let nx = clamp(this.x + dx, -HALF_W + 0.45, HALF_W - 0.45);
    if (this.mode === 'floor') {
      const yb = this.f * FH + this.jumpH;
      for (const s of g.shaftsOn(this.f)) {
        const wasIn = Math.abs(this.x - s.x) < SHAFT_IN, willIn = Math.abs(nx - s.x) < SHAFT_IN;
        if (!wasIn && willIn && g.carBlocks(s, this.f, yb, this.h)) nx = s.x + Math.sign(this.x - s.x) * (SHAFT_IN + 0.001);
      }
      this.x = nx;
    } else if (this.mode === 'car') {
      const s = this.car;
      if (Math.abs(nx - s.x) >= SHAFT_IN) {
        const al = g.alignedFloor(s);
        if (al >= 0 && this.jumpH === 0) {
          this.x = nx; this.mode = 'floor'; this.f = al; this.y = al * FH;
          s.ctrlPlayer = false; s.ctrl = 0; s.wait = 1.2; this.car = null;
        } else this.x = s.x + Math.sign(nx - s.x) * (SHAFT_IN - 0.001);
      } else this.x = nx;
    } else if (this.mode === 'roof') {
      const s = this.car;
      if (Math.abs(nx - s.x) >= SHAFT_IN) {
        const roofY = s.carY + CAR_ROOF;
        let exitF = -1;
        for (let L = s.minF + 1; L <= s.maxF; L++) { const d = L * FH - (roofY + this.jumpH); if (d >= -0.6 && d <= 1.0) exitF = L; }
        if (exitF >= 0) {
          this.jumpH = Math.max(0, roofY + this.jumpH - exitF * FH);
          if (this.jumpH === 0) this.kicking = false;
          this.x = nx; this.mode = 'floor'; this.f = exitF; this.y = exitF * FH; this.car = null;
        } else this.x = s.x + Math.sign(nx - s.x) * (SHAFT_IN - 0.001);
      } else this.x = nx;
    }
  }

  checkFloorShaft() {
    const g = this.game;
    for (const s of g.shaftsOn(this.f)) {
      if (Math.abs(this.x - s.x) >= SHAFT_IN) continue;
      if (this.jumpH > 0) return;
      if (g.isAligned(s, this.f) && !s.ctrlPlayer) {
        this.mode = 'car'; this.car = s; s.ctrlPlayer = true; s.ctrl = 0;
        g.sfx('step_in', this.x, this.y, 0.5);
      } else if (this.f > s.minF) {
        this.mode = 'fall'; this.car = s; this.vy = 0;
      }
      return;
    }
  }

  updateFall(dt) {
    const s = this.car;
    const prevY = this.y;
    this.vy -= GRAVITY * dt; this.y += this.vy * dt;
    this.x += (s.x - this.x) * Math.min(1, dt * 3) * 0.3;
    const roofY = s.carY + CAR_ROOF;
    if (this.y <= roofY && prevY >= roofY - 0.6 && s.carY < prevY) {
      this.y = roofY; this.mode = 'roof'; this.vy = 0;
      this.game.sfx('step_in', this.x, this.y, 0.8); this.game.fx.shake = 0.15;
      return;
    }
    const pit = s.minF * FH;
    if (this.y <= pit) { this.y = pit; this.mode = 'floor'; this.f = s.minF; this.car = null; this.game.sfx('step_in', this.x, this.y, 0.8); }
  }

  tryDoor() {
    const g = this.game;
    const d = g.doorNear(this.f, this.x, 0.9);
    if (!d || !d.red || d.collected) return false;
    this.mode = 'door'; this.door = d; this.t = 0; this.x = d.x;
    g.world.setDoorState(d.id, 'open');
    g.sfx('door_open', this.x, this.y, 0.8);
    return true;
  }

  updateDoor(dt) {
    const g = this.game, d = this.door;
    const prev = this.t; this.t += dt;
    this.ducking = false; this.jumpH = 0; this.h = PLAYER_H;
    const inZ = -DEPTH + 0.45;
    if (this.t < 0.4) { this.backTurned = true; this.z = lerp(LANE_Z, inZ, this.t / 0.4); this.moving = true; this.phase += dt * 9; }
    else if (this.t < 1.2) {
      this.hidden = true; this.moving = false;
      if (prev < 0.4) g.world.setDoorState(d.id, 'closed');
      if (prev < 1.0 && this.t >= 1.0) {
        d.collected = true; g.onDocument(d);
        g.world.setDoorState(d.id, 'done'); g.world.setDoorState(d.id, 'open');
      }
    } else if (this.t < 1.6) { this.hidden = false; this.backTurned = false; this.z = lerp(inZ, LANE_Z, (this.t - 1.2) / 0.4); this.moving = true; this.phase += dt * 9; }
    else {
      g.world.setDoorState(d.id, 'closed');
      this.mode = 'floor'; this.z = LANE_Z; this.door = null; this.moving = false; this.invuln = 0.6;
    }
  }

  tryEscalator(dir) {
    for (const e of this.game.level.escalators) {
      if (dir > 0 && e.f === this.f && Math.abs(this.x - e.xBottom) < 1.2) { this.startEsc(e.xBottom, e.f, e.xTop, e.f + 1); return true; }
      if (dir < 0 && e.f + 1 === this.f && Math.abs(this.x - e.xTop) < 1.2) { this.startEsc(e.xTop, e.f + 1, e.xBottom, e.f); return true; }
    }
    return false;
  }
  startEsc(x0, f0, x1, f1) {
    this.mode = 'esc'; this.t = 0;
    this.esc = { x0: this.x, y0: f0 * FH, xs: x0, x1, y1: f1 * FH, f1 };
    this.facing = Math.sign(x1 - x0) || 1;
    this.ducking = false; this.h = PLAYER_H;
  }
  updateEsc(dt) {
    const e = this.esc;
    this.t += dt;
    const T0 = 0.25, T1 = 1.9;
    this.moving = true; this.phase += dt * (this.t < T0 ? 10 : 0);
    if (this.t < T0) { const k = this.t / T0; this.x = lerp(e.x0, e.xs, k); this.z = lerp(LANE_Z, -3.0, k); this.y = e.y0; }
    else if (this.t < T1) {
      const k = (this.t - T0) / (T1 - T0);
      const s = k * k * (3 - 2 * k);
      this.x = lerp(e.xs, e.x1, s); this.y = lerp(e.y0, e.y1, s) + 0.05; this.z = -3.0; this.moving = false;
    } else if (this.t < T1 + 0.25) { const k = (this.t - T1) / 0.25; this.z = lerp(-3.0, LANE_Z, k); this.y = e.y1; this.phase += dt * 10; }
    else { this.mode = 'floor'; this.f = e.f1; this.y = e.y1; this.z = LANE_Z; this.esc = null; this.moving = false; }
  }

  updateZip(dt) {
    const w = this.game.world;
    this.t += dt / 2.6;
    const k = Math.min(1, this.t * this.t);
    this.x = lerp(w.zipStart.x, w.zipEnd.x, k);
    this.y = lerp(w.zipStart.y, w.zipEnd.y, k) - this.rig.gripHeight;
    if (this.t >= 1) { this.mode = 'drop'; this.vy = 0; this.x = w.zipEnd.x + 0.3; }
  }
  updateDrop(dt) {
    const roof = this.game.level.N * FH;
    this.vy -= GRAVITY * dt; this.y += this.vy * dt; this.x += dt * 2;
    if (this.y <= roof) { this.y = roof; this.mode = 'floor'; this.f = this.game.level.N; this.rig.gun.visible = true; this.game.sfx('step_in', this.x, this.y, 1); this.game.fx.shake = 0.2; this.game.onLanded(); }
  }

  die(how) {
    if (!this.alive || this.mode === 'exit') return;
    if (how !== 'crush' && how !== 'lamp' && this.invuln > 0) return;
    this.deadCar = (this.mode === 'car' || this.mode === 'roof') && how !== 'crush' ? this.car : null;
    this.deadOff = this.mode === 'roof' ? CAR_ROOF : 0;
    this.mode = 'dead'; this.deadT = 0; this.crushed = how === 'crush';
    this.jumpH = Math.max(0, this.jumpH);
    if (this.car && this.car.ctrlPlayer) { this.car.ctrlPlayer = false; this.car.ctrl = 0; }
    this.game.onPlayerDeath(how);
  }

  ceilingCheck() { // roof riders get squashed against the top of the shaft
    if (this.mode !== 'roof') return;
    const s = this.car;
    const ceil = (s.maxF + 1) * FH - SLAB;
    if (this.y + this.jumpH + this.h > ceil) this.die('crush');
  }

  sync(dt) {
    const r = this.rig;
    r.root.position.set(this.x, this.y + this.jumpH, this.z);
    const blink = this.invuln > 0 && this.mode !== 'dead' && Math.floor(this.time * 14) % 2 === 0;
    r.root.visible = !this.hidden && !blink && this.mode !== 'exit';
    animateHumanoid(r, {
      ...(this.mode === 'intro' ? this.introPose() : {}),
      facing: this.facing, moving: this.moving, phase: this.phase, ducking: this.ducking, jumpH: this.jumpH,
      kicking: this.kicking && this.jumpH > 0.15, aim: this.aimT > 0 ? 1 : 0, recoil: this.recoil,
      dead: this.mode === 'dead' ? this.deadT + 0.001 : 0, crushed: this.crushed, climb: this.mode === 'zip' || this.mode === 'drop' || (this.mode === 'intro' && this.climb),
      time: this.time, backTurned: this.backTurned,
    }, dt);
  }
}
