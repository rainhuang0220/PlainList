<template>
  <div ref="rootEl" class="galaxy-root">
    <div ref="plateEl" class="galaxy-plate">
      <!-- Galaxy View -->
      <div v-show="!showTerrainViewer" class="galaxy-view-container">
        <canvas ref="canvasEl" class="galaxy-canvas"></canvas>

        <div v-if="selectedPlanet" class="planet-info-panel" :class="{ visible: showInfo }">
          <div class="planet-info-header">
            <div class="planet-info-name">{{ selectedPlanet.name }}</div>
            <div class="planet-info-meta">
              {{ selectedPlanet.completedTasks }} / {{ selectedPlanet.totalTasks }} tasks completed
            </div>
          </div>
          <div class="planet-info-stats">
            <div class="stat-item">
              <span class="stat-label">Completion</span>
              <span class="stat-value">{{ selectedPlanet.completionRate }}%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Mass</span>
              <span class="stat-value">{{ selectedPlanet.mass.toFixed(2) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Gravity</span>
              <span class="stat-value">{{ selectedPlanet.gravity.toFixed(4) }}</span>
            </div>
          </div>
          <button class="planet-action-btn" type="button" @click="enterTerrainView">View Terrain →</button>
          <button class="planet-info-close" type="button" @click="deselectPlanet">✕</button>
        </div>

        <div class="galaxy-controls">
          <button
            v-for="(mode, idx) in viewModes"
            :key="idx"
            class="control-btn"
            :class="{ active: currentView === mode.id }"
            type="button"
            @click="switchView(mode.id)"
          >
            {{ mode.label }}
          </button>
          <button class="control-btn" type="button" @click="resetCamera">Reset View</button>
        </div>
      </div>

      <!-- Terrain Viewer -->
      <div v-show="showTerrainViewer" class="terrain-view-container">
        <PlanetTerrainViewer
          v-if="terrainPlanetData"
          :month-data="terrainPlanetData"
          @back="exitTerrainView"
        />
      </div>

      <div v-if="!supported" class="galaxy-fallback">{{ fallbackText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, defineAsyncComponent, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PlanetTerrainViewer = defineAsyncComponent(() => import('./PlanetTerrainViewer.vue'));

interface MonthData {
  month: number;
  name: string;
  days: DayData[];
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

interface DayData {
  day: number;
  dateKey: string;
  completedCount: number;
  totalCount: number;
  completionRate: number;
}

interface PlanetData extends MonthData {
  id: number;
  mesh: THREE.Mesh | null;
  mass: number;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  angle: number;
  gravity: number;
  physicsBody3D: PhysicsBody3D | null;
  color: THREE.Color;
}

const props = defineProps<{
  yearData: MonthData[];
  year: number;
}>();

const emit = defineEmits<{
  planetSelect: [planet: PlanetData];
  planetDeselect: [];
}>();

const rootEl = ref<HTMLElement | null>(null);
const plateEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const supported = ref(true);
const fallbackText = ref('WebGL not supported');
const selectedPlanet = ref<PlanetData | null>(null);
const showInfo = ref(false);
const currentView = ref<'orbit' | 'focus'>('orbit');
const showTerrainViewer = ref(false);
const terrainPlanetData = ref<{ month: number; name: string; days: DayData[]; completionRate: number } | null>(null);

const viewModes = [
  { id: 'orbit' as const, label: 'Orbit' },
  { id: 'focus' as const, label: 'Focus' },
];

/* ==================== Three.js Core ==================== */
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let pmrem: THREE.PMREMGenerator | null = null;
let rafId = 0;

/* Planet system */
const planets: PlanetData[] = [];
let starField: THREE.Points | null = null;
let centerGlow: THREE.Mesh | null = null;
let orbitLines: THREE.Line[] = [];

/* Interaction */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/* Constants */
const BASE_RADIUS = 4;
const MIN_ORBIT = 18;
const ORBIT_SPACING = 8;
const G_CONSTANT = 0.0008;
const TIME_SCALE = 0.0016;

/* ==================== Noise Functions ==================== */
function hash(x: number, y: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const fz = smoothstep(z - iz);

  const n000 = hash(ix, iy, iz, seed);
  const n100 = hash(ix + 1, iy, iz, seed);
  const n010 = hash(ix, iy + 1, iz, seed);
  const n110 = hash(ix + 1, iy + 1, iz, seed);
  const n001 = hash(ix, iy, iz + 1, seed);
  const n101 = hash(ix + 1, iy, iz + 1, seed);
  const n011 = hash(ix, iy + 1, iz + 1, seed);
  const n111 = hash(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = n000 + (n100 - n000) * fx;
  const nx10 = n010 + (n110 - n010) * fx;
  const nx01 = n001 + (n101 - n001) * fx;
  const nx11 = n011 + (n111 - n011) * fx;
  const nxy0 = nx00 + (nx10 - nx00) * fy;
  const nxy1 = nx01 + (nx11 - nx01) * fy;

  return nxy0 + (nxy1 - nxy0) * fz;
}

function fbm3D(x: number, y: number, z: number, seed: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(
      x * frequency,
      y * frequency,
      z * frequency,
      seed + i * 57
    );
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

/* ==================== Planet Generation ==================== */
function generatePlanetGeometry(planet: PlanetData): THREE.BufferGeometry {
  const segments = 64;
  const geometry = new THREE.SphereGeometry(BASE_RADIUS, segments, segments);

  const positions = geometry.attributes.position.array as Float32Array;
  const colors = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    const length = Math.sqrt(x * x + y * y + z * z);
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    const theta = Math.atan2(z, x);
    const phi = Math.acos(ny);

    const dayIndex = Math.floor(((theta + Math.PI) / (2 * Math.PI)) * planet.days.length) % planet.days.length;
    const dayData = planet.days[dayIndex];

    const baseNoise = fbm3D(nx * 3, ny * 3, nz * 3, planet.month * 137 + 42, 5);
    const taskInfluence = dayData ? dayData.completionRate / 100 : 0;

    const displacement = 0.15 + baseNoise * 0.25 + taskInfluence * 0.35;

    positions[i] = nx * BASE_RADIUS * (1 + displacement);
    positions[i + 1] = ny * BASE_RADIUS * (1 + displacement);
    positions[i + 2] = nz * BASE_RADIUS * (1 + displacement);

    const colorVariation = baseNoise * 0.3 + taskInfluence * 0.7;
    const r = planet.color.r * (0.7 + colorVariation * 0.3);
    const g = planet.color.g * (0.7 + colorVariation * 0.3);
    const b = planet.color.b * (0.7 + colorVariation * 0.3);

    colors[i] = r;
    colors[i + 1] = g;
    colors[i + 2] = b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return geometry;
}

function createPlanetAtmosphere(radius: number, color: THREE.Color): THREE.Mesh {
  const atmosphereGeo = new THREE.SphereGeometry(radius * 1.08, 32, 32);
  const atmosphereMat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: color.clone().multiplyScalar(1.2) },
      intensity: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      void main() {
        float glow = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(glowColor, glow * intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });

  return new THREE.Mesh(atmosphereGeo, atmosphereMat);
}

/* ==================== Star Field ==================== */
function createStarField(): THREE.Points {
  const starCount = 3000;
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    const radius = 200 + Math.random() * 300;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.8,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

/* ==================== Orbit Lines ==================== */
function createOrbitLine(radius: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const angle = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    ));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x4a5568,
    transparent: true,
    opacity: 0.25,
  });

  return new THREE.Line(geometry, material);
}

/* ==================== Physics Engine (Custom 3D Gravity) ==================== */
interface PhysicsBody3D {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  mass: number;
  radius: number;
}

let physicsBodies3D: PhysicsBody3D[] = [];

function initPhysics(): void {
  physicsBodies3D = [];
}

function createPhysicsBody3D(
  x: number,
  y: number,
  z: number,
  mass: number,
  radius: number
): PhysicsBody3D {
  const body: PhysicsBody3D = {
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    mass,
    radius,
  };

  const tangentSpeed = Math.sqrt((G_CONSTANT * mass * 50) / (Math.sqrt(x * x + z * z) || 1));
  body.velocity.x = -z / (Math.sqrt(x * x + z * z) || 1) * tangentSpeed;
  body.velocity.z = x / (Math.sqrt(x * x + z * z) || 1) * tangentSpeed;

  physicsBodies3D.push(body);
  return body;
}

function updatePhysics(deltaTime: number): void {
  planets.forEach((planet, index) => {
    if (!planet.physicsBody3D || !physicsBodies3D[index]) return;

    let forceX = 0;
    let forceY = 0;
    let forceZ = 0;

    planets.forEach((other, otherIndex) => {
      if (other.id === planet.id || !other.physicsBody3D || !physicsBodies3D[otherIndex]) return;

      const dx = other.physicsBody3D.position.x - planet.physicsBody3D.position.x;
      const dy = other.physicsBody3D.position.y - planet.physicsBody3D.position.y;
      const dz = other.physicsBody3D.position.z - planet.physicsBody3D.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > planet.radius + other.radius) {
        const force = (G_CONSTANT * planet.mass * other.mass * 1000) / (distance * distance);
        forceX += (force * dx) / distance;
        forceY += (force * dy) / distance;
        forceZ += (force * dz) / distance;
      }
    });

    const ax = forceX / planet.physicsBody3D.mass;
    const ay = forceY / planet.physicsBody3D.mass;
    const az = forceZ / planet.physicsBody3D.mass;

    planet.physicsBody3D.velocity.x += ax * deltaTime;
    planet.physicsBody3D.velocity.y += ay * deltaTime;
    planet.physicsBody3D.velocity.z += az * deltaTime;

    const damping = 0.998;
    planet.physicsBody3D.velocity.x *= damping;
    planet.physicsBody3D.velocity.y *= damping;
    planet.physicsBody3D.velocity.z *= damping;

    planet.physicsBody3D.position.x += planet.physicsBody3D.velocity.x * deltaTime * 60;
    planet.physicsBody3D.position.y += planet.physicsBody3D.velocity.y * deltaTime * 60;
    planet.physicsBody3D.position.z += planet.physicsBody3D.velocity.z * deltaTime * 60;
  });
}

/* ==================== Initialization ==================== */
function initThree(): boolean {
  const canvas = canvasEl.value;
  const plate = plateEl.value;
  if (!canvas || !plate) return false;

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return false;
  }

  if (!renderer) return false;

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
  camera.position.set(0, 80, 120);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI * 0.85;
  controls.minDistance = 30;
  controls.maxDistance = 300;

  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
  sunLight.position.set(-50, 80, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.4);
  fillLight.position.set(60, -20, -50);
  scene.add(fillLight);

  starField = createStarField();
  scene.add(starField);

  centerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.8,
    })
  );
  centerGlow.position.set(0, 0, 0);
  scene.add(centerGlow);

  initPhysics();

  return true;
}

