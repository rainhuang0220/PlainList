<template>
  <div ref="rootEl" class="abstract-root">
    <div class="abstract-plate">
      <canvas ref="canvasEl" class="abstract-canvas"></canvas>
      <div class="abstract-labels" :class="{ shown: labelsShown }">
        <div
          v-for="item in labels"
          :key="item.id"
          class="abstract-label"
          :class="item.done ? 'on-dark' : 'on-light'"
          :style="{ left: item.x + 'px', top: item.y + 'px' }"
          :title="`${item.time} · ${item.name}`"
        >
          <span class="abstract-name">{{ item.name }}</span>
          <span v-if="item.time" class="abstract-time">{{ item.time }}</span>
          <span class="abstract-mark">{{ item.done ? '✓' : '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface AtlasTask {
  id: number | string;
  name: string;
  time: string;
  done: boolean;
}

const props = defineProps<{
  tasks: AtlasTask[];
  dateKey: string;
}>();

const rootEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const labels = ref<{ id: string; name: string; time: string; done: boolean; x: number; y: number }[]>([]);
const labelsShown = ref(false);

const WARP = 34;     // 海岸/河岸蜿蜒度（越大越圆润有机）
const WATER_W = 12;  // 河流（自由时间）半宽

/* ---------- noise / fbm ---------- */
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
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Seed { task: AtlasTask; x: number; y: number; weight: number }
interface Pt { x: number; y: number }

let mapSeed = 1;
let SEEDS: Seed[] = [];
let ctx: CanvasRenderingContext2D | null = null;
let CW = 0; let CH = 0; let cssScale = 1;
let HGRID: { step: number; cols: number; rows: number; grid: Float32Array } | null = null;

// theme colours
let inkRGB: [number, number, number] = [20, 20, 20];
let paperRGB: [number, number, number] = [255, 255, 255];
const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function rand(i: number) { return hash(i & 65535, (i >> 16) & 65535, mapSeed); }

/* ---------- seeds（无时长 → 近等面积 + 轻微抖动） ---------- */
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
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        let best = 0; let bd = Infinity;
        for (let i = 0; i < n; i += 1) {
          const dx = x - seeds[i].x; const dy = y - seeds[i].y;
          const d = dx * dx + dy * dy - seeds[i].weight;
          if (d < bd) { bd = d; best = i; }
        }
        ax[best] += x; ay[best] += y; cnt[best] += 1;
      }
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
function nearestSeed(wx: number, wy: number) {
  let b0 = 0; let d0 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d0 = d; b0 = i; }
  }
  return b0;
}

/* 高度场：无外圈海洋，岛屿铺满整幅；岛与岛之间只有省界处的河流 */
function heightAt(x: number, y: number): number {
  const { wx, wy } = warpAt(x, y);
  let b0 = 0; let b1 = 0; let d0 = Infinity; let d1 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = i; } else if (d < d1) { d1 = d; b1 = i; }
  }
  const sd = SEEDS[b0]; const s1 = SEEDS[b1];
  const dist0 = Math.hypot(wx - sd.x, wy - sd.y);
  const dist1 = Math.hypot(wx - s1.x, wy - s1.y);
  const edgeDist = SEEDS.length < 2 ? 1e9 : (dist1 - dist0) * 0.5;
  if (edgeDist < WATER_W) return Math.max(-0.12, (edgeDist - WATER_W) * 0.012);
  const edge = sm(Math.min(1, (edgeDist - WATER_W) / 28));
  const reach = Math.sqrt(sd.weight) * 0.72 + 26;
  const t = Math.min(1, dist0 / reach);
  const prof = sd.task.done ? 0.50 + (1 - t) * (1 - t) * 0.50 : 0.42 - Math.exp(-t * t * 3.0) * 0.56;
  let h = prof * edge;
  h += (fbm(x * 0.024, y * 0.024, mapSeed + 200, 3) - 0.5) * 0.03 * edge;
  return h;
}
function sampleProvince(x: number, y: number) {
  const { wx, wy } = warpAt(x, y);
  let b0 = 0; let b1 = 0; let d0 = Infinity; let d1 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = i; } else if (d < d1) { d1 = d; b1 = i; }
  }
  const dist0 = Math.hypot(wx - SEEDS[b0].x, wy - SEEDS[b0].y);
  const dist1 = Math.hypot(wx - SEEDS[b1].x, wy - SEEDS[b1].y);
  const water = SEEDS.length >= 2 && (dist1 - dist0) * 0.5 < WATER_W;
  return { seed: SEEDS[b0], water };
}

/* ---------- marching squares（一次性算高度场，多线复用） ---------- */
function buildHeightGrid(W: number, H: number) {
  const step = 4;
  const cols = Math.floor(W / step); const rows = Math.floor(H / step);
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) for (let i = 0; i <= cols; i += 1) grid[j * (cols + 1) + i] = heightAt(i * step, j * step);
  HGRID = { step, cols, rows, grid };
}
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

/* ---------- 绘制 ---------- */
interface Geom { coast: Pt[][]; levels: { lv: number; paths: { pts: Pt[]; done: boolean; lv: number; len: number }[] }[] }
let GEOM: Geom | null = null;
const LEVEL_COUNT = 14;

