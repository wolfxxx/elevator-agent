// Low-poly humanoids built from boxes, animated procedurally.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const geoCache = new Map();
function box(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });

export const LOOKS = {
  player: {
    suit: std(0x3b4f6e, { roughness: 0.55 }), pants: std(0x2c3a52), shirt: std(0xe8e6e0), tie: std(0xc0262d),
    skin: std(0xe0ac85), hair: std(0xf2cf5a, { roughness: 0.4 }), shoes: std(0x1a1410, { roughness: 0.3 }),
    glasses: null, hat: null,
  },
  enemy: {
    suit: std(0x15161a, { roughness: 0.5 }), pants: std(0x101114), shirt: std(0xd8d8d0), tie: std(0x0b0b0b),
    skin: std(0xd9a07a), hair: std(0x1a1a1a), shoes: std(0x070707, { roughness: 0.3 }),
    glasses: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, emissive: 0x330000 }),
    hat: std(0x111216, { roughness: 0.7 }), band: std(0x5a1a1a),
  },
  elite: {
    suit: std(0x3a1214, { roughness: 0.5 }), pants: std(0x1f0b0c), shirt: std(0x1a1a1a), tie: std(0xd4af37, { metalness: 0.6 }),
    skin: std(0xc98f6a), hair: std(0x1a1a1a), shoes: std(0x070707, { roughness: 0.3 }),
    glasses: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, emissive: 0x550000 }),
    hat: std(0x2a2a30, { roughness: 0.7 }), band: std(0xd4af37, { metalness: 0.6 }),
  },
};
const GUN = std(0x1c1c1f, { metalness: 0.8, roughness: 0.3 });

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function makeHumanoid(lookName) {
  const L = LOOKS[lookName];
  const root = new THREE.Group();
  const body = new THREE.Group(); body.rotation.order = 'YXZ'; root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  mesh(box(0.42, 0.18, 0.24), L.pants, 0, 0.02, 0, torso);
  mesh(box(0.5, 0.62, 0.27), L.suit, 0, 0.38, 0, torso);
  mesh(box(0.16, 0.42, 0.02), L.shirt, 0, 0.48, 0.137, torso);
  mesh(box(0.05, 0.36, 0.02), L.tie, 0, 0.46, 0.15, torso);
  mesh(box(0.22, 0.08, 0.05), L.suit, -0.08, 0.66, 0.12, torso).rotation.z = 0.5; // lapels
  mesh(box(0.22, 0.08, 0.05), L.suit, 0.08, 0.66, 0.12, torso).rotation.z = -0.5;

  const neck = new THREE.Group(); neck.position.y = 0.7; torso.add(neck);
  mesh(box(0.11, 0.1, 0.11), L.skin, 0, 0.03, 0, neck);
  const head = new THREE.Group(); head.position.y = 0.08; neck.add(head);
  mesh(box(0.27, 0.31, 0.28), L.skin, 0, 0.15, 0, head);
  mesh(box(0.05, 0.06, 0.05), L.skin, 0, 0.12, 0.15, head); // nose
  mesh(box(0.06, 0.1, 0.06), L.skin, 0.15, 0.14, -0.02, head); // ears
  mesh(box(0.06, 0.1, 0.06), L.skin, -0.15, 0.14, -0.02, head);
  if (L.glasses) mesh(box(0.25, 0.06, 0.03), L.glasses, 0, 0.19, 0.145, head);
  else {
    mesh(box(0.035, 0.035, 0.02), std(0x222222), 0.065, 0.19, 0.142, head);
    mesh(box(0.035, 0.035, 0.02), std(0x222222), -0.065, 0.19, 0.142, head);
  }
  if (L.hat) {
    const hat = new THREE.Group(); hat.position.y = 0.3; head.add(hat);
    mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 14), L.hat, 0, 0.0, 0, hat);
    mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.17, 14), L.hat, 0, 0.09, 0, hat);
    mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 14), L.band, 0, 0.03, 0, hat);
    hat.rotation.x = -0.08;
  } else {
    mesh(box(0.3, 0.1, 0.31), L.hair, 0, 0.32, -0.01, head);
    mesh(box(0.3, 0.2, 0.08), L.hair, 0, 0.22, -0.13, head);
    mesh(box(0.32, 0.07, 0.12), L.hair, 0.02, 0.33, 0.1, head).rotation.z = -0.15; // quiff
  }

  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0.32 * side, 0.6, 0); torso.add(sh);
    mesh(box(0.14, 0.38, 0.15), L.suit, 0, -0.17, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.36; sh.add(el);
    mesh(box(0.12, 0.32, 0.13), L.suit, 0, -0.14, 0, el);
    mesh(box(0.1, 0.1, 0.11), L.skin, 0, -0.33, 0, el);
    return { sh, el };
  };
  const aL = arm(-1), aR = arm(1);
  const gun = new THREE.Group(); gun.position.set(0, -0.34, 0.04); gun.rotation.x = Math.PI / 2; aR.el.add(gun);
  mesh(box(0.05, 0.1, 0.07), GUN, 0, -0.02, 0, gun);
  mesh(box(0.05, 0.06, 0.28), GUN, 0, 0.05, 0.1, gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.05, 0.27); gun.add(muzzle);

  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(0.12 * side, 0, 0); hips.add(hp);
    mesh(box(0.18, 0.5, 0.2), L.pants, 0, -0.24, 0, hp);
    const kn = new THREE.Group(); kn.position.y = -0.48; hp.add(kn);
    mesh(box(0.16, 0.42, 0.17), L.pants, 0, -0.2, 0, kn);
    mesh(box(0.17, 0.09, 0.3), L.shoes, 0, -0.43, 0.05, kn);
    return { hp, kn };
  };
  const lL = leg(-1), lR = leg(1);

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);

  const hand = new THREE.Object3D(); hand.position.y = -0.34; aR.el.add(hand);
  const rig = { root, body, hips, torso, neck, head, aL, aR, lL, lR, gun, muzzle, shadow, hand, facingAngle: 1.2 };
  rig.gripHeight = measureGrip(rig, hand);
  return rig;
}

