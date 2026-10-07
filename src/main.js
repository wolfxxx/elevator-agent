import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CAMERA_FOV } from './config.js';
import { loadModels } from './world.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const LOW = params.has('low'); // ?low disables the expensive passes

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020308);
scene.fog = new THREE.Fog(0x05060c, 60, 220);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, innerWidth / innerHeight, 0.5, 1200);

// HDR, multisampled render target so geometry edges stay smooth through post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));

let gtao = null;
if (!LOW) {
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 2.0, scale: 1.25, samples: 12, distanceFallOff: 1.0 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  // keep translucent effects (light cones, glows, particles, labels) out of the occlusion buffers
  gtao.overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverse(o => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || o.isInstancedMesh) { o.visible = false; return; }
      const m = o.material;
      if (m && !Array.isArray(m) && (m.transparent || m.isShaderMaterial || (m.isMeshBasicMaterial && m.toneMapped === false))) o.visible = false;
    });
  };
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 1.5);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      float ca = 0.0022 * dot(c, c) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // split-tone: teal shadows, warm highlights (linear HDR, before tone mapping)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.86, 1.0, 1.12), highTint = vec3(1.1, 1.0, 0.88);
      col *= mix(shadowTint, highTint, smoothstep(0.02, 0.6, l));
      float vig = smoothstep(1.0, 0.28, length(c * vec2(1.0, 0.9)));
      col *= mix(0.45, 1.0, vig);
      col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * 0.03 * (0.4 + l);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  grade.uniforms.uRes.value.set(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

await loadModels();
if (document.fonts) { try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch { /* ignore */ } }
const input = new Input();
const hud = new HUD();
const game = new Game({ scene, camera, input, hud });
window.__game = game;
document.getElementById('loading').classList.add('done');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  grade.uniforms.uTime.value = now / 1000;
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
