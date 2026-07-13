<template>
  <div ref="rootEl" class="terrain-root">
    <div class="terrain-plate">
      <canvas ref="canvasEl" class="terrain-canvas"></canvas>

      <div class="terrain-info-overlay">
        <div class="terrain-header">
          <span class="terrain-month-name">{{ monthName }}</span>
          <button class="terrain-back-btn" type="button" @click="emit('back')">← Back to Galaxy</button>
        </div>
        <div class="terrain-stats">
          <div class="stat-chip">
            <span class="stat-num">{{ totalDays }}</span>
            <span class="stat-label">Days</span>
          </div>
          <div class="stat-chip highlight">
            <span class="stat-num">{{ avgCompletion }}%</span>
            <span class="stat-label">Avg</span>
          </div>
        </div>
        <div class="terrain-legend">
          <div class="legend-item">
            <span class="legend-line coast"></span>
            <span>Coastline</span>
          </div>
          <div class="legend-item">
            <span class="legend-line river"></span>
            <span>River (Low)</span>
          </div>
          <div class="legend-item">
            <span class="legend-line contour"></span>
            <span>Contour (High)</span>
          </div>
        </div>
      </div>

      <div v-if="!supported" class="terrain-fallback">{{ fallbackText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface DayData {
  day: number;
  dateKey: string;
  completedCount: number;
  totalCount: number;
  completionRate: number;
}

const props = defineProps<{
  monthData: {
    month: number;
    name: string;
    days: DayData[];
    completionRate: number;
  };
}>();

const emit = defineEmits<{
  back: [];
}>();

const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const supported = ref(true);
const fallbackText = ref('Canvas not supported');

const monthName = computed(() => props.monthData?.name || '');
const totalDays = computed(() => props.monthData?.days?.length || 0);
const avgCompletion = computed(() => Math.round(props.monthData?.completionRate || 0));

/* ==================== Constants (from ArchipelagoAbstract) ==================== */
const WARP = 28;
const WATER_W = 10;
const LEVEL_COUNT = 16;

/* Theme colors */
let inkRGB: [number, number, number] = [20, 20, 20];
let paperRGB: [number, number, number] = [255, 255, 255];
const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* Canvas context */
let ctx: CanvasRenderingContext2D | null = null;
let CW = 0;
let CH = 0;

/* Map seed */
let mapSeed = 1;

/* Day seeds (each day is a "province") */
interface DaySeed {
  day: number;
  x: number;
  y: number;
  weight: number;
  completionRate: number;
}
let SEEDS: DaySeed[] = [];

/* Height grid for marching squares */
let HGRID: { step: number; cols: number; rows: number; grid: Float32Array } | null = null;

/* ==================== Noise Functions ==================== */
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

/* ==================== Build Day Seeds (Provinces) ==================== */
function buildSeeds(W: number, H: number): DaySeed[] {
  if (!props.monthData?.days?.length) return [];

  const cx = W / 2; const cy = H / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const n = props.monthData.days.length;

  const baseArea = (W * H * 0.18) / Math.max(1, n);

  const seeds: DaySeed[] = props.monthData.days.map((dayData, i) => {
    const ang = i * golden + (rand(i * 13 + 1) - 0.5) * 0.8;
    const rad = Math.sqrt((i + 0.5) / n) * Math.min(W, H) * 0.44;

    return {
      day: dayData.day,
      x: cx + Math.cos(ang) * rad * (W / Math.min(W, H)),
      y: cy + Math.sin(ang) * rad,
      weight: baseArea * (0.75 + rand(i * 31 + 7) * 0.5),
      completionRate: dayData.completionRate,
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

/* ==================== Warp Function ==================== */
function warpAt(x: number, y: number) {
  return {
    wx: x + (fbm(x * 0.018, y * 0.018, mapSeed + 11, 3) - 0.5) * WARP,
    wy: y + (fbm(x * 0.018, y * 0.018, mapSeed + 71, 3) - 0.5) * WARP,
  };
}

/* ==================== Height Field (based on daily completion rate) ==================== */
function heightAt(x: number, y: number): number {
  if (!SEEDS.length) return 0;

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

  if (edgeDist < WATER_W) {
    const depth = (WATER_W - edgeDist) / WATER_W;
    return Math.max(-0.15, -0.03 - depth * 0.12);
  }

  const rim = sm(Math.min(1, (edgeDist - WATER_W) / 32));
  const reach = Math.sqrt(sd.weight) * 0.72 + 24;
  const t = Math.min(1, dist0 / reach);

  const completionInfluence = sd.completionRate / 100;
  const prof = 0.45 + completionInfluence * 0.50 + (1 - t) * (1 - t) * 0.30;

  let h = prof * rim;
  h += (fbm(x * 0.026, y * 0.026, mapSeed + 200, 3) - 0.5) * 0.04 * rim;

  return h;
}

function sampleDayAt(x: number, y: number): { seed: DaySeed; water: boolean } {
  if (!SEEDS.length) return { seed: SEEDS[0], water: false };

  const { wx, wy } = warpAt(x, y);
  let b0 = 0; let b1 = 0; let d0 = Infinity; let d1 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = i; } else if (d < d1) { d1 = d; b1 = i; }
  }

  const dist0 = Math.hypot(wx - SEEDS[b0].x, wy - SEEDS[b0].y);
  const dist1 = SEEDS[b1] ? Math.hypot(wx - SEEDS[b1].x, wy - SEEDS[b1].y) : Infinity;
  const water = SEEDS.length >= 2 && (dist1 - dist0) * 0.5 < WATER_W;

  return { seed: SEEDS[b0], water };
}

/* ==================== Marching Squares ==================== */
function buildHeightGrid(W: number, H: number) {
  const step = 3;
  const cols = Math.floor(W / step); const rows = Math.floor(H / step);
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) for (let i = 0; i <= cols; i += 1) grid[j * (cols + 1) + i] = heightAt(i * step, j * step);
  HGRID = { step, cols, rows, grid };
}

interface Pt { x: number; y: number }

function contourPaths(lv: number): Pt[][] {
  if (!HGRID) return [];
  const { step, cols, rows, grid } = HGRID;
  const get = (i: number, j: number) => grid[j * (cols + 1) + i];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const segs: [Pt, Pt][] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x0 = i * step; const y0 = j * step; const x1 = x0 + step; const y1 = y0 + step;
      const tl = get(i, j); const tr = get(i + 1, j); const br = get(i + 1, j + 1); const bl = get(i, j + 1);
      let c = 0;
      if (tl > lv) c |= 8; if (tr > lv) c |= 4; if (br > lv) c |= 2; if (bl > lv) c |= 1;
      if (c === 0 || c === 15) continue;
      const T = { x: lerp(x0, x1, (lv - tl) / (tr - tl)), y: y0 };
      const B = { x: lerp(x0, x1, (lv - bl) / (br - bl)), y: y1 };
      const Lp = { x: x0, y: lerp(y0, y1, (lv - tl) / (bl - tl)) };
      const Rp = { x: x1, y: lerp(y0, y1, (lv - tr) / (br - tr)) };
      const push = (a: Pt, b: Pt) => segs.push([a, b]);
      switch (c) {
        case 1: case 14: push(Lp, B); break;
        case 2: case 13: push(B, Rp); break;
        case 3: case 12: push(Lp, Rp); break;
        case 4: case 11: push(T, Rp); break;
        case 6: case 9: push(T, B); break;
        case 7: case 8: push(Lp, T); break;
        case 5: push(Lp, T); push(B, Rp); break;
        case 10: push(T, Rp); push(Lp, B); break;
        default: break;
      }
    }
  }
  return stitch(segs);
}

function stitch(segs: [Pt, Pt][]): Pt[][] {
  const paths: Pt[][] = [];
  const used = new Array(segs.length).fill(false);
  const key = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`;
  const startMap = new Map<string, number[]>();
  const add = (k: string, i: number) => { const a = startMap.get(k); if (a) a.push(i); else startMap.set(k, [i]); };
  segs.forEach((s, i) => { add(key(s[0]), i); add(key(s[1]), i); });
  for (let i = 0; i < segs.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const path = [segs[i][0], segs[i][1]];
    let grow = true;
    while (grow) {
      grow = false;
      const tail = path[path.length - 1];
      const cand = startMap.get(key(tail)) || [];
      for (const ci of cand) {
        if (used[ci]) continue;
        const [a, b] = segs[ci];
        if (key(a) === key(tail)) { path.push(b); used[ci] = true; grow = true; break; }
        if (key(b) === key(tail)) { path.push(a); used[ci] = true; grow = true; break; }
      }
    }
    if (path.length >= 2) paths.push(path);
  }
  return paths;
}

function lengthOf(pts: Pt[]) { let l = 0; for (let i = 1; i < pts.length; i += 1) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; }

/* ==================== Rendering ==================== */
interface Geom { coast: Pt[][]; levels: { lv: number; paths: { pts: Pt[]; lv: number; completionRate: number; len: number }[] }[] }
let GEOM: Geom | null = null;

function buildGeom(): Geom {
  const coast = contourPaths(0.02).filter((pts) => pts.length > 8 && lengthOf(pts) > 40);
  const levels: Geom['levels'] = [];
  for (let i = 1; i <= LEVEL_COUNT; i += 1) {
    const lv = i / (LEVEL_COUNT + 1);
    const paths = contourPaths(lv).map((pts) => {
        const mid = pts[Math.floor(pts.length / 2)];
        const { seed } = sampleDayAt(mid.x, mid.y);
        return { pts, lv, len: lengthOf(pts), completionRate: seed.completionRate };
      }).filter((p) => p.len > 32);
    levels.push({ lv, paths });
  }
  return { coast, levels };
}

function tracePath(pts: Pt[]) {
  if (!ctx) return;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
}

function fillProvinces() {
  if (!ctx || CW < 1 || CH < 1) return;
  const scale = 2;
  const sw = Math.ceil(CW / scale); const sh = Math.ceil(CH / scale);
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  for (let sy = 0; sy < sh; sy += 1) {
    for (let sx = 0; sx < sw; sx += 1) {
      const { seed, water } = sampleDayAt(sx * scale, sy * scale);
      const highCompletion = !water && seed.completionRate >= 60;
      const c = highCompletion ? inkRGB : paperRGB;
      const idx = (sy * sw + sx) * 4;
      d[idx] = c[0]; d[idx + 1] = c[1]; d[idx + 2] = c[2]; d[idx + 3] = 255;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, CW, CH);
}

function draw() {
  if (!ctx || !GEOM) return;
  ctx.clearRect(0, 0, CW, CH);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  fillProvinces();

  ctx.strokeStyle = rgb(inkRGB, 0.06); ctx.lineWidth = 0.8;
  for (const pts of contourPaths(-0.05)) { if (pts.length < 8) continue; tracePath(pts); ctx.stroke(); }

  ctx.strokeStyle = rgb(inkRGB, 0.95); ctx.lineWidth = 1.8;
  for (const pts of GEOM.coast) { tracePath(pts); ctx.stroke(); }

  for (const L of GEOM.levels) {
    for (const p of L.paths) {
      if (p.pts.length < 2) continue;
      if (p.completionRate >= 60) {
        ctx.strokeStyle = rgb(paperRGB, 0.22 + p.lv * 0.45);
        ctx.lineWidth = 0.9;
      } else {
        const g = Math.round(140 - p.lv * 70);
        ctx.strokeStyle = `rgba(${g},${g},${g},0.88)`;
        ctx.lineWidth = 0.85;
      }
      tracePath(p.pts); ctx.stroke();
    }
  }

  drawDayLabels();
}

/* ==================== Day Labels ==================== */
interface LabelData { day: number; x: number; y: number; completionRate: number }
const labels = ref<LabelData[]>([]);
const labelsShown = ref(false);

function drawDayLabels() {
  if (!SEEDS.length) return;

  const cnt = new Array(SEEDS.length).fill(0);
  const sxs = new Array(SEEDS.length).fill(0);
  const sys = new Array(SEEDS.length).fill(0);
  const step = 8;
  for (let y = 0; y < CH; y += step) {
    for (let x = 0; x < CW; x += step) {
      if (heightAt(x, y) < 0.04) continue;
      const { seed } = sampleDayAt(x, y);
      const idx = SEEDS.indexOf(seed);
      if (idx >= 0) { sxs[idx] += x; sys[idx] += y; cnt[idx] += 1; }
    }
  }

  const out: LabelData[] = [];
  SEEDS.forEach((sd, i) => {
    if (!cnt[i]) return;
    out.push({
      day: sd.day,
      x: sxs[i] / cnt[i],
      y: sys[i] / cnt[i],
      completionRate: sd.completionRate,
    });
  });

  labels.value = out;
  labelsShown.value = true;
}

/* ==================== Theme Detection ==================== */
function readTheme() {
  const cs = getComputedStyle(rootEl.value || document.documentElement);
  const parse = (name: string, fb: [number, number, number]): [number, number, number] => {
    const v = cs.getPropertyValue(name).trim();
    const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(v);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : fb;
  };
  inkRGB = parse('--dark', [20, 20, 20]);
  paperRGB = parse('--bg', [255, 255, 255]);
}

/* ==================== Setup & Lifecycle ==================== */
function setup() {
  const canvas = canvasEl.value;
  const plate = canvas?.parentElement;
  if (!canvas || !plate) return false;

  const rect = plate.getBoundingClientRect();
  const W = Math.max(1, Math.floor(rect.width));
  const H = Math.max(1, Math.floor(rect.height));
  if (W < 8 || H < 8) return false;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CW = W; CH = H;

  mapSeed = (hashStr(`month-${props.monthData?.month || 0}-${props.monthData?.name || ''}`) % 60000) + 1;
  SEEDS = buildSeeds(W, H);

  return true;
}

function render() {
  if (!props.monthData?.days?.length) { labels.value = []; return; }
  readTheme();
  if (!setup()) return;
  buildHeightGrid(CW, CH);
  GEOM = buildGeom();
  draw();
}

let resizeObserver: ResizeObserver | null = null;
let resizeTimer = 0;

onMounted(() => {
  render();
  if (canvasEl.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 140);
    });
    resizeObserver.observe(canvasEl.value.parentElement);
  }
});

watch(() => props.monthData, () => { labelsShown.value = false; render(); }, { deep: true });

onBeforeUnmount(() => {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
});
</script>

<style scoped>
.terrain-root {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 4px;
}

.terrain-plate {
  position: relative;
  height: 100%;
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 100%;
  max-width: 100%;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dark) 7%, transparent);
}

.terrain-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.terrain-info-overlay {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 10;
}

.terrain-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terrain-month-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--dark);
  font-family: var(--mono), monospace;
}

.terrain-back-btn {
  padding: 7px 14px;
  border: 1.5px solid var(--dark);
  border-radius: 8px;
  background: transparent;
  color: var(--dark);
  font-family: var(--mono), monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
}

.terrain-back-btn:hover {
  background: var(--dark);
  color: var(--bg);
}

.terrain-stats {
  display: flex;
  gap: 10px;
}

.stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--dark) 12%, transparent);
  border-radius: 10px;
}

.stat-chip.highlight {
  background: var(--dark);
  border-color: var(--dark);
}

.stat-chip.highlight .stat-num {
  color: var(--bg);
}

.stat-chip.highlight .stat-label {
  color: color-mix(in srgb, var(--bg) 70%, transparent);
}

.stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--dark);
  font-family: var(--mono), monospace;
}

.stat-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-family: var(--mono), monospace;
}

.terrain-legend {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: var(--muted);
  font-family: var(--mono), monospace;
  letter-spacing: 0.04em;
}

.legend-line {
  width: 20px;
  height: 2px;
  border-radius: 1px;
}

.legend-line.coast {
  background: #141414;
  opacity: 0.95;
}

.legend-line.river {
  background: #141414;
  opacity: 0.15;
}

.legend-line.contour {
  background: #888;
  opacity: 0.85;
}

.terrain-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-family: var(--mono), monospace;
  font-size: 12px;
  letter-spacing: 0.14em;
}
</style>
