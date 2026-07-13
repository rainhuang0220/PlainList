<template>
  <div ref="rootEl" class="relief3d-root">
    <div ref="plateEl" class="relief3d-plate">
      <canvas ref="canvasEl" class="relief3d-canvas"></canvas>
      <div class="relief3d-labels" :class="{ shown: labelsShown }">
        <div
          v-for="item in labels"
          :key="item.id"
          class="relief3d-label"
          :class="item.done ? 'on-dark' : 'on-light'"
          :style="{ left: item.x + 'px', top: item.y + 'px', display: item.show ? 'flex' : 'none' }"
          :title="`${item.time} · ${item.name}`"
        >
          <span class="relief3d-name">{{ item.name }}</span>
          <span v-if="item.time" class="relief3d-time">{{ item.time }}</span>
          <span class="relief3d-mark">{{ item.done ? '✓' : '○' }}</span>
        </div>
      </div>
      <div v-if="!supported" class="relief3d-fallback">{{ fallbackText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

interface AtlasTask { id: number | string; name: string; time: string; done: boolean }

const props = defineProps<{ tasks: AtlasTask[]; dateKey: string }>();

const rootEl = ref<HTMLElement | null>(null);
const plateEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const labelsShown = ref(false);
const supported = ref(true);
const fallbackText = ref('当前环境不支持 WebGL');
const labels = ref<{ id: string; name: string; time: string; done: boolean; x: number; y: number; show: boolean }[]>([]);

/* ============================ 高度场引擎 ============================ */
const FW = 900, FH = 600;
const WARP = 30, WATER_W = 14, RAMP = 44;
let mapSeed = 1;

function hashStr(value: string) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i += 1) { seed ^= value.charCodeAt(i); seed = Math.imul(seed, 16777619); }
  return seed >>> 0;
}
function hash(x: number, y: number, s: number) {
  let h = s + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177; h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}
const sm = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, s: number) {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = sm(x - ix); const fy = sm(y - iy);
  const a = hash(ix, iy, s); const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s); const d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, s: number, oct = 4) {
  let v = 0; let amp = 1; let f = 1; let m = 0;
  for (let i = 0; i < oct; i += 1) { v += amp * noise(x * f, y * f, s + i * 57); m += amp; amp *= 0.5; f *= 2; }
  return v / m;
}
function rand(i: number) { return hash(i & 65535, (i >> 16) & 65535, mapSeed); }

interface Seed { task: AtlasTask; x: number; y: number; weight: number }
let SEEDS: Seed[] = [];

