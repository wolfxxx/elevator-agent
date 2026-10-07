import { FH, HALF_W, SHAFT_IN, PLAYER_H, DUCK_H, GRAVITY, LANE_Z, DEPTH, GUN_Y, GUN_Y_DUCK, CAR_ROOF } from './config.js';
import { makeHumanoid, makeSkinnedHumanoid, animateHumanoid, addHatAndShades } from './characters.js';
import { AGENT_HAT_AND_SHADES } from './config.js';
import { models } from './world.js';
import { clamp, lerp, rr } from './util.js';

// elite agents wear oxblood suits: the agent's colours are baked into vertex colours,
// so elites share one recoloured copy of the geometry
const eliteGeo = new Map();
const SUIT = [[0.028, 0.032, 0.06], [0.04, 0.045, 0.08]]; // suit, lapel (linear)
function eliteRecolor(mesh) {
  const src = mesh.geometry;
  if (!eliteGeo.has(src)) {
    const g = src.clone();
    const c = g.attributes.color;
    if (c) {
      for (let i = 0; i < c.count; i++) {
        const r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
        const hit = SUIT.some(([sr, sg, sb]) => Math.abs(r - sr) + Math.abs(gg - sg) + Math.abs(b - sb) < 0.012);
        if (hit) c.setXYZ(i, r * 1.7 + 0.02, gg * 0.25, b * 0.22);
      }
      c.needsUpdate = true;
    }
    eliteGeo.set(src, g);
  }
  mesh.geometry = eliteGeo.get(src);
}

export class Enemy {
  constructor(game, door, elite = false) {
    this.game = game;
    this.elite = elite;
    this.rig = models.agent
      ? makeSkinnedHumanoid(models.agent, { height: 1.98, recolor: elite ? eliteRecolor : null })
      : makeHumanoid(elite ? 'elite' : 'enemy');
    if (models.agent && AGENT_HAT_AND_SHADES) addHatAndShades(this.rig, { elite, scale: this.rig.skin.scale });
    game.scene.add(this.rig.root);
    const L = game.levelNum;
    Object.assign(this, {
      mode: 'emerge', f: door.f, x: door.x, y: door.f * FH, z: -DEPTH + 0.45, door, t: 0,
      facing: game.player.x > door.x ? 1 : -1, h: PLAYER_H, ducking: false, duckT: 0, jumpH: 0, jumpV: 0,
      shootCD: rr(1.0, 1.8) + (L < 2 ? 0.5 : 0), aimT: 0, recoil: 0, phase: Math.random() * 6, moving: false, time: 0,
      speed: (elite ? 3.6 : 2.6) + Math.min(1.4, L * 0.12), prefer: rr(3.5, 9), wanderDir: 0, thinkT: 0,
      deadT: 0, vx: 0, crushed: false, car: null, boardF: -1, exitDir: 0, decided: false, gone: false, seen: new WeakSet(),
      reaction: Math.min(0.85, 0.25 + L * 0.06 + (elite ? 0.2 : 0)),
      cdBase: Math.max(0.9, 2.3 - L * 0.13) * (elite ? 0.7 : 1),
    });
    game.world.setDoorState(door.id, 'open');
    game.sfx('door_open', this.x, this.y, 0.6);
  }

  get alive() { return this.mode !== 'dead'; }
  get hittable() { return this.alive && (this.mode !== 'emerge' || this.t > 0.25); }

  update(dt) {
    const g = this.game, p = g.player;
    this.time += dt; this.shootCD -= dt; this.duckT -= dt; this.aimT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 8);

    if (this.mode === 'dead') {
      this.deadT += dt;
      if (this.car) this.y = this.car.carY;
      if (this.vx) { this.x = clamp(this.x + this.vx * dt, -HALF_W + 0.5, HALF_W - 0.5); this.vx *= Math.pow(0.05, dt); }
      if (this.flyV !== undefined) { this.jumpH = Math.max(0, this.jumpH + this.flyV * dt); this.flyV -= GRAVITY * dt; }
      if (this.deadT > 2.4) this.gone = true;
      return;
    }
    if (this.mode === 'emerge') {
      this.t += dt;
      this.z = lerp(-DEPTH + 0.45, LANE_Z, Math.min(1, this.t / 0.55));
      this.moving = true; this.phase += dt * 9;
      if (this.t >= 0.55) { this.mode = 'floor'; this.z = LANE_Z; g.world.setDoorState(this.door.id, 'closed'); this.door.busy = false; }
      return;
    }