// height above the feet where the hands close around a line in the hanging pose
function measureGrip(rig, hand) {
  animateHumanoid(rig, { climb: true, facing: 1, faceInstant: true }, 0);
  rig.root.updateMatrixWorld(true);
  const y = hand.getWorldPosition(new THREE.Vector3()).y - rig.root.getWorldPosition(new THREE.Vector3()).y;
  return y + 0.07; // palm sits just above the wrist pivot
}

// state: { facing, moving, phase, ducking, jumpH, kicking, aim (0..1), dead (0..1+), crushed, climb, inCar, recoil, hidden }
export function animateHumanoid(r, s, dt) {
  poseHumanoid(r, s, dt);
  if (s.armR !== undefined) {
    r.aR.sh.rotation.set(s.armR, 0, 0.12);
    r.aR.el.rotation.set(s.elR ?? 0, 0, 0);
    r.torso.rotation.x += (s.lean ?? 0);
  }
  if (r.skin) applySkinned(r);
}

function poseHumanoid(r, s, dt) {
  const targetFace = s.facing > 0 ? 1.15 : -1.15;
  if (s.faceInstant) r.facingAngle = targetFace;
  else r.facingAngle += (targetFace - r.facingAngle) * Math.min(1, dt * 14);
  r.body.rotation.y = s.climb ? (s.facing > 0 ? 0.6 : -0.6) + Math.PI : r.facingAngle;
  if (s.backTurned) r.body.rotation.y = Math.PI;

  // reset
  r.hips.position.y = 0.95; r.hips.position.z = 0;
  r.torso.rotation.set(0, 0, 0); r.neck.rotation.set(0, 0, 0);
  r.body.rotation.x = 0; r.body.position.set(0, 0, 0);
  for (const a of [r.aL, r.aR]) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  for (const l of [r.lL, r.lR]) { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); }
  r.root.scale.set(1, 1, 1);
  r.shadow.visible = true;

  if (s.dead !== undefined && s.dead > 0) {
    const t = Math.min(1, s.dead * 2.2);
    const e = 1 - Math.pow(1 - t, 3);
    r.body.rotation.x = -e * Math.PI / 2;
    r.body.position.y = 0.12 * e;
    r.aL.sh.rotation.x = -2.6 * e; r.aR.sh.rotation.x = -2.4 * e;
    r.lL.hp.rotation.x = -0.4 * e; r.lR.hp.rotation.x = 0.2 * e;
    r.neck.rotation.x = 0.4 * e;
    if (s.crushed) { r.body.rotation.x = 0; r.root.scale.set(1.35, Math.max(0.12, 1 - t * 1.2), 1.35); }
    return;
  }

  const ph = s.phase || 0;
  if (s.climb) { // riding escalator / zipline hang
    r.aL.sh.rotation.x = -2.9; r.aR.sh.rotation.x = -2.9;
    r.lL.hp.rotation.x = -0.3; r.lR.hp.rotation.x = 0.1; r.lL.kn.rotation.x = 0.5;
    return;
  }
  if (s.jumpH > 0.01) {
    r.shadow.position.y = -s.jumpH + 0.02;
    r.shadow.scale.setScalar(Math.max(0.3, 1 - s.jumpH * 0.4));
    if (s.kicking) {
      r.lR.hp.rotation.x = -1.55; r.lR.kn.rotation.x = 0.05;
      r.lL.hp.rotation.x = 0.2; r.lL.kn.rotation.x = 1.9;
      r.torso.rotation.x = -0.35;
      r.aL.sh.rotation.x = 0.6; r.aL.sh.rotation.z = -0.7;
      r.aR.sh.rotation.x = s.aim > 0 ? -1.57 : 0.4;
    } else {
      r.lL.hp.rotation.x = -0.9; r.lL.kn.rotation.x = 1.6;
      r.lR.hp.rotation.x = -0.3; r.lR.kn.rotation.x = 1.2;
      r.aL.sh.rotation.x = -0.8; r.aR.sh.rotation.x = s.aim > 0 ? -1.57 : -0.8;
    }
    return;
  }
  r.shadow.position.y = 0.02; r.shadow.scale.setScalar(1);

  if (s.ducking) {
    r.hips.position.y = 0.52;
    r.lL.hp.rotation.x = -1.25; r.lL.kn.rotation.x = 2.3;
    r.lR.hp.rotation.x = -0.35; r.lR.kn.rotation.x = 1.9;
    r.torso.rotation.x = 0.35; r.neck.rotation.x = -0.3;
    r.aL.sh.rotation.x = -0.5; r.aL.el.rotation.x = -0.6;
    r.aR.sh.rotation.x = -1.57 - 0.35 + (s.recoil || 0) * 0.4;
    return;
  }

  if (s.moving) {
    const sw = Math.sin(ph);
    r.lL.hp.rotation.x = sw * 0.75; r.lR.hp.rotation.x = -sw * 0.75;
    r.lL.kn.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 1.1;
    r.lR.kn.rotation.x = Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 1.1;
    r.hips.position.y = 0.95 - Math.abs(Math.cos(ph)) * 0.05;
    r.torso.rotation.x = 0.08;
    r.aL.sh.rotation.x = -sw * 0.6; r.aL.el.rotation.x = -0.4;
    r.aR.sh.rotation.x = sw * 0.6; r.aR.el.rotation.x = -0.4;
  } else {
    const br = Math.sin((s.time || 0) * 2) * 0.02;
    r.torso.rotation.x = br; r.aL.sh.rotation.z = -0.05; r.aR.sh.rotation.z = 0.05;
    r.lL.hp.rotation.z = -0.04; r.lR.hp.rotation.z = 0.04;
  }
  if (s.aim > 0) {
    r.aR.sh.rotation.x = -1.57 + (s.recoil || 0) * 0.5;
    r.aR.el.rotation.x = 0;
    r.aR.sh.rotation.z = 0;
  }
}