function buildSeeds(W: number, H: number): Seed[] {
  const cx = W / 2; const cy = H / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const n = props.tasks.length;
  const base = (W * H * 0.16) / Math.max(1, n);
  const seeds: Seed[] = props.tasks.map((task, i) => {
    const ang = i * golden + (rand(i * 13 + 1) - 0.5) * 0.6;
    const rad = Math.sqrt((i + 0.5) / n) * Math.min(W, H) * 0.46;
    return {
      task,
      x: cx + Math.cos(ang) * rad * (W / Math.min(W, H)),
      y: cy + Math.sin(ang) * rad,
      weight: base * (0.82 + rand(i * 31 + 7) * 0.4),
    };
  });
  for (let pass = 0; pass < 6; pass += 1) {
    const ax = new Array(n).fill(0); const ay = new Array(n).fill(0); const cnt = new Array(n).fill(0);
    const step = 6;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      let best = 0; let bd = Infinity;
      for (let i = 0; i < n; i += 1) {
        const dx = x - seeds[i].x; const dy = y - seeds[i].y;
        const d = dx * dx + dy * dy - seeds[i].weight;
        if (d < bd) { bd = d; best = i; }
      }
      ax[best] += x; ay[best] += y; cnt[best] += 1;
    }
    for (let i = 0; i < n; i += 1) if (cnt[i]) {
      seeds[i].x = seeds[i].x * 0.35 + (ax[i] / cnt[i]) * 0.65;
      seeds[i].y = seeds[i].y * 0.35 + (ay[i] / cnt[i]) * 0.65;
    }
  }
  return seeds;
}
function warpAt(x: number, y: number) {
  return {
    wx: x + (fbm(x * 0.016, y * 0.016, mapSeed + 11, 3) - 0.5) * WARP,
    wy: y + (fbm(x * 0.016, y * 0.016, mapSeed + 71, 3) - 0.5) * WARP,
  };
}
interface Field { h: number; water: boolean; seed: Seed; t: number }
function fieldAt(x: number, y: number): Field {
  const { wx, wy } = warpAt(x, y);
  let b0 = 0; let b1 = 0; let d0 = Infinity; let d1 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = i; } else if (d < d1) { d1 = d; b1 = i; }
  }
  const sd = SEEDS[b0]; const s1 = SEEDS[b1] ?? SEEDS[b0];
  const dist0 = Math.hypot(wx - sd.x, wy - sd.y);
  const dist1 = Math.hypot(wx - s1.x, wy - s1.y);
  const edgeDist = SEEDS.length < 2 ? 1e9 : (dist1 - dist0) * 0.5;
  const ww = Math.max(5, WATER_W + (fbm(x * 0.012, y * 0.012, mapSeed + 333, 3) - 0.5) * 20);
  if (edgeDist < ww) { const depth = (ww - edgeDist) / ww; return { h: -0.03 - depth * 0.085, water: true, seed: sd, t: 1 }; }
  const rim = sm(Math.min(1, (edgeDist - ww) / RAMP));
  const reach = Math.sqrt(sd.weight) * 0.72 + 26; const t = Math.min(1, dist0 / reach);
  let h = 0.52 + 0.40 * rim;
  if (sd.task.done) h -= Math.exp(-t * t * 2.0) * 0.11 * rim; else h += (1 - t) * (1 - t) * 0.05 * rim;
  h += (fbm(x * 0.05, y * 0.05, mapSeed + 200, 4) - 0.5) * 0.05 * rim;
  return { h, water: false, seed: sd, t };
}
const TBANDS = 40;
function terr(h: number) { const q = Math.round(h * TBANDS) / TBANDS; return q * 0.74 + h * 0.26; }

/* ============================ three.js ============================ */
const WORLD_W = 120, WORLD_D = 80, AMP = 11, WATER_Y = 0.42;
const COL_DONE = new THREE.Color('#8d9295').convertSRGBToLinear();
const COL_LIGHT = new THREE.Color('#dadcdd').convertSRGBToLinear();
const COL_BANK = new THREE.Color('#bcc0c1').convertSRGBToLinear();
const COL_WETFL = new THREE.Color('#8d989e').convertSRGBToLinear();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let pmrem: THREE.PMREMGenerator | null = null;
let terrain: THREE.Mesh | null = null;
let scatterMeshes: THREE.InstancedMesh[] = [];
let water: THREE.Mesh | null = null;
let base: THREE.Mesh | null = null;
let key: THREE.DirectionalLight | null = null;
let rafId = 0;
const LWORLD: { pos: THREE.Vector3 }[] = [];
const tmpV = new THREE.Vector3();

function initThree(): boolean {
  const canvas = canvasEl.value; const plate = plateEl.value;
  if (!canvas || !plate) return false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch { return false; }
  if (!renderer) return false;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  camera = new THREE.PerspectiveCamera(32, 3 / 2, 0.1, 2000);
  camera.position.set(-6, 140, 58);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, 1, 0);
  controls.minPolarAngle = 0.12; controls.maxPolarAngle = Math.PI * 0.40;
  controls.minDistance = 80; controls.maxDistance = 240;

  key = new THREE.DirectionalLight(0xf3f6fa, 1.4);
  key.position.set(-65, 130, 55);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004; key.shadow.radius = 4;
  const sc = key.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 340;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xeef3f8, 0xb8bcbe, 1.2));
  const fill = new THREE.DirectionalLight(0xe2eaf2, 0.4); fill.position.set(75, 45, -55); scene.add(fill);

  water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W * 1.1, WORLD_D * 1.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#aab4ba').convertSRGBToLinear(), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true;
  scene.add(water);

  base = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_W * 1.02, 6, WORLD_D * 1.02),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#cfc8bb').convertSRGBToLinear(), roughness: 0.95 }),
  );
  base.position.y = -4.0; base.receiveShadow = true; base.castShadow = true;
  scene.add(base);
  return true;
}