    if (this.jumpH > 0) {
      this.jumpH += this.jumpV * dt; this.jumpV -= GRAVITY * dt;
      if (this.jumpH <= 0) this.jumpH = 0;
    }
    if (this.mode === 'car') this.y = this.car.carY;

    const myFloor = this.mode === 'car' ? Math.round(this.y / FH) : this.f;
    const dark = g.floorDark(myFloor);
    const pY = p.targetable ? (p.mode === 'esc' ? null : p.y) : null;
    const same = pY !== null && Math.abs(pY - this.y) < 0.65;
    const dist = Math.abs(p.x - this.x);
    const range = dark ? 6.5 : 26;
    let vx = 0;

    if (same && dist < range) {
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.evade();
      if (this.jumpH === 0 && this.duckT <= 0 && dist > this.prefer && this.mode !== 'car') vx = this.facing * this.speed;
      if (this.shootCD <= 0 && this.jumpH === 0) this.fire(dark);
    } else {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = rr(0.8, 2.6);
        const r = Math.random();
        // drift towards the player's floor zone horizontally, otherwise wander
        this.wanderDir = r < 0.25 ? 0 : r < 0.6 ? Math.sign(p.x - this.x) || 1 : (Math.random() < 0.5 ? -1 : 1);
      }
      if (this.mode !== 'car' && this.duckT <= 0) vx = this.wanderDir * this.speed * 0.65;
      if (vx) this.facing = Math.sign(vx);
    }

    if (this.mode === 'car') vx = this.updateCar(same);
    this.ducking = this.duckT > 0 && this.jumpH === 0;
    this.h = this.ducking ? DUCK_H : PLAYER_H;
    if (this.ducking) vx = 0;
    this.moving = vx !== 0 && this.jumpH === 0;
    if (this.moving) this.phase += dt * 9 * (this.speed / 2.6);
    if (vx) this.moveH(vx * dt);
    if (this.mode === 'floor') { this.y = this.f * FH; this.checkCar(); }

    // far away & idle: despawn to recycle
    if (!same && Math.abs(this.y - p.y) > FH * 2.6) this.gone = true;
  }

  evade() {
    const g = this.game;
    if (this.jumpH > 0 || this.duckT > 0) return;
    for (const b of g.bullets) {
      if (b.owner !== 'player' || this.seen.has(b)) continue;
      const dx = this.x - b.x;
      if (Math.sign(dx) !== Math.sign(b.vx) || Math.abs(dx) > 6.5) continue;
      const rel = b.y - this.y;
      if (rel < -0.2 || rel > PLAYER_H + 0.3) continue;
      this.seen.add(b);
      if (Math.random() > this.reaction) continue;
      if (rel > DUCK_H + 0.05) { this.duckT = 0.55; }
      else if (this.mode !== 'car') { this.jumpV = 9.2; this.jumpH = 0.001; }
      return;
    }
  }

  fire(dark) {
    const g = this.game;
    const low = Math.random() < 0.3 + Math.min(0.2, g.levelNum * 0.02);
    if (low) this.duckT = 0.75;
    const gy = low ? GUN_Y_DUCK : GUN_Y;
    const mx = this.x + this.facing * 0.75;
    const speed = Math.min(22, 11 + g.levelNum * 1.1) * (this.elite ? 1.25 : 1);
    g.spawnBullet({ x: mx, y: this.y + gy, vx: this.facing * speed, owner: 'enemy' });
    g.fx.muzzle(mx, this.y + gy, this.z + 0.15, 0xff8050);
    g.sfx('shot_enemy', this.x, this.y, 0.7);
    this.aimT = 0.5; this.recoil = 1;
    this.shootCD = this.cdBase * rr(0.75, 1.35) * (dark ? 1.9 : 1);
  }

  updateCar(same) {
    const g = this.game, s = this.car;
    const al = g.alignedFloor(s);
    if (al < 0) { this.decided = false; return 0; }
    if (!this.decided) {
      this.decided = true;
      const pFloor = g.player.floorIndex;
      this.exitDir = 0;
      if (al !== this.boardF && (al === pFloor || Math.random() < 0.55)) this.exitDir = Math.sign(g.player.x - this.x) || 1;
      if (same) this.exitDir = 0;
    }
    if (this.exitDir) { this.facing = this.exitDir; return this.exitDir * this.speed; }
    return 0;
  }

  moveH(dx) {
    const g = this.game;
    let nx = clamp(this.x + dx, -HALF_W + 0.5, HALF_W - 0.5);
    if (nx !== this.x + dx) this.wanderDir *= -1;
    if (this.mode === 'floor') {
      for (const s of g.shaftsOn(this.f)) {
        const wasIn = Math.abs(this.x - s.x) < SHAFT_IN, willIn = Math.abs(nx - s.x) < SHAFT_IN;
        if (wasIn || !willIn) continue;
        const ok = (g.isAligned(s, this.f) && !s.ctrlPlayer && s.riders < 2) || (this.f === s.minF && !g.carBlocks(s, this.f, this.y, this.h));
        if (!ok) { nx = s.x + Math.sign(this.x - s.x) * (SHAFT_IN + 0.001); this.wanderDir = -Math.sign(dx); }
      }
      this.x = nx;
    } else if (this.mode === 'car') {
      const s = this.car;
      if (Math.abs(nx - s.x) >= SHAFT_IN) {
        const al = g.alignedFloor(s);
        if (al >= 0) { this.mode = 'floor'; this.f = al; this.y = al * FH; s.riders--; this.car = null; this.x = nx; this.wanderDir = this.exitDir; }
        else this.x = s.x + Math.sign(nx - s.x) * (SHAFT_IN - 0.001);
      } else this.x = nx;
    }
  }

  checkCar() {
    const g = this.game;
    for (const s of g.shaftsOn(this.f)) {
      if (Math.abs(this.x - s.x) >= SHAFT_IN) continue;
      if (g.isAligned(s, this.f) && !s.ctrlPlayer) {
        this.mode = 'car'; this.car = s; this.boardF = this.f; this.decided = true; this.exitDir = 0; s.riders++;
        this.x = s.x + clamp(this.x - s.x, -0.5, 0.5);
      }
      return;
    }
  }

  kill(how, dir = 0) {
    if (!this.alive) return;
    const g = this.game;
    if (this.mode === 'car' && this.car) this.car.riders--;
    if (this.mode === 'emerge') { this.door.busy = false; g.world.setDoorState(this.door.id, 'closed'); this.z = LANE_Z; }
    this.mode = 'dead'; this.deadT = 0; this.crushed = how === 'crush' || how === 'lamp';
    this.ducking = false;
    if (how === 'kick') { this.vx = dir * 9; this.flyV = 6; this.facing = -dir; }
    else if (how === 'shot') { this.vx = dir * 2; this.facing = -dir || this.facing; }
    g.onEnemyKilled(this, how);
  }

  sync(dt) {
    const r = this.rig;
    r.root.position.set(this.x, this.y + this.jumpH, this.z);
    const fade = this.mode === 'dead' && this.deadT > 1.8 ? Math.floor(this.deadT * 16) % 2 === 0 : true;
    r.root.visible = fade;
    animateHumanoid(r, {
      facing: this.facing, moving: this.moving, phase: this.phase, ducking: this.ducking, jumpH: this.jumpH,
      kicking: false, aim: (this.aimT > 0 || this.ducking) ? 1 : 0, recoil: this.recoil,
      dead: this.mode === 'dead' ? this.deadT + 0.001 : 0, crushed: this.crushed, time: this.time,
      backTurned: false,
    }, dt);
  }

  dispose() { this.game.scene.remove(this.rig.root); }
}

export { CAR_ROOF };