function buildGalaxy(): void {
  if (!scene) return;

  planets.length = 0;
  orbitLines.forEach((line) => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    scene!.remove(line);
  });
  orbitLines = [];

  const monthColors = [
    new THREE.Color('#ff6b6b'),
    new THREE.Color('#ffa94d'),
    new THREE.Color('#ffd43b'),
    new THREE.Color('#69db7c'),
    new THREE.Color('#38d9a9'),
    new THREE.Color('#4dabf7'),
    new THREE.Color('#748ffc'),
    new THREE.Color('#9775fa'),
    new THREE.Color('#da77f2'),
    new THREE.Color('#f783ac'),
    new THREE.Color('#e64980'),
    new THREE.Color('#862e9c'),
  ];

  props.yearData.forEach((monthData, index) => {
    const orbitRadius = MIN_ORBIT + index * ORBIT_SPACING;
    const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.5;
    const mass = 1 + monthData.completionRate * 0.03;
    const radius = BASE_RADIUS * (0.8 + mass * 0.4);

    const planet: PlanetData = {
      ...monthData,
      id: index,
      mesh: null,
      mass,
      radius,
      orbitRadius,
      orbitSpeed: 0.0008 + Math.random() * 0.0004,
      angle,
      gravity: G_CONSTANT * mass,
      physicsBody3D: null,
      color: monthColors[index],
    };

    const geometry = generatePlanetGeometry(planet);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.1,
    });

    planet.mesh = new THREE.Mesh(geometry, material);
    planet.mesh.castShadow = true;
    planet.mesh.receiveShadow = true;
    planet.mesh.userData.planetId = index;

    const atmosphere = createPlanetAtmosphere(radius, planet.color);
    planet.mesh.add(atmosphere);

    scene!.add(planet.mesh);

    const orbitLine = createOrbitLine(orbitRadius);
    scene!.add(orbitLine);
    orbitLines.push(orbitLine);

    const posX = Math.cos(angle) * orbitRadius;
    const posZ = Math.sin(angle) * orbitRadius;
    planet.physicsBody3D = createPhysicsBody3D(posX, 0, posZ, mass * 10, radius);

    planets.push(planet);
  });
}

