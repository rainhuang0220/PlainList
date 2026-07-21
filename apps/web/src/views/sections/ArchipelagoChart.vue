<template>
  <div ref="rootEl" class="atlas-root">
    <div class="atlas-plate">
      <canvas ref="canvasEl" class="atlas-canvas"></canvas>
      <div class="atlas-labels" :class="{ shown: labelsShown }">
        <div
          v-for="item in labels"
          :key="item.id"
          class="atlas-label"
          :style="{ left: item.x + 'px', top: item.y + 'px' }"
          :title="`${item.time} · ${item.name}`"
        >
          <span class="atlas-mark">{{ item.done ? '▲' : '○' }}</span>
          <span class="atlas-name">{{ item.name }}</span>
          <span v-if="item.time" class="atlas-time">{{ item.time }}</span>
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

const WARP = 18; // 海岸线不规则度

/* ---------- noise / fbm ---------- */
function hashStr(value: string) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}
function hash(x: number, y: number, s: number) {
  let h = s + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
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
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/* ---------- per-instance state ---------- */
interface Seed { task: AtlasTask; x: number; y: number; weight: number }
interface Pt { x: number; y: number }
interface CPath { pts: Pt[]; len: number; area: number; compact: number; cx: number; cy: number }
interface Geom { coast: { pts: Pt[]; len: number }[]; levels: { lv: number; paths: CPath[]; index: boolean }[] }

let mapSeed = 1;
let SEEDS: Seed[] = [];
let ctx: CanvasRenderingContext2D | null = null;
let CW = 0; let CH = 0; let cssScale = 1;
let geom: Geom | null = null;
let rafId = 0;
let ink: [number, number, number] = [17, 17, 17];
let paper: [number, number, number] = [247, 247, 247];
let water: [number, number, number] = [232, 232, 232];

function rand(i: number) { return hash(i & 65535, (i >> 16) & 65535, mapSeed); }

function buildSeeds(W: number, H: number) {
  const cx = W / 2; const cy = H / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const n = props.tasks.length;
  const base = (W * H * 0.16) / Math.max(1, n);  // 等面积基准（无时长数据）
  const seeds: Seed[] = props.tasks.map((task, i) => {
    const ang = i * golden + (rand(i * 13 + 1) - 0.5) * 0.7;
    const rad = Math.sqrt((i + 0.5) / n) * Math.min(W, H) * 0.36;
    return {
      task,
      x: cx + Math.cos(ang) * rad,
      y: cy + Math.sin(ang) * rad,
      weight: base * (0.78 + rand(i * 31 + 7) * 0.5),  // 轻微抖动 → 有机
    };
  });

  for (let pass = 0; pass < 3; pass += 1) {
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

function heightAt(x: number, y: number, W: number, H: number): number {
  const cx = W / 2; const cy = H / 2;
  const nx = (x - cx) / (W * 0.5); const ny = (y - cy) / (H * 0.5);
  const rr = Math.sqrt(nx * nx + ny * ny);
  const coastWarp = (fbm(x * 0.011, y * 0.011, mapSeed + 900, 3) - 0.5) * 0.55;
  const land = 1 - sm(clamp01((rr + coastWarp - 0.62) / 0.34));
  if (land <= 0.001) return -0.15;

  const wx = x + (fbm(x * 0.016, y * 0.016, mapSeed + 11, 3) - 0.5) * WARP;
  const wy = y + (fbm(x * 0.016, y * 0.016, mapSeed + 71, 3) - 0.5) * WARP;

  let b0 = 0; let b1 = 0; let d0 = Infinity; let d1 = Infinity;
  for (let i = 0; i < SEEDS.length; i += 1) {
    const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
    const d = dx * dx + dy * dy - SEEDS[i].weight;
    if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = i; } else if (d < d1) { d1 = d; b1 = i; }
  }
  const sd = SEEDS[b0];
  const s1 = SEEDS[b1];
  const dist0 = Math.hypot(wx - sd.x, wy - sd.y);
  const dist1 = Math.hypot(wx - s1.x, wy - s1.y);
  const edgeDist = SEEDS.length < 2 ? 1e9 : (dist1 - dist0) * 0.5;

  const waterW = 11;
  if (edgeDist < waterW) {
    return Math.max(-0.12, (edgeDist - waterW) * 0.012) * land;
  }
  const edge = sm(Math.min(1, (edgeDist - waterW) / 26));

  const reach = Math.sqrt(sd.weight) * 0.66 + 24;
  const t = Math.min(1, dist0 / reach);
  const prof = sd.task.done
    ? 0.50 + (1 - t) * (1 - t) * 0.50      // 山峰
    : 0.42 - Math.exp(-t * t * 3.0) * 0.56; // 湖心岛

  let h = prof * edge;
  h += (fbm(x * 0.024, y * 0.024, mapSeed + 200, 3) - 0.5) * 0.03 * edge;
  return h * land;
}

/* ---------- marching squares ---------- */
function contourPaths(W: number, H: number, lv: number): Pt[][] {
  const step = 4;
  const cols = Math.floor(W / step); const rows = Math.floor(H / step);
  const grid = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) for (let i = 0; i <= cols; i += 1) grid[j * (cols + 1) + i] = heightAt(i * step, j * step, W, H);
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
      const L = { x: x0, y: lerp(y0, y1, (lv - tl) / (bl - tl)) };
      const Rr = { x: x1, y: lerp(y0, y1, (lv - tr) / (br - tr)) };
      const push = (a: Pt, b: Pt) => segs.push([a, b]);
      switch (c) {
        case 1: case 14: push(L, B); break;
        case 2: case 13: push(B, Rr); break;
        case 3: case 12: push(L, Rr); break;
        case 4: case 11: push(T, Rr); break;
        case 6: case 9: push(T, B); break;
        case 7: case 8: push(L, T); break;
        case 5: push(L, T); push(B, Rr); break;
        case 10: push(T, Rr); push(L, B); break;
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
function areaOf(pts: Pt[]) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); return Math.abs(a / 2); }
function centroidOf(pts: Pt[]) { let x = 0; let y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }

const LEVEL_COUNT = 17;
function buildGeom(W: number, H: number): Geom {
  const coast = contourPaths(W, H, 0.012)
    .map((pts) => ({ pts, len: lengthOf(pts), area: areaOf(pts) }))
    .filter((c) => c.len > 30 && c.area > 900 && (c.len * c.len / c.area) < 50)
    .map((c) => ({ pts: c.pts, len: c.len }));
  const levels: Geom['levels'] = [];
  for (let i = 1; i <= LEVEL_COUNT; i += 1) {
    const lv = i / (LEVEL_COUNT + 1);
    const paths = contourPaths(W, H, lv).map((pts) => {
      const c = centroidOf(pts);
      const len = lengthOf(pts);
      const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 7;
      const area = closed ? areaOf(pts) : Infinity;
      const compact = closed ? (len * len / area) : Infinity;
      return { pts, len, area, compact, cx: c.x, cy: c.y };
    }).filter((p) => {
      if (p.len < 22) return false;
      if (p.area === Infinity) return true;
      if (p.area < 200) return false;
      return p.compact < 45;
    });
    levels.push({ lv, paths, index: i % 4 === 0 });
  }
  return { coast, levels };
}

/* ---------- rendering ---------- */
function rgb(c: [number, number, number], a = 1) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function fillWater(W: number, H: number) {
  if (!ctx) return;
  const scale = 3;
  const sw = Math.ceil(W / scale); const sh = Math.ceil(H / scale);
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  for (let sy = 0; sy < sh; sy += 1) {
    for (let sx = 0; sx < sw; sx += 1) {
      const h = heightAt(sx * scale, sy * scale, W, H);
      const idx = (sy * sw + sx) * 4;
      const c = h < 0 ? water : paper;
      d[idx] = c[0]; d[idx + 1] = c[1]; d[idx + 2] = c[2]; d[idx + 3] = 255;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, W, H);
}

function strokeReveal(pts: Pt[], len: number, t: number) {
  if (!ctx) return;
  ctx.beginPath();
  pts.forEach((pt, i) => (i ? ctx!.lineTo(pt.x, pt.y) : ctx!.moveTo(pt.x, pt.y)));
  if (t < 1) { ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - t); }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawContour(progress: number) {
  if (!ctx || !geom) return;
  ctx.clearRect(0, 0, CW, CH);
  fillWater(CW, CH);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const ct = clamp01(progress / 0.14);
  if (ct > 0) {
    ctx.strokeStyle = rgb(ink, 0.5); ctx.lineWidth = 1.7;
    for (const c of geom.coast) strokeReveal(c.pts, c.len, ct);
  }

  const N = geom.levels.length;
  geom.levels.forEach((L, i) => {
    const start = 0.10 + (i / N) * 0.78;
    const t = clamp01((progress - start) / 0.20);
    if (t <= 0) return;
    const shade = mix(mix(paper, ink, 0.45), ink, L.lv); // 越高越深
    ctx!.strokeStyle = rgb(shade, 1);
    ctx!.lineWidth = L.index ? 1.45 : 0.8;
    for (const p of L.paths) {
      if (p.pts.length < 2) continue;
      ctx!.lineWidth = L.index ? 1.45 : 0.8;
      strokeReveal(p.pts, p.len, t);
    }
  });
}

function placeLabels(W: number, H: number) {
  const counts = new Array(SEEDS.length).fill(0);
  const sxs = new Array(SEEDS.length).fill(0); const sys = new Array(SEEDS.length).fill(0);
  const step = 8;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (heightAt(x, y, W, H) < 0.05) continue;
      const wx = x + (fbm(x * 0.016, y * 0.016, mapSeed + 11, 3) - 0.5) * WARP;
      const wy = y + (fbm(x * 0.016, y * 0.016, mapSeed + 71, 3) - 0.5) * WARP;
      let best = 0; let bd = Infinity;
      for (let i = 0; i < SEEDS.length; i += 1) {
        const dx = wx - SEEDS[i].x; const dy = wy - SEEDS[i].y;
        const d = dx * dx + dy * dy - SEEDS[i].weight;
        if (d < bd) { bd = d; best = i; }
      }
      sxs[best] += x; sys[best] += y; counts[best] += 1;
    }
  }
  const out: typeof labels.value = [];
  SEEDS.forEach((sd, i) => {
    if (!counts[i]) return;
    out.push({
      id: String(sd.task.id),
      name: sd.task.name,
      time: sd.task.time,
      done: sd.task.done,
      x: (sxs[i] / counts[i]) * cssScale,
      y: (sys[i] / counts[i]) * cssScale,
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
  ink = parse('--dark', [17, 17, 17]);
  paper = parse('--bg', [247, 247, 247]);
  water = mix(paper, ink, 0.085); // 河流：比纸面略深
}

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
  CW = W; CH = H; cssScale = rect.width / W;
  mapSeed = (hashStr(props.dateKey || 'atlas') % 60000) + 1;
  SEEDS = buildSeeds(W, H);
  return true;
}

function animate() {
  const dur = 1500;
  let t0: number | null = null;
  const stepFn = (now: number) => {
    if (t0 === null) t0 = now;
    let p = (now - t0) / dur; if (p > 1) p = 1;
    drawContour(p < 1 ? easeOut(p) : 1);
    if (p >= 0.55) labelsShown.value = true;
    if (p < 1) rafId = requestAnimationFrame(stepFn); else labelsShown.value = true;
  };
  rafId = requestAnimationFrame(stepFn);
}

function render(withAnim: boolean) {
  cancelAnimationFrame(rafId);
  if (!props.tasks.length) { labels.value = []; return; }
  readTheme();
  if (!setup()) return;
  geom = buildGeom(CW, CH);
  placeLabels(CW, CH);
  if (withAnim) { labelsShown.value = false; animate(); } else { labelsShown.value = true; drawContour(1); }
}

let resizeObs: ResizeObserver | null = null;
let resizeTimer = 0;

onMounted(() => {
  render(true);
  if (canvasEl.value?.parentElement) {
    resizeObs = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => render(false), 140);
    });
    resizeObs.observe(canvasEl.value.parentElement);
  }
});