function buildTerrain() {
  if (!scene) return;
  SEEDS = buildSeeds(FW, FH);
  const gw = 360, gh = 240;
  const positions = new Float32Array(gw * gh * 3);
  const colors = new Float32Array(gw * gh * 3);
  for (let j = 0; j < gh; j += 1) for (let i = 0; i < gw; i += 1) {
    const u = i / (gw - 1); const v = j / (gh - 1);
    const f = fieldAt(u * FW, v * FH);
    const X = (u - 0.5) * WORLD_W; const Z = (v - 0.5) * WORLD_D; const Y = terr(f.h) * AMP;
    let col: THREE.Color;
    if (f.water) col = COL_WETFL;
    else { col = (f.seed.task.done ? COL_DONE : COL_LIGHT); if (f.h < 0.5) col = col.clone().lerp(COL_BANK, 0.4); }
    const k = j * gw + i;
    positions[k * 3] = X; positions[k * 3 + 1] = Y; positions[k * 3 + 2] = Z;
    colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
  }
  const idx: number[] = [];
  for (let j = 0; j < gh - 1; j += 1) for (let i = 0; i < gw - 1; i += 1) {
    const a = j * gw + i; const b = a + 1; const c = a + gw; const d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (terrain) { terrain.geometry.dispose(); (terrain.material as THREE.Material).dispose(); scene.remove(terrain); }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  terrain = new THREE.Mesh(geo, mat);
  terrain.castShadow = true; terrain.receiveShadow = true;
  scene.add(terrain);
  buildScatter();
  buildLabels();
}

function buildScatter() {
  if (!scene) return;
  scatterMeshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); scene!.remove(m); });
  scatterMeshes = [];
  let s = (mapSeed ^ 0x9e3779b9) >>> 0;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#969b9e').convertSRGBToLinear(), roughness: 0.88, flatShading: true });
  const bushMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#cfd4d4').convertSRGBToLinear(), roughness: 0.75, flatShading: true });
  const MAX = 200;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, MAX);
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, MAX);
  rocks.castShadow = bushes.castShadow = true; rocks.receiveShadow = bushes.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let ri = 0; let bi = 0; let tries = 0;
  while ((ri < MAX || bi < MAX) && tries < MAX * 60) {
    tries += 1;
    const fx = rnd() * FW; const fy = rnd() * FH;
    const f = fieldAt(fx, fy);
    if (f.water || f.h < 0.48 || f.h > 0.70) continue;
    if (fbm(fx * 0.022, fy * 0.022, mapSeed + 888, 2) < 0.52) continue;
    const X = (fx / FW - 0.5) * WORLD_W; const Z = (fy / FH - 0.5) * WORLD_D; const Y = terr(f.h) * AMP;
    if (rnd() < 0.45 && bi < MAX) {
      const sc = 0.4 + rnd() * 0.6;
      dummy.position.set(X, Y + sc * 0.24, Z);
      dummy.rotation.set(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4);
      dummy.scale.set(sc, sc * (0.5 + rnd() * 0.45), sc);
      dummy.updateMatrix(); bushes.setMatrixAt(bi, dummy.matrix); bi += 1;
    } else if (ri < MAX) {
      const sc = 0.28 + rnd() * 0.5;
      dummy.position.set(X, Y + sc * 0.16, Z);
      dummy.rotation.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix(); rocks.setMatrixAt(ri, dummy.matrix); ri += 1;
    }
  }
  rocks.count = ri; bushes.count = bi;
  rocks.instanceMatrix.needsUpdate = true; bushes.instanceMatrix.needsUpdate = true;
  scene.add(rocks); scene.add(bushes);
  scatterMeshes.push(rocks, bushes);
}