/* ==================== Animation Loop ==================== */
let lastTime = 0;

function animate(currentTime: number): void {
  rafId = requestAnimationFrame(animate);

  const deltaTime = lastTime ? (currentTime - lastTime) / 1000 : 0.016;
  lastTime = currentTime;

  controls?.update();

  planets.forEach((planet) => {
    if (!planet.mesh || !planet.physicsBody3D) return;

    planet.angle += planet.orbitSpeed * deltaTime * 60;

    const targetX = Math.cos(planet.angle) * planet.orbitRadius;
    const targetZ = Math.sin(planet.angle) * planet.orbitRadius;

    planet.mesh.position.x = planet.physicsBody3D.position.x;
    planet.mesh.position.y = planet.physicsBody3D.position.y;
    planet.mesh.position.z = planet.physicsBody3D.position.z;
    planet.mesh.rotation.y += 0.002 * deltaTime * 60;

    const pullStrength = 0.02;
    planet.physicsBody3D.position.x += (targetX - planet.physicsBody3D.position.x) * pullStrength;
    planet.physicsBody3D.position.z += (targetZ - planet.physicsBody3D.position.z) * pullStrength;
  });

  updatePhysics(deltaTime);

  if (starField) {
    starField.rotation.y += 0.00005 * deltaTime * 60;
  }

  if (centerGlow) {
    const scale = 1 + Math.sin(currentTime * 0.001) * 0.1;
    centerGlow.scale.setScalar(scale);
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/* ==================== Interaction ==================== */
function onMouseClick(event: MouseEvent): void {
  if (!camera || !scene || !plateEl.value) return;

  const rect = plateEl.value.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const meshes = planets.map((p) => p.mesh).filter((m): m is THREE.Mesh => m !== null);
  const intersects = raycaster.intersectObjects(meshes);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object as THREE.Mesh;
    const planetId = clickedMesh.userData.planetId;
    selectPlanet(planets[planetId]);
  } else {
    deselectPlanet();
  }
}

function selectPlanet(planet: PlanetData): void {
  selectedPlanet.value = planet;
  showInfo.value = true;
  emit('planetSelect', planet);

  if (currentView.value === 'focus' && controls && planet.mesh) {
    const targetPosition = planet.mesh.position.clone();
    targetPosition.y += 10;
    targetPosition.z += planet.radius * 3;

    controls.target.copy(planet.mesh.position);
  }
}

function deselectPlanet(): void {
  selectedPlanet.value = null;
  showInfo.value = false;
  emit('planetDeselect');

  if (controls) {
    controls.target.set(0, 0, 0);
  }
}

function enterTerrainView(): void {
  if (!selectedPlanet.value) return;

  terrainPlanetData.value = {
    month: selectedPlanet.value.month,
    name: selectedPlanet.value.name,
    days: selectedPlanet.value.days,
    completionRate: selectedPlanet.value.completionRate,
  };

  showTerrainViewer.value = true;
}

function exitTerrainView(): void {
  showTerrainViewer.value = false;
  terrainPlanetData.value = null;

  nextTick(() => {
    setTimeout(() => {
      if (renderer && camera && plateEl.value) {
        resize();
        renderer.render(scene!, camera);
      }
    }, 50);
  });
}

function switchView(view: 'orbit' | 'focus'): void {
  currentView.value = view;

  if (view === 'focus' && selectedPlanet.value?.mesh && controls) {
    controls.target.copy(selectedPlanet.value.mesh.position);
  } else if (view === 'orbit' && controls) {
    controls.target.set(0, 0, 0);
  }
}

function resetCamera(): void {
  if (controls && camera) {
    controls.reset();
    camera.position.set(0, 80, 120);
    controls.target.set(0, 0, 0);
  }
  deselectPlanet();
}

/* ==================== Resize Handling ==================== */
function resize(): void {
  if (!renderer || !camera || !plateEl.value) return;

  const rect = plateEl.value.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

let resizeObserver: ResizeObserver | null = null;
let resizeTimer = 0;

/* ==================== Lifecycle ==================== */
onMounted(() => {
  if (!props.yearData.length) return;

  if (!initThree()) {
    supported.value = false;
    return;
  }

  resize();
  buildGalaxy();
  animate(0);

  if (plateEl.value) {
    plateEl.value.addEventListener('click', onMouseClick);

    resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 120);
    });
    resizeObserver.observe(plateEl.value);
  }
});

