import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FH, HALF_W, SLAB, DEPTH, FRONT, CAR_H, SHAFT_W, LAMP_Y, ESC_LEN } from './config.js';
import * as TX from './textures.js';
import { GARAGE_CAR_X } from './level.js';

const BASE = import.meta.env.BASE_URL;
export const models = {};
export const pbrTex = {};
async function loadPBR() {
  const loader = new THREE.TextureLoader();
  const names = ['carpet', 'parquet', 'marble', 'garage', 'ceiling', 'roof', 'asphalt', 'concrete', 'metal'];
  const load = (url, srgb) => new Promise(res => loader.load(url, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));
  await Promise.all(names.map(async n => {
    const [diff, nor, arm] = await Promise.all([load(`${BASE}textures/${n}/diff.jpg`, true), load(`${BASE}textures/${n}/nor.jpg`), load(`${BASE}textures/${n}/arm.jpg`)]);
    pbrTex[n] = { diff, nor, arm };
  }));
}
function pbr(name, { repeat = 1, color = 0xffffff, rough = 1, normal = 1, metal = 0, fallback } = {}) {
  const t = pbrTex[name];
  if (!t || !t.diff) return fallback;
  const rep = (tex) => { if (!tex) return null; const c = tex.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
  return new THREE.MeshStandardMaterial({
    map: rep(t.diff), normalMap: rep(t.nor), roughnessMap: rep(t.arm), aoMap: rep(t.arm), aoMapIntensity: 0.8,
    normalScale: new THREE.Vector2(normal, normal), roughness: rough, metalness: metal, color,
  });
}

export async function loadModels() {
  await loadPBR();
  const loader = new GLTFLoader();
  const load = (n) => new Promise((res) => loader.load(`${BASE}models/${n}.glb`, g => res(g.scene), undefined, () => res(null)));
  const [car, tower, props, granny, agent] = await Promise.all([load('car'), load('watertower'), load('props'), load('granny'), load('agent')]);
  models.car = car; models.tower = tower; models.granny = granny; models.agent = agent;
  // the agent's glossy parts (shoes, belt, tie) should read as polished leather and silk, not mirrors
  if (agent) agent.traverse(o => { if (o.isMesh && o.material.name === 'AG_Gloss') { o.material.metalness = 0; o.material.roughness = 0.42; o.material.envMapIntensity = 0.5; } });
  if (props) props.traverse(o => { if (o.isMesh && o.material && o.material.name === 'Screen') o.material.emissiveIntensity = 0.25; });
  models.props = {};
  if (props) props.traverse(o => { if (['Desk', 'Chair', 'Plant', 'Cabinet', 'Cooler'].includes(o.name) && !models.props[o.name]) models.props[o.name] = o; });
}

// ---------- shared materials ----------
const M = {};
function initMaterials() {
  if (M.ready) return;
  const tex = (t, s = 1) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(s, s); return c; };
  M.carpet = pbr('carpet', { repeat: 0.8, color: 0x8a7f78, normal: 1.2, fallback: new THREE.MeshStandardMaterial({ map: TX.carpetTex(), roughness: 0.85, color: 0x8a8a8a }) });
  M.parquet = pbr('parquet', { repeat: 0.45, color: 0x5e4436, rough: 0.9, fallback: M.carpet });
  M.tile = pbr('marble', { repeat: 0.45, rough: 0.55, color: 0xd8d4cc, fallback: new THREE.MeshStandardMaterial({ map: TX.tileTex(), roughness: 0.55, color: 0x9a9a9a }) });
  M.concrete = pbr('garage', { repeat: 0.5, color: 0x9a9a9a, fallback: new THREE.MeshStandardMaterial({ map: TX.concreteTex(), roughness: 0.9 }) });
  M.ceiling = pbr('ceiling', { repeat: 0.6, color: 0xcfcac0, fallback: new THREE.MeshStandardMaterial({ map: TX.ceilingTex(), roughness: 0.9 }) });
  M.roof = pbr('roof', { repeat: 0.5, rough: 0.4, color: 0xb0b6c2, normal: 1.4, fallback: new THREE.MeshStandardMaterial({ map: TX.roofTex(), roughness: 0.6, metalness: 0.1 }) });
  M.edge = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4, metalness: 0.6 });
  M.neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.55, 0.75), toneMapped: false });
  M.neonPink = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.15, 0.55), toneMapped: false });
  M.facade = new THREE.MeshStandardMaterial({ map: TX.facadeTex(), roughness: 0.8, emissiveMap: TX.facadeTex(), emissive: 0x806040, emissiveIntensity: 0.6 });
  M.shaftBack = pbr('concrete', { repeat: 0.5, color: 0x3a3c42, fallback: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9, map: TX.concreteTex() }) });
  M.shaftSide = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 });
  M.rail = new THREE.MeshStandardMaterial({ color: 0x777b82, roughness: 0.3, metalness: 0.9 });
  M.cable = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.8 });
  M.rope = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.85, emissive: 0x2a2418 });
  M.hookMetal = new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.2, metalness: 1, emissive: 0x1a1d22 });
  M.carFrame = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.3, metalness: 0.9 });
  M.carPanel = new THREE.MeshStandardMaterial({ map: TX.woodPanelTex(), roughness: 0.5 });
  M.carFloor = pbr('metal', { repeat: 1, metal: 0.8, rough: 0.7, color: 0x9a9a9a, fallback: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 }) });
  M.carLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.55, 1.25), toneMapped: false });
  M.indOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.5, 0.6), toneMapped: false });
  M.indOff = new THREE.MeshStandardMaterial({ color: 0x0c140e, roughness: 0.3 });
  M.doorFrame = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.4, metalness: 0.3 });
  M.doorBlue = new THREE.MeshStandardMaterial({ color: 0x2b4f9a, roughness: 0.45, metalness: 0.15 });
  M.doorRed = new THREE.MeshStandardMaterial({ color: 0xc0101e, roughness: 0.35, metalness: 0.15, emissive: 0x500006, emissiveIntensity: 1 });
  M.doorDone = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5 });
  M.doorVoid = new THREE.MeshBasicMaterial({ color: 0x000000 });
  M.knob = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.25 });
  M.redBulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1), toneMapped: false });
  M.greenBulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 0.4), toneMapped: false });
  M.offBulb = new THREE.MeshStandardMaterial({ color: 0x220806 });
  M.lampShade = new THREE.MeshStandardMaterial({ color: 0x1f4a32, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
  M.bulbOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.2), toneMapped: false });
  M.bulbOff = new THREE.MeshStandardMaterial({ color: 0x333028, roughness: 0.3 });
  M.lightCone = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.82, 0.55) }, uStrength: { value: 0.3 }, uTime: { value: 0 } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vH = uv.y; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; uniform float uTime; varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float rim = pow(abs(dot(vN, vV)), 1.6);
        float haze = 0.75 + 0.5 * n3(vW * 1.3 + vec3(0.0, -uTime * 0.25, uTime * 0.1));
        float fall = vH * vH * (0.6 + 0.4 * vH);
        gl_FragColor = vec4(uColor * uStrength * fall * rim * haze, 1.0);
      }`,
  });
  M.glass = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `
      uniform float uTime; uniform float uFlash; varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
      float layer(vec2 uv, float t){
        vec2 a = vec2(3.0, 1.0);
        vec2 g = uv * a;
        float col = floor(g.x);
        g.y += h21(vec2(col, 7.1)) * 7.0;
        vec2 id = floor(g); vec2 st = fract(g) - vec2(0.5, 0.0);
        float n = h21(id);
        float ti = fract(t * (0.15 + n * 0.2) + n);
        float y = 1.0 - ti;
        float x = (n - 0.5) * 0.6 + sin(uv.y * 3.0 + n * 6.0) * 0.05;
        vec2 d = (st - vec2(x, y)) / a.yx;
        float drop = smoothstep(0.06, 0.0, length(d * vec2(1.0, 0.7)));
        float trail = smoothstep(0.035, 0.0, abs(st.x - x)) * smoothstep(y, y + 0.6, st.y) * (1.0 - st.y) * 0.5;
        return drop + trail * step(y, st.y);
      }
      float statics(vec2 uv){
        vec2 id = floor(uv * 9.0); vec2 st = fract(uv * 9.0) - 0.5;
        float n = h21(id);
        vec2 o = vec2(h21(id + 3.1), h21(id + 9.7)) - 0.5;
        return smoothstep(0.09 * n, 0.0, length(st - o * 0.7)) * step(0.55, n);
      }
      void main(){
        vec2 uv = vW.xy * 0.35;
        float m = layer(uv, uTime) + layer(uv * 1.6 + 3.7, uTime * 1.1) * 0.7 + statics(uv);
        vec3 c = vec3(0.55, 0.65, 0.85) * m * (0.45 + uFlash * 2.0);
        gl_FragColor = vec4(c + vec3(0.02, 0.03, 0.06), 0.18 + m * 0.35);
      }`,
  });
  M.beam = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uStrength: { value: 0.05 } },
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uStrength; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.45, 0.58, 0.95) * uStrength * vA * vA, 1.0); }',
  });
  M.escSteel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
  M.escStep = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.7 });
  M.escRail = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  M.escGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.2), toneMapped: false });
  M.parapet = new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.85, map: TX.concreteTex() });
  M.asphalt = pbr('asphalt', { repeat: 1, rough: 0.35, color: 0x6a6d74, normal: 1.3, fallback: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.25, metalness: 0.2 }) });
  M.garageDoor = new THREE.MeshStandardMaterial({ color: 0x6d6f73, roughness: 0.5, metalness: 0.7 });
  M.pillar = pbr('concrete', { repeat: 0.6, color: 0xb0b0b0, fallback: new THREE.MeshStandardMaterial({ map: TX.concreteTex(), color: 0x9a9a9a, roughness: 0.9 }) });
  M.yellow = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.6 });
  M.ac = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.5, metalness: 0.6 });
  M.red = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.1, 0.1), toneMapped: false });
  M.neighbor = new THREE.MeshStandardMaterial({ map: TX.facadeTex(), emissiveMap: TX.facadeTex(), emissive: 0xa07850, emissiveIntensity: 0.5, roughness: 0.8 });
  M.label = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.9 });
  M.ready = true;
}

function boxMesh(w, h, d, mat, x, y, z, parent, uvScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) TX.worldUV(g, uvScale);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------- the building ----------
export class World {
  constructor(scene, level) {
    initMaterials();
    this.scene = scene;
    this.level = level;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];      // per shaft visuals
    this.lampObjs = [];
    this.doorObjs = [];
    this.indicators = []; // {shaft, f, mesh}
    this.blinkers = [];
    this.windowList = [];
    this.build();
  }

  build() {
    const { N, shafts, doors, lamps, escalators, deco } = this.level;
    const G = this.group;

    // floor slabs (with holes for shafts)
    for (let f = 0; f <= N; f++) {
      const holes = shafts.filter(s => f > s.minF && f <= s.maxF).map(s => [s.x - SHAFT_W / 2, s.x + SHAFT_W / 2]).sort((a, b) => a[0] - b[0]);
      let x0 = -HALF_W - 1.6;
      const segs = [];
      for (const [a, b] of holes) { segs.push([x0, a]); x0 = b; }
      segs.push([x0, HALF_W + 1.6]);
      const top = f === N ? M.roof : f === 0 ? M.concrete : f >= N - 3 ? M.parquet : (f % 5 === 0 ? M.tile : M.carpet);
      const mats = [M.edge, M.edge, top, M.ceiling, M.edge, M.edge];
      for (const [a, b] of segs) {
        if (b - a < 0.05) continue;
        const g = new THREE.BoxGeometry(b - a, SLAB, DEPTH + FRONT);
        TX.worldUV(g, 0.5);
        const m = new THREE.Mesh(g, mats);
        m.position.set((a + b) / 2, f * FH - SLAB / 2, (FRONT - DEPTH) / 2);
        G.add(m);
        if (f > 0) boxMesh(b - a, 0.025, 0.025, f === N ? M.neonPink : M.neon, (a + b) / 2, f * FH - SLAB + 0.02, FRONT - 0.02, G);
      }
    }
    // foundation under the garage
    boxMesh(HALF_W * 2 + 3.2, 6, DEPTH + FRONT, M.concrete, 0, -SLAB - 3, (FRONT - DEPTH) / 2, G, 0.3);

    // back walls, floor numbers
    const winSlots = [];
    for (let k = 0; k < 8; k++) winSlots.push(-19.25 + k * 5.5);
    for (let f = 0; f < N; f++) {
      const wallH = FH - SLAB;
      let tex;
      if (f === 0) tex = TX.garageWallTex(HALF_W * 2, wallH);
      else {
        const wins = winSlots.filter(x =>
          doors.every(d => d.f !== f || Math.abs(d.x - x) > 2.4) &&
          shafts.every(s => !(f >= s.minF && f <= s.maxF) || Math.abs(s.x - x) > SHAFT_W / 2 + 1.4) &&
          deco.every(d => d.f !== f || d.kind === 'Chair' || Math.abs(d.x - x) > 1.6));
        tex = TX.wallTex(f % 4, HALF_W * 2, wallH, wins);
        for (const wx of wins) this.windowList.push([wx, f]);
      }
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, wallH), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.8 }));
      wall.position.set(0, f * FH + wallH / 2, -DEPTH);
      G.add(wall);
      // glass reflection layer
      const label = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), M.label(TX.labelTex(f === 0 ? 'G' : String(f), { color: 'rgba(235,225,200,0.75)' })));
      label.position.set(-HALF_W + 1.5, f * FH + 2.75, -DEPTH + 0.03);
      G.add(label);
      // side interior walls
      for (const sx of [-1, 1]) boxMesh(0.3, wallH, DEPTH, M.edge, sx * (HALF_W + 0.15), f * FH + wallH / 2, -DEPTH / 2, G);
    }

    // exterior side walls of the tower
    const towerH = N * FH + SLAB;
    for (const sx of [-1, 1]) {
      const bottom = sx > 0 ? FH - SLAB - 0.4 : -SLAB - 1.2; // right wall leaves the garage exit open
      const top = N * FH;
      const g = new THREE.BoxGeometry(1.3, top - bottom, DEPTH + FRONT + 1);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * ((top - bottom) / 8));
      const m = new THREE.Mesh(g, M.facade);
      m.position.set(sx * (HALF_W + 0.95), (top + bottom) / 2, (FRONT - DEPTH) / 2 - 0.3);
      G.add(m);
    }
    void towerH;
    // garage opening on the right: cut handled by a dark door panel that rises
    this.garageDoor = boxMesh(0.2, FH - SLAB - 0.4, DEPTH - 0.8, M.garageDoor, HALF_W + 1.65, (FH - SLAB - 0.4) / 2, -DEPTH / 2, G);
    for (let i = 0; i < 8; i++) boxMesh(0.24, 0.04, DEPTH - 0.8, M.edge, 0, -1.3 + i * 0.42, 0, this.garageDoor);

    this.buildGlass();
    this.buildBeams();
    this.buildShafts();
    this.buildDoors();
    this.buildLamps();
    this.buildEscalators();
    this.buildDeco();
    this.buildRoof();
    this.buildGarage();
    this.buildNeighbors();
    this.setupShadows();
  }

  setupShadows() {
    this.group.traverse(o => {
      if (!o.isMesh || o.userData.noShadow) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const lit = mats.every(m => m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.transparent);
      if (!lit) return;
      o.receiveShadow = true;
      o.castShadow = !(o.geometry.type === 'PlaneGeometry');
    });
  }

  // one tall pane of rainy glass behind every back wall: visible only through the window holes
  buildGlass() {
    const N = this.level.N;
    const h = N * FH;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, h), M.glass);
    m.position.set(0, h / 2, -DEPTH - 0.06);
    m.renderOrder = 2;
    this.group.add(m);
  }

  // faint moonlight sheets falling through each window onto the floor
  buildBeams() {
    const pos = [], alpha = [];
    for (const [x, f] of this.windowList) {
      const y = f * FH;
      const A = [x - 1.2, y + 3.3, -DEPTH + 0.05], B = [x + 1.2, y + 3.3, -DEPTH + 0.05];
      const C = [x + 1.6, y + 0.02, -0.4], D = [x - 1.6, y + 0.02, -0.4];
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      alpha.push(1, 1, 0, 1, 0, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('a', new THREE.Float32BufferAttribute(alpha, 1));
    const m = new THREE.Mesh(g, M.beam);
    m.frustumCulled = false;
    this.group.add(m);
  }

  buildShafts() {
    const { N } = this.level;
    for (const s of this.level.shafts) {
      const G = this.group;
      const y0 = s.minF * FH, y1 = (s.maxF + 1) * FH - SLAB;
      const h = y1 - y0;
      boxMesh(SHAFT_W, h, 0.1, M.shaftBack, s.x, y0 + h / 2, -DEPTH + 0.06, G, 0.4);
      for (const sx of [-1, 1]) {
        boxMesh(0.08, h, DEPTH * 0.45, M.shaftSide, s.x + sx * SHAFT_W / 2, y0 + h / 2, -DEPTH * 0.75, G);
        boxMesh(0.08, h, 0.08, M.rail, s.x + sx * (SHAFT_W / 2 - 0.12), y0 + h / 2, -2.6, G);
      }
      // indicator lights next to the shaft on every floor it serves
      for (let f = s.minF; f <= Math.min(s.maxF, N - 1); f++) {
        boxMesh(0.36, 0.5, 0.06, M.doorFrame, s.x + SHAFT_W / 2 + 0.45, f * FH + 2.75, -DEPTH + 0.05, G);
        const ind = boxMesh(0.2, 0.12, 0.04, M.indOff, s.x + SHAFT_W / 2 + 0.45, f * FH + 2.75, -DEPTH + 0.1, G);
        this.indicators.push({ shaft: s, f, mesh: ind });
      }
      // motor housing when the shaft reaches the roof
      if (s.maxF === N) {
        const hy = N * FH, hh = CAR_H + 1.2;
        boxMesh(SHAFT_W + 0.6, 0.3, DEPTH, M.parapet, s.x, hy + hh, -DEPTH / 2, G, 0.4);
        boxMesh(SHAFT_W + 0.6, hh, 0.3, M.parapet, s.x, hy + hh / 2, -DEPTH + 0.15, G, 0.4);
        for (const sx of [-1, 1]) boxMesh(0.3, hh, DEPTH - 1.2, M.parapet, s.x + sx * (SHAFT_W / 2 + 0.15), hy + hh / 2, -DEPTH / 2 - 0.6, G, 0.4);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), M.label(TX.labelTex('LIFT', { w: 256, h: 64, font: 'bold 48px Impact', color: '#9ef' })));
        sign.position.set(s.x, hy + hh + 0.5, -DEPTH + 0.5); G.add(sign);
      }
      // car
      const car = new THREE.Group();
      const W = SHAFT_W - 0.16, D = DEPTH - 1.2;
      const cz = -DEPTH + 0.3 + D / 2;
      boxMesh(W, 0.22, D, M.carFloor, 0, -0.11, cz, car);
      boxMesh(W, 0.2, D, M.carFrame, 0, CAR_H + 0.1, cz, car);
      boxMesh(W - 0.1, 0.06, D - 0.3, M.carLight, 0, CAR_H - 0.02, cz, car);
      boxMesh(W, CAR_H, 0.08, M.carPanel, 0, CAR_H / 2, cz - D / 2, car);
      for (const sx of [-1, 1]) {
        boxMesh(0.1, CAR_H, 0.1, M.carFrame, sx * (W / 2 - 0.05), CAR_H / 2, cz + D / 2 - 0.05, car);
        boxMesh(0.1, CAR_H, 0.1, M.carFrame, sx * (W / 2 - 0.05), CAR_H / 2, cz - D / 2 + 0.05, car);
        boxMesh(0.06, CAR_H, D * 0.6, M.carPanel, sx * (W / 2 - 0.03), CAR_H / 2, cz - D * 0.2, car);
      }
      boxMesh(W - 0.3, 0.05, 0.05, M.carFrame, 0, 1.0, cz - D / 2 + 0.12, car); // handrail
      boxMesh(0.5, 0.25, 0.4, M.edge, 0.4, CAR_H + 0.32, cz - 0.3, car); // hatch / pulley
      const cable = boxMesh(0.05, 1, 0.05, M.cable, 0, 0, cz - 0.3, G);
      const weight = boxMesh(0.5, 1.6, 0.25, M.edge, s.x - SHAFT_W / 2 + 0.45, 0, -DEPTH + 0.3, G);
      car.position.set(s.x, 0, 0);
      G.add(car);
      this.cars.push({ shaft: s, group: car, cable, weight, cz, top: (s.maxF + 1) * FH - SLAB });
    }
  }

  buildDoors() {
    for (const d of this.level.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, d.f * FH, -DEPTH + 0.02);
      boxMesh(1.75, 2.85, 0.14, M.doorFrame, 0, 1.425, 0.05, g);
      boxMesh(1.35, 2.55, 0.02, M.doorVoid, 0, 1.275, 0.13, g);
      const hinge = new THREE.Group(); hinge.position.set(-0.675, 0, 0.16); g.add(hinge);
      const panel = boxMesh(1.35, 2.55, 0.07, d.red ? M.doorRed : M.doorBlue, 0.675, 1.275, 0, hinge);
      boxMesh(0.08, 0.08, 0.08, M.knob, 1.2, 1.2, 0.07, hinge);
      boxMesh(0.9, 1.0, 0.02, d.red ? M.doorRed : M.doorBlue, 0.675, 1.75, 0.045, hinge).scale.set(1, 1, 1);
      const bulb = boxMesh(0.3, 0.14, 0.1, d.red ? M.redBulb : M.offBulb, 0, 3.0, 0.12, g);
      this.group.add(g);
      this.doorObjs[d.id] = { door: d, group: g, hinge, panel, bulb, open: 0, target: 0 };
    }
  }
  setDoorState(id, state) { // 'open' | 'closed' | 'done'
    const o = this.doorObjs[id];
    if (state === 'open') o.target = 1;
    else o.target = 0;
    if (state === 'done') {
      o.panel.material = M.doorDone;
      o.hinge.children.forEach(c => { if (c.material === M.doorRed) c.material = M.doorDone; });
      o.bulb.material = M.greenBulb;
    }
  }

  buildLamps() {
    const coneGeo = new THREE.CylinderGeometry(0.25, 2.7, LAMP_Y - 0.15, 24, 1, true);
    coneGeo.translate(0, -(LAMP_Y - 0.15) / 2, 0);
    // uv.y = 1 at top for the shader fade
    const shadeGeo = new THREE.CylinderGeometry(0.12, 0.5, 0.35, 16, 1, true);
    for (const l of this.level.lamps) {
      const g = new THREE.Group();
      const ceil = (l.f + 1) * FH - SLAB;
      g.position.set(l.x, l.f * FH + LAMP_Y, -1.6);
      const cord = boxMesh(0.03, ceil - (l.f * FH + LAMP_Y), 0.03, M.cable, 0, (ceil - (l.f * FH + LAMP_Y)) / 2 + 0.15, 0, g);
      const shade = new THREE.Mesh(shadeGeo, M.lampShade); shade.position.y = 0.12; shade.userData.noShadow = true; g.add(shade);
      cord.userData.noShadow = true;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), M.bulbOn); bulb.position.y = -0.02; g.add(bulb);
      // the beam is flattened in depth and pushed behind the walking lane so it never hazes over characters
      const cone = new THREE.Mesh(coneGeo, M.lightCone); cone.position.set(0, -0.05, -0.75); cone.scale.z = 0.3; g.add(cone);
      this.group.add(g);
      this.lampObjs[l.id] = { lamp: l, group: g, cord, bulb, cone, baseY: g.position.y };
    }
  }

  buildEscalators() {
    for (const e of this.level.escalators) {
      const g = new THREE.Group();
      const y0 = e.f * FH, y1 = (e.f + 1) * FH;
      const dx = e.xTop - e.xBottom;
      const len = Math.hypot(dx, FH);
      const ang = Math.atan2(FH, dx);
      const mx = (e.xTop + e.xBottom) / 2, my = (y0 + y1) / 2;
      const z = -3.0;
      for (const sz of [-0.75, 0.75]) {
        const side = boxMesh(len + 1.2, 0.9, 0.1, M.escSteel, mx, my - 0.3, z + sz, g);
        side.rotation.z = ang > Math.PI / 2 ? ang - Math.PI : ang;
        const rail = boxMesh(len + 1.4, 0.08, 0.14, M.escRail, mx, my + 0.65, z + sz, g);
        rail.rotation.z = side.rotation.z;
        const glow = boxMesh(len + 1, 0.03, 0.04, M.escGlow, mx, my - 0.73, z + sz + Math.sign(sz) * 0.06, g);
        glow.rotation.z = side.rotation.z;
      }
      const steps = Math.floor(len / 0.4);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        boxMesh(0.42, 0.06, 1.4, M.escStep, e.xBottom + dx * t, y0 + FH * t - 0.03, z, g);
      }
      // landings arrows on the floor
      for (const [x, y] of [[e.xBottom, y0], [e.xTop, y1]]) boxMesh(1.4, 0.02, 1.4, M.escStep, x, y + 0.01, z, g);
      this.group.add(g);
    }
  }

  buildDeco() {
    for (const d of this.level.deco) {
      const src = models.props[d.kind];
      if (!src) continue;
      const m = src.clone();
      m.position.set(d.x, d.f * FH, -DEPTH + (d.kind === 'Desk' ? 0.7 : d.kind === 'Chair' ? 1.4 : 0.45));
      if (d.kind === 'Chair') m.rotation.y = Math.PI;
      this.group.add(m);
    }
  }

  buildRoof() {
    const { N, shafts } = this.level;
    const y = N * FH, G = this.group;
    for (const sx of [-1, 1]) boxMesh(0.5, 1.0, DEPTH + FRONT, M.parapet, sx * (HALF_W + 1.3), y + 0.5, (FRONT - DEPTH) / 2, G, 0.4);
    boxMesh(HALF_W * 2 + 3, 1.0, 0.4, M.parapet, 0, y + 0.5, -DEPTH - 0.1, G, 0.4);
    const free = (x, w) => shafts.every(s => s.maxF < N || Math.abs(s.x - x) > SHAFT_W / 2 + w);
    const xs = [12, 6, -6, 0, 18, -12];
    const tx = xs.find(x => free(x, 2.5)) ?? 12;
    if (models.tower) { const t = models.tower.clone(); t.position.set(tx, y, -3.4); t.scale.setScalar(0.85); G.add(t); }
    // antenna with blinking light
    const ax = -HALF_W + 3;
    boxMesh(0.12, 9, 0.12, M.rail, ax, y + 4.5, -4.2, G);
    for (let i = 1; i < 6; i++) boxMesh(0.9 - i * 0.12, 0.05, 0.05, M.rail, ax, y + i * 1.5, -4.2, G);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M.red); blink.position.set(ax, y + 9.1, -4.2); G.add(blink);
    this.blinkers.push(blink);
    // AC units
    for (const x of [-8, 3, 16]) if (free(x, 1.5) && Math.abs(x - tx) > 3) {
      boxMesh(2.0, 1.2, 1.6, M.ac, x, y + 0.6, -3.6, G);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20), M.edge); fan.position.set(x, y + 1.23, -3.6); G.add(fan);
    }
    // neon sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: TX.neonSignTex('MERIDIAN TOWER'), transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.9, 1.9, 1.9) }));
    sign.position.set(-2, y + 6.8, -DEPTH - 0.4); G.add(sign);
    this.neonSign = sign;
    for (const x of [-7.5, 3.5]) boxMesh(0.15, 5.5, 0.15, M.rail, x, y + 2.8, -DEPTH - 0.5, G);
    boxMesh(12, 0.12, 0.12, M.rail, -2, y + 5.1, -DEPTH - 0.5, G);
    // floodlights so the rooftop is readable
    for (const fx of [-14, 6]) {
      const L = new THREE.SpotLight(0xcfe0ff, 420, 40, 0.8, 0.7, 1.3);
      L.position.set(fx, y + 9, 2); L.target.position.set(fx + 2, y, -2);
      G.add(L, L.target);
    }
    // helipad marking
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), M.label(TX.labelTex('H', { w: 128, h: 128, font: 'bold 110px Impact', color: 'rgba(230,200,40,0.7)' })));
    hp.rotation.x = -Math.PI / 2; hp.position.set(-12, y + 0.01, -2.2); G.add(hp);
  }

  buildGarage() {
    const G = this.group;
    for (const x of [-11, 0, 11]) {
      if (this.level.shafts.some(s => s.minF === 0 && Math.abs(s.x - x) < SHAFT_W)) continue;
      boxMesh(0.7, FH - SLAB, 0.7, M.pillar, x, (FH - SLAB) / 2, -DEPTH + 0.6, G, 0.5);
      boxMesh(0.72, 0.5, 0.72, M.yellow, x, 0.25, -DEPTH + 0.6, G);
    }
    for (let x = -19; x <= 19; x += 4) boxMesh(0.1, 0.01, 2.5, M.yellow, x, 0.006, -DEPTH + 1.6, G);
    if (models.car) {
      const c = models.car.clone();
      c.position.set(GARAGE_CAR_X, 0, -1.7);
      G.add(c);
      this.getaway = c;
      const light = new THREE.SpotLight(0xfff0d0, 0, 30, 0.5, 0.5, 1.5);
      light.position.set(2.2, 0.6, 0); light.target.position.set(12, 0, 0);
      c.add(light, light.target);
      this.headlight = light;
    }
    // street outside
    const stGeo = new THREE.PlaneGeometry(400, 60);
    { const uv = stGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 100, uv.getY(i) * 15); }
    const st = new THREE.Mesh(stGeo, M.asphalt);
    st.rotation.x = -Math.PI / 2; st.position.set(0, -0.02, -20); G.add(st);
    const walk = boxMesh(400, 0.2, 3, M.concrete, 0, 0.1, 3.5, G, 0.5);
    for (let x = 30; x < 120; x += 16) {
      boxMesh(0.15, 6, 0.15, M.rail, x, 3, 4.3, G);
      boxMesh(1.2, 0.1, 0.25, M.rail, x - 0.5, 6, 4.3, G);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.bulbOn); b.position.set(x - 1, 5.9, 4.3); G.add(b);
    }
    walk.position.x = 0;
  }

  buildNeighbors() {
    const { N } = this.level, G = this.group;
    const top = N * FH;
    const mk = (x0, x1, h, z0, z1) => {
      const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / 3.5, uv.getY(i) * h / 7);
      const m = new THREE.Mesh(g, M.neighbor);
      m.position.set((x0 + x1) / 2, h / 2 - 1, (z0 + z1) / 2);
      G.add(m);
      return m;
    };
    mk(-52, -34, top + 4.6, -12, -3);   // zipline origin tower (left)
    mk(31, 52, top - 14, -22, -4);
    mk(-30, -26, top - 30, -40, -30);
    mk(54, 80, top + 2, -40, -18);
    // ledge on the left tower for the zipline start
    boxMesh(4, 0.3, 3, M.parapet, -34.5, top + 3.6, -1.4, G);
    boxMesh(0.2, 3, 0.2, M.rail, -33.4, top + 5.1, -0.9, G);
    boxMesh(0.2, 3, 0.2, M.rail, -17.6, top + 1.5, -0.9, G);
    this.ledgeY = top + 3.75;
    this.zipStart = new THREE.Vector3(-33.4, top + 6.5, -0.9);   // rope tied off at the ledge post
    this.zipEnd = new THREE.Vector3(-17.6, top + 3.0, -0.9);     // hook caught on the roof railing post
    // grappling hook
    const hook = new THREE.Group();
    boxMesh(0.07, 0.5, 0.07, M.hookMetal, 0, 0, 0, hook);
    boxMesh(0.14, 0.06, 0.14, M.hookMetal, 0, 0.27, 0, hook);
    const prongGeo = new THREE.TorusGeometry(0.16, 0.03, 6, 10, Math.PI * 0.75);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(prongGeo, M.hookMetal);
      const a = (i / 3) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.16, -0.24, Math.sin(a) * 0.16);
      p.rotation.set(0, -a, Math.PI * 0.6);
      hook.add(p);
    }
    hook.castShadow = true;
    G.add(hook);
    this.hook = hook;
    this.rope = new THREE.Mesh(new THREE.BufferGeometry(), M.rope);
    this.rope.castShadow = true;
    this.rope.userData.noShadow = true;
    G.add(this.rope);
    this.setRope([this.zipStart, this.zipEnd]);
    this.placeHook(this.zipEnd, 0);
  }

  // rope through a list of points; an optional sag pulls the midpoint down (slack rope)
  setRope(points, sag = 0) {
    let curve;
    if (points.length === 2 && sag > 0.01) {
      const [a, b] = points;
      const mid = a.clone().lerp(b, 0.5); mid.y -= sag * 2;
      curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    } else {
      curve = new THREE.CurvePath();
      for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(points[i].clone(), points[i + 1].clone()));
    }
    this.rope.geometry.dispose();
    this.rope.geometry = new THREE.TubeGeometry(curve, points.length > 2 ? 8 : 28, 0.035, 5, false);
  }
  placeHook(pos, spin, landed = true) {
    this.hook.position.copy(pos);
    if (landed) this.hook.rotation.set(0, 0, -0.5);   // hanging over the post, prongs gripping
    else this.hook.rotation.set(spin * 0.7, 0, spin);
  }

  // ---- per-frame updates ----
  update(dt, t, game) {
    for (const c of this.cars) {
      const y = c.shaft.carY;
      c.group.position.y = y;
      const cy = y + CAR_H + 0.45;
      c.cable.scale.y = Math.max(0.01, c.top - cy);
      c.cable.position.set(c.shaft.x + 0.0, (c.top + cy) / 2, c.cz - 0.3);
      // counterweight moves opposite the car
      const span = c.top - c.shaft.minF * FH;
      c.weight.position.y = c.top - (y - c.shaft.minF * FH) - 1.0;
      if (c.weight.position.y < c.shaft.minF * FH + 0.8) c.weight.position.y = c.shaft.minF * FH + 0.8;
      void span;
    }
    for (const ind of this.indicators) {
      const s = ind.shaft;
      const here = Math.abs(s.carY - ind.f * FH) < 0.05 && s.stopped;
      const m = here ? M.indOn : M.indOff;
      if (ind.mesh.material !== m) ind.mesh.material = m;
    }
    for (const o of this.doorObjs) {
      if (!o) continue;
      o.open += (o.target - o.open) * Math.min(1, dt * 8);
      o.hinge.rotation.y = -o.open * 1.6;
    }
    for (const b of this.blinkers) b.visible = (t % 1.6) < 0.5;
    M.glass.uniforms.uTime.value = t;
    M.lightCone.uniforms.uTime.value = t;
    const flash = game.lightningLevel || 0;
    M.glass.uniforms.uFlash.value = flash;
    M.beam.uniforms.uStrength.value = 0.045 + flash * 0.5;
    if (this.neonSign) {
      const fl = Math.sin(t * 37) > 0.97 || (t % 7 > 6.7 && Math.random() < 0.5);
      this.neonSign.material.opacity = fl ? 0.25 : 1;
    }
  }

  lampFell(id) {
    const o = this.lampObjs[id];
    o.cone.visible = false;
    o.bulb.material = M.bulbOff;
    o.cord.visible = false;
  }
  setLampY(id, y, rot) {
    const o = this.lampObjs[id];
    o.group.position.y = y;
    o.group.rotation.z = rot;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      }
    });
  }
}

// ---------- persistent environment: sky, skyline, rain ----------
export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), new THREE.MeshBasicMaterial({ map: TX.skyGradientTex(), depthWrite: false }));
    sky.position.set(0, 0, -400);
    this.sky = sky;
    const stars = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), new THREE.MeshBasicMaterial({ map: TX.starsTex(), transparent: true, depthWrite: false, toneMapped: false }));
    stars.position.set(0, 20, -399);
    this.stars = stars;
    this.layers = [];
    const mkLayer = (seed, color, lit, z, w, h, factor, yBase, h0, h1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: TX.skylineTex(seed, color, lit, h0, h1), transparent: true, depthWrite: false, fog: false }));
      m.position.z = z;
      this.layers.push({ m, factor, yBase, h });
      this.group.add(m);
    };
    this.group.add(sky, stars);
    mkLayer(101, '#0a0c16', 0.18, -330, 1100, 400, 0.92, -10, 0.25, 0.85);
    mkLayer(202, '#06070d', 0.22, -200, 640, 260, 0.85, -12, 0.25, 0.9);
    mkLayer(303, '#030308', 0.3, -110, 360, 160, 0.7, -8, 0.3, 0.95);

    // rain
    const COUNT = 2600;
    const pos = new Float32Array(COUNT * 6);
    const base = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      base[i * 3] = (Math.random() - 0.5) * 90;
      base[i * 3 + 1] = Math.random() * 50;
      base[i * 3 + 2] = Math.random() < 0.6 ? -6 - Math.random() * 20 : -5 + Math.random() * 14;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainBase = base; this.rainCount = COUNT;
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uRoof: { value: 1e9 }, uAlpha: { value: 0.16 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform float uRoof; uniform float uAlpha; varying vec3 vW; void main(){ if (vW.z > -5.3 && abs(vW.x) < 23.7 && vW.y < uRoof) discard; gl_FragColor = vec4(0.6,0.7,0.9,uAlpha); }',
    });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.rainT = 0;
    this.flash = 0;
  }

  update(dt, camera, roofY) {
    const cy = camera.position.y, cx = camera.position.x;
    for (const L of this.layers) L.m.position.set(cx * 0.9, L.yBase + cy * L.factor + L.h / 2 - 30, L.m.position.z);
    this.sky.position.set(cx, cy * 0.98, -400);
    this.stars.position.set(cx, cy * 0.98 + 40, -399);
    this.rainT += dt;
    const pos = this.rain.geometry.attributes.position.array;
    const b = this.rainBase;
    const fall = this.rainT * 38;
    for (let i = 0; i < this.rainCount; i++) {
      const x = b[i * 3] + cx + this.rainT * -4 % 90;
      let y = (b[i * 3 + 1] - fall) % 50; if (y < 0) y += 50;
      y += cy - 25;
      const z = b[i * 3 + 2];
      const xx = ((x - cx + 45) % 90 + 90) % 90 - 45 + cx;
      pos[i * 6] = xx; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = xx + 0.12; pos[i * 6 + 4] = y + 0.9; pos[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rainMat.uniforms.uRoof.value = roofY;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 3);
    this.sky.material.color.setScalar(1 + this.flash * 3);
  }
}