// ---------------------------------------------------------------------------
// Skinned Mixamo characters driven by the same procedural poses.
// The box-rig pose (Euler rotations on a proxy hierarchy) is converted into
// per-bone character-space deltas D and written as local = parentBind^-1 * D * bind.

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const ARM_DOWN = 1.32; // T-pose -> arms hanging (slightly away from the hips)

export function makeSkinnedHumanoid(template, { height = 2.0, gunHand = 'RightHand', matte = false, recolor = null } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.rotation.order = 'YXZ'; root.add(body);
  const model = cloneSkinned(template);
  body.add(model);

  const bones = {};
  model.traverse(o => {
    if (o.isBone) bones[o.name.replace(/^mixamorig[:_]?/, '')] = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m && m.transparent && m.opacity > 0.9) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; }
      if (recolor) recolor(o);
      // Mixamo FBX materials arrive half-metallic and glossy, which glares under the lamps:
      // cloth and skin are dielectric and fairly matte (tuned once: materials are shared between clones)
      if (matte && m && m.opacity > 0.9 && !m.userData.tuned) {
        m.userData.tuned = true;
        m.metalness = 0; m.roughness = 0.82;
        if (m.isMeshPhysicalMaterial) { m.clearcoat = 0; m.sheen = 0; m.specularIntensity = 0.35; }
        m.envMapIntensity = 0.6;
        m.color.multiplyScalar(0.8);
      }
    }
  });
  // scale so the top of the head lands at `height`
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const s = height / (box.max.y - box.min.y);
  model.scale.multiplyScalar(s);
  model.position.y -= box.min.y * s;
  root.updateMatrixWorld(true);

  const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const bind = {};
  for (const [name, b] of Object.entries(bones)) {
    const Wb = rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
    const Wpb = rootInv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion()));
    bind[name] = { bone: b, Wb, A: Wpb.invert(), local: b.quaternion.clone(), pos: b.position.clone() };
  }
  // character-space "down" expressed in the hips' parent space, per world unit
  const hipsParent = bones.Hips.parent;
  const pInv = new THREE.Matrix4().copy(hipsParent.matrixWorld).invert();
  const a = new THREE.Vector3(0, 0, 0).applyMatrix4(pInv), b2 = new THREE.Vector3(0, 1, 0).applyMatrix4(pInv);
  const hipsUp = b2.sub(a);

  // gun in the hand, sized in world units
  const hand = bones[gunHand];
  const gun = new THREE.Group();
  const hs = hand.getWorldScale(new THREE.Vector3());
  gun.scale.setScalar(1 / hs.x);
  mesh(box3(0.05, 0.11, 0.07), GUN, 0, -0.02, 0, gun);
  mesh(box3(0.05, 0.06, 0.3), GUN, 0, 0.05, 0.1, gun);
  const g2 = new THREE.Group(); g2.add(gun); hand.add(g2);
  gun.rotation.set(-Math.PI / 2, 0, 0);
  gun.position.set(0, 0.06 / hs.x, 0.02 / hs.x);
  gun.children.forEach(c => (c.castShadow = true));

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; root.add(shadow);

  // proxy hierarchy that animateHumanoid writes into
  const P = () => new THREE.Object3D();
  const proxy = {
    root, body, hips: P(), torso: P(), neck: P(), head: P(),
    aL: { sh: P(), el: P() }, aR: { sh: P(), el: P() }, lL: { hp: P(), kn: P() }, lR: { hp: P(), kn: P() },
    gun, muzzle: new THREE.Object3D(), shadow, hand, facingAngle: 1.2,
    skin: { bind, hipsUp, model, scale: s },
  };
  proxy.headBone = bones.Head;
  proxy.gripHeight = measureGrip(proxy, hand);
  return proxy;
}