function buildLabels() {
  const n = SEEDS.length;
  const cnt = new Array(n).fill(0); const sx = new Array(n).fill(0); const sy = new Array(n).fill(0); const sh = new Array(n).fill(0);
  const step = 6;
  for (let y = 0; y < FH; y += step) for (let x = 0; x < FW; x += step) {
    const f = fieldAt(x, y); if (f.water || f.h < 0.55) continue;
    const i = SEEDS.indexOf(f.seed); sx[i] += x; sy[i] += y; sh[i] += terr(f.h); cnt[i] += 1;
  }
  LWORLD.length = 0;
  const out: typeof labels.value = [];
  SEEDS.forEach((sd, i) => {
    if (!cnt[i]) return;
    const u = (sx[i] / cnt[i]) / FW; const v = (sy[i] / cnt[i]) / FH;
    LWORLD.push({ pos: new THREE.Vector3((u - 0.5) * WORLD_W, (sh[i] / cnt[i]) * AMP + 3.0, (v - 0.5) * WORLD_D) });
    out.push({ id: String(sd.task.id), name: sd.task.name, time: sd.task.time, done: sd.task.done, x: 0, y: 0, show: false });
  });
  labels.value = out;
}

function projectLabels() {
  if (!camera || !plateEl.value) return;
  const rect = plateEl.value.getBoundingClientRect();
  for (let i = 0; i < LWORLD.length && i < labels.value.length; i += 1) {
    tmpV.copy(LWORLD[i].pos).project(camera);
    const lab = labels.value[i];
    lab.x = (tmpV.x * 0.5 + 0.5) * rect.width;
    lab.y = (-tmpV.y * 0.5 + 0.5) * rect.height;
    lab.show = tmpV.z < 1;
  }
}

function resize() {
  if (!renderer || !camera || !plateEl.value) return;
  const rect = plateEl.value.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width)); const h = Math.max(1, Math.floor(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function animate() {
  rafId = requestAnimationFrame(animate);
  controls?.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
  projectLabels();
}

function rebuild() {
  if (!scene) return;
  mapSeed = (hashStr(props.dateKey || 'relief3d') % 60000) + 1;
  buildTerrain();
  labelsShown.value = true;
}

let resizeObs: ResizeObserver | null = null;
let resizeTimer = 0;

onMounted(() => {
  if (!props.tasks.length) return;
  if (!initThree()) { supported.value = false; return; }
  resize();
  rebuild();
  animate();
  if (plateEl.value) {
    resizeObs = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 120);
    });
    resizeObs.observe(plateEl.value);
  }
});

watch(() => [props.dateKey, props.tasks], () => { labelsShown.value = false; rebuild(); }, { deep: true });

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
  controls?.dispose();
  scatterMeshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
  if (terrain) { terrain.geometry.dispose(); (terrain.material as THREE.Material).dispose(); }
  if (water) { water.geometry.dispose(); (water.material as THREE.Material).dispose(); }
  if (base) { base.geometry.dispose(); (base.material as THREE.Material).dispose(); }
  pmrem?.dispose();
  renderer?.dispose();
  renderer = null; scene = null; camera = null; controls = null; terrain = null;
});
</script>

<style scoped>
.relief3d-root {
  flex: 1; min-height: 0; width: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 12px 0 4px;
}
.relief3d-plate {
  position: relative; height: 100%; width: 100%;
  aspect-ratio: 3 / 2; max-height: 100%; max-width: 100%;
  margin: 0 auto;
  border-radius: 12px; overflow: hidden;
  background: color-mix(in srgb, var(--bg) 92%, #e7e3da);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dark) 8%, transparent);
}
.relief3d-canvas { display: block; width: 100%; height: 100%; touch-action: none; }

.relief3d-labels { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .5s ease; }
.relief3d-labels.shown { opacity: 1; }
.relief3d-label {
  position: absolute; transform: translate(-50%, -120%);
  flex-direction: column; align-items: center; gap: 2px;
  text-align: center; white-space: nowrap;
}
.relief3d-name { font-size: 14px; font-weight: 600; letter-spacing: .02em; }
.relief3d-time { font-family: var(--mono); font-size: 10px; letter-spacing: .1em; margin-top: 1px; opacity: .85; }
.relief3d-mark { font-size: 10px; margin-top: 2px; }
.relief3d-label.on-dark { color: #f3f0e9; text-shadow: 0 1px 3px rgba(0,0,0,.55); }
.relief3d-label.on-light { color: #403d36; text-shadow: 0 1px 0 rgba(255,255,255,.7); }

.relief3d-fallback {
  position: absolute; inset: 0; display: grid; place-items: center;
  color: var(--muted); font-family: var(--mono); font-size: 12px; letter-spacing: .14em;
}
</style>