function buildGeom(): Geom {
  const coast = contourPaths(0.02).filter((pts) => pts.length > 6 && lengthOf(pts) > 30);
  const levels: Geom['levels'] = [];
  for (let i = 1; i <= LEVEL_COUNT; i += 1) {
    const lv = i / (LEVEL_COUNT + 1);
    const paths = contourPaths(lv).map((pts) => {
      const mid = pts[Math.floor(pts.length / 2)];
      const { wx, wy } = warpAt(mid.x, mid.y);
      return { pts, lv, len: lengthOf(pts), done: SEEDS[nearestSeed(wx, wy)]?.task.done ?? false };
    }).filter((p) => p.len > 26);
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
  if (!ctx) return;
  const scale = 2;
  const sw = Math.ceil(CW / scale); const sh = Math.ceil(CH / scale);
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  for (let sy = 0; sy < sh; sy += 1) {
    for (let sx = 0; sx < sw; sx += 1) {
      const { seed, water } = sampleProvince(sx * scale, sy * scale);
      const black = !water && seed.task.done;
      const c = black ? inkRGB : paperRGB;
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

  // 河流极淡水波
  ctx.strokeStyle = rgb(inkRGB, 0.05); ctx.lineWidth = 0.7;
  for (const pts of contourPaths(-0.04)) { if (pts.length < 6) continue; tracePath(pts); ctx.stroke(); }

  // 海岸线
  ctx.strokeStyle = rgb(inkRGB, 0.92); ctx.lineWidth = 1.6;
  for (const pts of GEOM.coast) { tracePath(pts); ctx.stroke(); }

  // 内部等高线：黑岛上白线、白岛上灰线
  for (const L of GEOM.levels) {
    for (const p of L.paths) {
      if (p.pts.length < 2) continue;
      if (p.done) { ctx.strokeStyle = rgb(paperRGB, 0.18 + p.lv * 0.42); ctx.lineWidth = 0.8; }
      else {
        const g = Math.round(150 - p.lv * 70);
        ctx.strokeStyle = `rgba(${g},${g},${g},0.85)`; ctx.lineWidth = 0.75;
      }
      tracePath(p.pts); ctx.stroke();
    }
  }
}

function placeLabels() {
  const cnt = new Array(SEEDS.length).fill(0);
  const sxs = new Array(SEEDS.length).fill(0); const sys = new Array(SEEDS.length).fill(0);
  const step = 8;
  for (let y = 0; y < CH; y += step) {
    for (let x = 0; x < CW; x += step) {
      if (heightAt(x, y) < 0.04) continue;
      const { wx, wy } = warpAt(x, y);
      const best = nearestSeed(wx, wy);
      sxs[best] += x; sys[best] += y; cnt[best] += 1;
    }
  }
  const out: typeof labels.value = [];
  SEEDS.forEach((sd, i) => {
    if (!cnt[i]) return;
    out.push({
      id: String(sd.task.id), name: sd.task.name, time: sd.task.time, done: sd.task.done,
      x: (sxs[i] / cnt[i]) * cssScale, y: (sys[i] / cnt[i]) * cssScale,
    });
  });
  labels.value = out;
}

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

function setup() {
  const canvas = canvasEl.value; const plate = canvas?.parentElement;
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
  CW = W; CH = H; cssScale = rect.width / W;
  mapSeed = (hashStr(props.dateKey || 'abstract') % 60000) + 1;
  SEEDS = buildSeeds(W, H);
  return true;
}

function render() {
  if (!props.tasks.length) { labels.value = []; return; }
  readTheme();
  if (!setup()) return;
  buildHeightGrid(CW, CH);
  GEOM = buildGeom();
  draw();
  placeLabels();
  labelsShown.value = true;
}

let resizeObs: ResizeObserver | null = null;
let resizeTimer = 0;

onMounted(() => {
  render();
  if (canvasEl.value?.parentElement) {
    resizeObs = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 140);
    });
    resizeObs.observe(canvasEl.value.parentElement);
  }
});
watch(() => [props.dateKey, props.tasks], () => { labelsShown.value = false; render(); }, { deep: true });
onBeforeUnmount(() => { if (resizeObs) { resizeObs.disconnect(); resizeObs = null; } });
</script>

<style scoped>
.abstract-root {
  flex: 1; min-height: 0; width: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 12px 0 4px;
}
.abstract-plate {
  position: relative; height: 100%; width: 100%;
  aspect-ratio: 4 / 3; max-height: 100%; max-width: 100%;
  margin: 0 auto;
  border-radius: 12px; overflow: hidden;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dark) 7%, transparent);
}
.abstract-canvas { display: block; width: 100%; height: 100%; }

.abstract-labels { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .5s ease; }
.abstract-labels.shown { opacity: 1; }
.abstract-label {
  position: absolute; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  max-width: 34%; text-align: center; white-space: nowrap;
}
.abstract-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 600; letter-spacing: .01em; }
.abstract-time { font-family: var(--mono); font-size: 10px; letter-spacing: .08em; margin-top: 1px; opacity: .85; }
.abstract-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%; margin-top: 4px; font-size: 9px;
}
.abstract-label.on-dark .abstract-name { color: var(--bg); }
.abstract-label.on-dark .abstract-time { color: color-mix(in srgb, var(--bg) 78%, var(--dark)); }
.abstract-label.on-dark .abstract-mark { background: var(--bg); color: var(--dark); }
.abstract-label.on-light .abstract-name { color: var(--dark); }
.abstract-label.on-light .abstract-time { color: var(--muted); }
.abstract-label.on-light .abstract-mark { border: 1.4px solid color-mix(in srgb, var(--dark) 32%, var(--bg)); color: transparent; }
</style>