function box3(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

const C_L = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ARM_DOWN);
const C_R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ARM_DOWN);
const C_Li = C_L.clone().invert(), C_Ri = C_R.clone().invert();

function setBone(bind, name, D) {
  const k = bind[name];
  if (!k) return;
  k.bone.quaternion.copy(k.A).multiply(D).multiply(k.Wb);
}
const qe = (x, y, z) => _q.setFromEuler(_e.set(x, y, z, 'XYZ'));

export function applySkinned(r) {
  const { bind, hipsUp } = r.skin;
  // hips height (ducking) and spine / neck
  const hb = bind.Hips;
  hb.bone.position.copy(hb.pos).addScaledVector(hipsUp, (r.hips.position.y - 0.95));
  const tx = r.torso.rotation.x;
  setBone(bind, 'Spine', qe(tx * 0.5, 0, 0).clone());
  setBone(bind, 'Spine1', qe(tx * 0.5, 0, 0).clone());
  setBone(bind, 'Neck', qe(r.neck.rotation.x, 0, 0).clone());
  // arms: proxy aR (gun arm) -> RightArm, proxy aL -> LeftArm; z mirrored because sides swap
  const arm = (p, upper, fore, C, Ci) => {
    const S = new THREE.Quaternion().setFromEuler(_e.set(p.sh.rotation.x, 0, -p.sh.rotation.z, 'XYZ'));
    setBone(bind, upper, S.clone().multiply(C));
    const E = new THREE.Quaternion().setFromEuler(_e.set(p.el.rotation.x, 0, 0, 'XYZ'));
    setBone(bind, fore, Ci.clone().multiply(E).multiply(C));
  };
  arm(r.aR, 'RightArm', 'RightForeArm', C_R, C_Ri);
  arm(r.aL, 'LeftArm', 'LeftForeArm', C_L, C_Li);
  // legs
  const leg = (p, up, low) => {
    setBone(bind, up, _q2.setFromEuler(_e.set(p.hp.rotation.x, 0, -p.hp.rotation.z, 'XYZ')).clone());
    setBone(bind, low, _q2.setFromEuler(_e.set(p.kn.rotation.x, 0, 0, 'XYZ')).clone());
  };
  leg(r.lL, 'RightUpLeg', 'RightLeg');
  leg(r.lR, 'LeftUpLeg', 'LeftLeg');
  // grip: curl the gun-hand fingers
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) {
    const k = bind[`RightHand${f}${i}`];
    if (k) k.bone.quaternion.copy(k.local).multiply(_q2.setFromAxisAngle(AX_Z, 1.1));
  }
}
const AX_Z = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// Accessories built in character space (metres, +Z = facing) and bound to the head bone.
const HAT = std(0x0c0d10, { roughness: 0.92, envMapIntensity: 0.3 });
const BAND = std(0x0b0b0d, { roughness: 0.5 });
const BAND_GOLD = std(0xb8902a, { roughness: 0.35, metalness: 0.7 });
const LENS = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5 });
const FRAME = std(0x0a0a0a, { roughness: 0.3, metalness: 0.4 });