watch(() => [props.dateKey, props.tasks], () => render(true), { deep: true });

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
});
</script>

<style scoped>
.atlas-root {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 4px;
}

.atlas-plate {
  position: relative;
  height: 100%;
  aspect-ratio: 1 / 1;
  max-height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dark) 6%, transparent),
              inset 0 1px 22px color-mix(in srgb, var(--dark) 5%, transparent);
}

.atlas-canvas { display: block; width: 100%; height: 100%; }

.atlas-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity .5s ease;
}
.atlas-labels.shown { opacity: 1; }

.atlas-label {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  max-width: 42%;
  text-align: center;
  white-space: nowrap;
}

.atlas-mark {
  font-size: 9px;
  line-height: 1;
  color: var(--dark);
  text-shadow: 0 0 4px var(--bg), 0 0 3px var(--bg);
}

.atlas-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--dark);
  text-shadow:
    -1px -1px 0 var(--bg), 1px -1px 0 var(--bg), -1px 1px 0 var(--bg), 1px 1px 0 var(--bg),
    0 -2px 0 var(--bg), 0 2px 0 var(--bg), -2px 0 0 var(--bg), 2px 0 0 var(--bg), 0 0 5px var(--bg);
}

.atlas-time {
  font-family: var(--mono);
  font-size: 8.5px;
  letter-spacing: .14em;
  color: var(--mid);
  text-shadow: 0 0 4px var(--bg), 0 0 4px var(--bg);
}
</style>
