import * as THREE from 'three';
import { glowSprite } from './textures.js';

const MAX = 900;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.05, g: 0, rot: 0, vr: 0, color: new THREE.Color(), floor: -1e9, bounce: 0 });
    this.next = 0;

    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 9, 2);
      scene.add(l); this.lights.push({ l, t: 0 });
    }
    this.sprites = [];
    const sm = new THREE.SpriteMaterial({ map: glowSprite(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(3, 2.2, 1) });
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(sm.clone()); s.visible = false; scene.add(s); this.sprites.push({ s, t: 0 }); }
    this.shake = 0;
  }

  spawn(x, y, z, o) {
    const p = this.p[this.next]; this.next = (this.next + 1) % MAX;
    p.alive = true; p.x = x; p.y = y; p.z = z;
    const sp = o.speed ?? 4, spread = o.spread ?? Math.PI;
    const a = (o.angle ?? Math.PI / 2) + (Math.random() - 0.5) * 2 * spread;
    const s = sp * (0.3 + Math.random() * 0.7);
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.vz = (Math.random() - 0.5) * sp * (o.zSpread ?? 0.6);
    p.max = p.life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.6);
    p.size = (o.size ?? 0.06) * (0.6 + Math.random() * 0.8);
    p.g = o.gravity ?? 12;
    p.color.copy(o.color ?? new THREE.Color(3, 2, 0.8));
    p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 20;
    p.floor = o.floor ?? -1e9; p.bounce = o.bounce ?? 0.3;
    p.stretch = o.stretch ?? 1;
  }
  burst(x, y, z, n, o = {}) { for (let i = 0; i < n; i++) this.spawn(x, y, z, o); }

  muzzle(x, y, z, color) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y, z + 0.6); L.l.color.set(color ?? 0xffc070); L.t = 0.07; L.l.intensity = 18;
    const S = this.sprites.find(s => !s.s.visible) || this.sprites[0];
    S.s.position.set(x, y, z + 0.05); S.s.scale.setScalar(0.9 + Math.random() * 0.4); S.s.visible = true; S.t = 0.06;
    S.s.material.rotation = Math.random() * 6;
  }
  flashAt(x, y, z, color, intensity = 30, t = 0.15) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y, z); L.l.color.set(color); L.t = t; L.l.intensity = intensity;
  }

  update(dt) {
    let n = 0;
    for (const p of this.p) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vr *= 0.5; }
      p.rot += p.vr * dt;
      const k = Math.min(1, p.life / p.max * 2);
      tmpP.set(p.x, p.y, p.z);
      tmpE.set(p.rot, p.rot * 0.7, 0); tmpQ.setFromEuler(tmpE);
      tmpS.set(p.size * k * p.stretch, p.size * k, p.size * k);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const L of this.lights) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; }
    for (const S of this.sprites) { S.t -= dt; if (S.t <= 0) S.s.visible = false; }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}

// Bullet tracer meshes, pooled
export class BulletPool {
  constructor(scene) {
    this.geo = new THREE.BoxGeometry(0.5, 0.05, 0.05);
    this.matP = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.2), toneMapped: false });
    this.matE = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.3), toneMapped: false });
    this.pool = []; this.scene = scene;
  }
  get(enemy) {
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(this.geo, this.matP); this.scene.add(m); }
    m.material = enemy ? this.matE : this.matP;
    m.visible = true;
    return m;
  }
  release(m) { m.visible = false; this.pool.push(m); }
}