export function addHatAndShades(rig, { elite = false, headY = 1.78, faceZ = 0.115, scale = 1 } = {}) {
  const k = scale;
  const acc = new THREE.Group();
  // fedora: wide brim, tapered crown with a centre pinch, band
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.21 * k, 0.018 * k, 28), HAT);
  const crownGeo = new THREE.CylinderGeometry(0.118 * k, 0.14 * k, 0.16 * k, 24, 3);
  { // pinch the crown front-to-back and dent the top
    const pos = crownGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      pos.setZ(i, z * 0.96);
      if (y > 0.06 * k) pos.setY(i, y - Math.max(0, 0.016 * k - Math.abs(x) * 0.12));
    }
    crownGeo.computeVertexNormals();
  }
  const crown = new THREE.Mesh(crownGeo, HAT); crown.position.y = 0.085 * k;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142 * k, 0.142 * k, 0.03 * k, 24), elite ? BAND_GOLD : BAND); band.position.y = 0.027 * k;
  band.scale.z = 0.96;
  hat.add(brim, crown, band);
  hat.position.set(0, headY * k + 0.002 * k, -0.012 * k);
  hat.rotation.x = 0.1; // tipped down over the eyes
  acc.add(hat);
  // wraparound sunglasses
  const shades = new THREE.Group();
  for (const sx of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.058 * k, 0.034 * k, 0.012 * k), LENS);
    lens.position.set(sx * 0.038 * k, 0, 0); lens.rotation.y = sx * 0.12;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006 * k, 0.008 * k, 0.11 * k), FRAME);
    arm.position.set(sx * 0.098 * k, 0.008 * k, -0.06 * k);
    shades.add(lens, arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03 * k, 0.008 * k, 0.01 * k), FRAME); bridge.position.y = 0.01 * k;
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.14 * k, 0.008 * k, 0.012 * k), FRAME); brow.position.y = 0.018 * k;
  shades.add(bridge, brow);
  shades.position.set(0, 1.737 * k, faceZ * k);
  acc.add(shades);
  acc.traverse(o => { if (o.isMesh) o.castShadow = true; });
  bindToBone(rig, rig.headBone, acc);
  return acc;
}

// attach an object authored in character space to a bone, using the bind pose
function bindToBone(rig, bone, obj) {
  const bodyRot = rig.body.rotation.clone(); rig.body.rotation.set(0, 0, 0);
  rig.root.updateMatrixWorld(true);
  const local = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(rig.root.matrixWorld);
  rig.body.rotation.copy(bodyRot);
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(local);
  bone.add(obj);
}