watch(() => [props.year, props.yearData], () => {
  buildGalaxy();
}, { deep: true });

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (plateEl.value) {
    plateEl.value.removeEventListener('click', onMouseClick);
  }

  controls?.dispose();

  planets.forEach((planet) => {
    if (planet.mesh) {
      planet.mesh.geometry.dispose();
      (planet.mesh.material as THREE.Material).dispose();
    }
  });

  physicsBodies3D = [];

  orbitLines.forEach((line) => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  });

  if (starField) {
    starField.geometry.dispose();
    (starField.material as THREE.Material).dispose();
  }

  if (centerGlow) {
    centerGlow.geometry.dispose();
    (centerGlow.material as THREE.Material).dispose();
  }

  pmrem?.dispose();
  renderer?.dispose();

  renderer = null;
  scene = null;
  camera = null;
  controls = null;
});
</script>

<style scoped>
.galaxy-root {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 4px;
}

.galaxy-plate {
  position: relative;
  height: 100%;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 100%;
  max-width: 100%;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #0a0e1a 0%, #000000 100%);
  box-shadow:
    inset 0 0 60px rgba(74, 85, 104, 0.15),
    0 20px 54px rgba(0, 0, 0, 0.35);
}

.galaxy-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.galaxy-canvas:active {
  cursor: grabbing;
}

.galaxy-view-container {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.terrain-view-container {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.planet-info-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 280px;
  padding: 20px;
  background: rgba(10, 14, 26, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(74, 85, 104, 0.4);
  border-radius: 16px;
  color: #e2e8f0;
  transform: translateX(320px);
  opacity: 0;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
}

.planet-info-panel.visible {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.planet-info-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(74, 85, 104, 0.3);
}

.planet-info-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #ffffff;
  margin-bottom: 4px;
}

.planet-info-meta {
  font-size: 13px;
  color: #94a3b8;
  font-family: var(--mono), monospace;
}

.planet-info-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  font-family: var(--mono), monospace;
}

.planet-info-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(74, 85, 104, 0.5);
  border-radius: 50%;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.planet-info-close:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
}

.planet-action-btn {
  width: 100%;
  padding: 10px 16px;
  margin-top: 12px;
  border: 1.5px solid rgba(74, 85, 104, 0.5);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15));
  color: #e0e7ff;
  font-family: var(--mono), monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.planet-action-btn:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(139, 92, 246, 0.3));
  border-color: #818cf8;
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.galaxy-controls {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(10, 14, 26, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 85, 104, 0.4);
  border-radius: 12px;
}

.control-btn {
  padding: 8px 16px;
  border: 1px solid rgba(74, 85, 104, 0.4);
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
  font-family: var(--mono), monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover {
  background: rgba(74, 85, 104, 0.3);
  border-color: rgba(148, 163, 184, 0.5);
  color: #ffffff;
}

.control-btn.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  color: #ffffff;
}

.galaxy-fallback {
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
