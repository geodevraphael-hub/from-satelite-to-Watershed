// ============================================================
// GeoInsight Enterprise — From Satellite to Watershed (v2)
// Interactive 3D lesson: remote sensing → DEM → fill sinks →
// flow direction → watersheds → quiz. Built with three.js.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  N, SIZE, generateHeights, fillSinks, flowDirections,
  flowAccumulation, watershedLabels, basinStats, gridToWorld, heightAt,
} from './terrain.js';

// ------------------------------------------------------------
// Hydrology data (computed for real, like GIS software does)
// ------------------------------------------------------------
const orig = generateHeights();
const filled = fillSinks(orig);
const dir = flowDirections(filled);
const acc = flowAccumulation(filled, dir);
const labels = watershedLabels(dir);
const stats = basinStats(labels);

let hMin = Infinity, hMax = -Infinity;
for (let k = 0; k < orig.length; k++) {
  hMin = Math.min(hMin, orig[k]);
  hMax = Math.max(hMax, filled[k]);
}
const sinkMask = new Uint8Array(N * N);
for (let k = 0; k < N * N; k++) if (filled[k] - orig[k] > 0.04) sinkMask[k] = 1;

const M_PER_UNIT = 40; // pretend 1 world unit = 40 m of elevation

// ------------------------------------------------------------
// Renderer / scene / camera
// ------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);
const bgCurrent = new THREE.Color(0x04070d);
const bgTarget = new THREE.Color(0x04070d);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(46, 20, 46);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 340;

scene.add(new THREE.HemisphereLight(0xbfdfff, 0x202a33, 0.9));
const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.6);
sunLight.position.set(60, 50, 35);
scene.add(sunLight);

// stars
{
  const sg = new THREE.BufferGeometry();
  const pts = new Float32Array(1600 * 3);
  for (let i = 0; i < 1600; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(450 + Math.random() * 280);
    pts.set([v.x, v.y, v.z], i * 3);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const rampStops = [
  [0.00, 0x1e6f50], [0.22, 0x52a26b], [0.42, 0xc9c178],
  [0.62, 0xa3793f], [0.82, 0x8d8d8d], [1.00, 0xffffff],
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function rampColor(t, out) {
  t = clamp01(t);
  for (let s = 0; s < rampStops.length - 1; s++) {
    const [ta, ca] = rampStops[s], [tb, cb] = rampStops[s + 1];
    if (t <= tb) {
      _ca.setHex(ca); _cb.setHex(cb);
      out.copy(_ca).lerp(_cb, (t - ta) / (tb - ta));
      return out;
    }
  }
  return out.setHex(0xffffff);
}
const elevT = (h) => (h - hMin) / (hMax - hMin);

function buildGridGeometry(heights, colorOf) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const [x, z] = gridToWorld(i, j);
      pos[k * 3] = x; pos[k * 3 + 1] = heights ? heights[k] : 0; pos[k * 3 + 2] = z;
      colorOf(k, c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, cN = a + N, d = cN + 1;
      idx[p++] = a; idx[p++] = cN; idx[p++] = b;
      idx[p++] = b; idx[p++] = cN; idx[p++] = d;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeTextSprite(text, color = '#ffffff', bg = 'rgba(8,20,32,0.85)') {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(6, 14, 500, 100, 26);
  ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
  ctx.font = 'bold 56px Segoe UI, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(14, 3.5, 1);
  return sp;
}

function makeGlowSprite(color, size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(')', ',0.55)').replace('rgb', 'rgba'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(size);
  return sp;
}

// soft round texture so points render as droplets, not squares
function makeCircleTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const circleTex = makeCircleTexture();

// ============================================================
// STAGE GROUPS
// ============================================================

// ---------- Earth (stages 1–2) ----------
const earthGroup = new THREE.Group();
scene.add(earthGroup);

function hashTex(ix, iy) {
  let h = ix * 668265263 + iy * 374761393;
  h = (h ^ (h >> 13)) * 1274126177; h ^= h >> 16;
  return (h >>> 0) / 4294967295;
}
function fbmTex(x, y) {
  let s = 0, amp = 0.55, f = 1;
  for (let o = 0; o < 4; o++) {
    const ix = Math.floor(x * f), iy = Math.floor(y * f);
    const fx = x * f - ix, fy = y * f - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hashTex(ix, iy), b = hashTex(ix + 1, iy), c = hashTex(ix, iy + 1), dd = hashTex(ix + 1, iy + 1);
    s += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v);
    amp *= 0.5; f *= 2.1;
  }
  return s;
}
function makeEarthTexture() {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lat = Math.abs(y / H - 0.5) * 2;
      const v = fbmTex(x * 0.018, y * 0.036);
      const d = (y * W + x) * 4;
      let r, g, b;
      if (v > 0.54) {
        const m = fbmTex(x * 0.05 + 40, y * 0.1 + 9);
        r = 72 + 48 * m; g = 130 - 20 * m; b = 64 - 4 * m;
      } else {
        const m = v / 0.54;
        r = 8 + 10 * m; g = 34 + 30 * m; b = 70 + 50 * m;
      }
      if (lat > 0.88) { r = g = b = 235; }
      img.data[d] = r; img.data[d + 1] = g; img.data[d + 2] = b; img.data[d + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(16, 56, 40),
  new THREE.MeshStandardMaterial({ map: makeEarthTexture(), roughness: 0.9 })
);
earthGroup.add(earth);
earthGroup.add(new THREE.Mesh(
  new THREE.SphereGeometry(16.9, 40, 30),
  new THREE.MeshBasicMaterial({ color: 0x2ea8ff, transparent: true, opacity: 0.1, side: THREE.BackSide })
));

function makeSatellite(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.35 })
  ));
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.5, roughness: 0.3, emissive: 0x0a1f66, emissiveIntensity: 0.6 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.3), panelMat);
  p1.position.x = 2.6;
  const p2 = p1.clone(); p2.position.x = -2.6;
  g.add(p1, p2);
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.45, 0.5, 14),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4 })
  );
  dish.position.y = -0.7;
  g.add(dish);
  g.scale.setScalar(scale);
  return g;
}
const satellite = makeSatellite(1.4);
earthGroup.add(satellite);

const scanCone = new THREE.Mesh(
  new THREE.ConeGeometry(5.5, 10, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x2ea8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
);
earthGroup.add(scanCone);

const pulses = [];
for (let i = 0; i < 3; i++) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 28),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.userData.phase = i / 3;
  pulses.push(ring);
  earthGroup.add(ring);
}

const ORBIT_R = 27;
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
function placeSatellite(satPos) {
  satellite.position.copy(satPos);
  satellite.lookAt(0, 0, 0);
  satellite.rotateX(Math.PI / 2);
  const dirV = satPos.clone().normalize();
  const len = satPos.length() - 16;
  scanCone.scale.set(1, len / 10, 1);
  scanCone.position.copy(dirV.clone().multiplyScalar(16 + len / 2));
  scanCone.quaternion.setFromUnitVectors(_up, dirV);
  return dirV;
}
function updateEarthStage(t) {
  earth.rotation.y = t * 0.05;
  const a = t * 0.3;
  const satPos = new THREE.Vector3(Math.cos(a) * ORBIT_R, Math.sin(a * 0.9) * 8, Math.sin(a) * ORBIT_R);
  const dirV = placeSatellite(satPos);
  for (const ring of pulses) {
    const ph = (t * 0.45 + ring.userData.phase) % 1;
    ring.position.copy(satPos).lerp(dirV.clone().multiplyScalar(16), ph);
    ring.scale.setScalar(0.6 + ph * 4.5);
    ring.material.opacity = 0.85 * (1 - ph);
    ring.quaternion.setFromUnitVectors(_fwd, dirV);
  }
}

// ---------- Stage 2: passive vs active energy ----------
const energyGroup = new THREE.Group();
scene.add(energyGroup);

const sunMesh = makeGlowSprite('rgb(255,214,90)', 26);
sunMesh.position.set(58, 30, 8);
energyGroup.add(sunMesh);

const SAT2_POS = new THREE.Vector3(14, 16, 18).normalize().multiplyScalar(ORBIT_R);
const PASSIVE_G = new THREE.Vector3(-2, 8, 12).normalize().multiplyScalar(16);
const ACTIVE_G = new THREE.Vector3(11, 2, 10).normalize().multiplyScalar(16);

function pathLine(a, b, color) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
}
energyGroup.add(pathLine(sunMesh.position, PASSIVE_G, 0xffd166));
energyGroup.add(pathLine(PASSIVE_G, SAT2_POS, 0xffd166));
energyGroup.add(pathLine(SAT2_POS, ACTIVE_G, 0x2ea8ff));

const passiveLabel = makeTextSprite('PASSIVE · sunlight', '#ffd166');
passiveLabel.position.copy(PASSIVE_G.clone().multiplyScalar(1.45)).add(new THREE.Vector3(-6, 5, 0));
energyGroup.add(passiveLabel);
const activeLabel = makeTextSprite('ACTIVE · own signal', '#5fc6ff');
activeLabel.position.copy(ACTIVE_G.clone().multiplyScalar(1.5)).add(new THREE.Vector3(8, -3, 0));
energyGroup.add(activeLabel);

const photons = [];
function addPhotons(count, color, legA, legB, speed, offset) {
  for (let i = 0; i < count; i++) {
    const s = makeGlowSprite(color, 2.2);
    s.userData = { phase: i / count + offset, legA, legB, speed };
    photons.push(s);
    energyGroup.add(s);
  }
}
addPhotons(5, 'rgb(255,214,90)', [sunMesh.position.clone(), PASSIVE_G.clone()], [PASSIVE_G.clone(), SAT2_POS.clone()], 0.16, 0);
addPhotons(5, 'rgb(95,198,255)', [SAT2_POS.clone(), ACTIVE_G.clone()], [ACTIVE_G.clone(), SAT2_POS.clone()], 0.22, 0.5);

function updateEnergyStage(t) {
  earth.rotation.y = t * 0.03;
  placeSatellite(SAT2_POS);
  scanCone.visible = false;
  for (const ring of pulses) ring.visible = false;
  for (const p of photons) {
    const ph = (t * p.userData.speed + p.userData.phase) % 1;
    const { legA, legB } = p.userData;
    if (ph < 0.5) p.position.lerpVectors(legA[0], legA[1], ph * 2);
    else p.position.lerpVectors(legB[0], legB[1], (ph - 0.5) * 2);
    p.material.opacity = 0.4 + 0.6 * Math.sin(ph * Math.PI);
  }
}

// ---------- Stage 3: scanning / point cloud ----------
const scanGroup = new THREE.Group();
scene.add(scanGroup);

const gridHelper = new THREE.GridHelper(SIZE, 24, 0x2a4a5f, 0x14242f);
gridHelper.position.y = -0.05;
scanGroup.add(gridHelper);

const cloudGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const [x, z] = gridToWorld(i, j);
      pos[k * 3] = x; pos[k * 3 + 1] = orig[k]; pos[k * 3 + 2] = z;
      rampColor(elevT(orig[k]), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cloudGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  cloudGeo.setDrawRange(0, 0);
}
const pointCloud = new THREE.Points(cloudGeo, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 1, map: circleTex, alphaTest: 0.05, depthWrite: false }));
scanGroup.add(pointCloud);

const scanSat = makeSatellite(2.2);
scanSat.position.set(0, 46, -SIZE / 2);
scanGroup.add(scanSat);

const laserGeo = new THREE.BufferGeometry();
laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
const lasers = new THREE.LineSegments(laserGeo, new THREE.LineBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.75 }));
scanGroup.add(lasers);

const pulseCounter = { el: null };
const SCAN_DURATION = 15;
function updateScanStage(t) {
  const p = clamp01(t / SCAN_DURATION);
  const rows = Math.min(N, Math.floor(p * N) + 1);
  cloudGeo.setDrawRange(0, rows * N);
  if (pulseCounter.el) pulseCounter.el.textContent = (rows * N).toLocaleString() + ' pts';
  const j = Math.min(N - 1, rows - 1);
  const [, z] = gridToWorld(0, j);
  scanSat.position.set(Math.sin(t * 1.7) * 6, 46, z);
  const lp = laserGeo.attributes.position.array;
  for (let s = 0; s < 6; s++) {
    const i = Math.floor(((Math.sin(t * 9 + s * 2.3) + 1) / 2) * (N - 1));
    const k = j * N + i;
    const [x, zz] = gridToWorld(i, j);
    lp[s * 6] = scanSat.position.x; lp[s * 6 + 1] = scanSat.position.y - 1.5; lp[s * 6 + 2] = scanSat.position.z;
    lp[s * 6 + 3] = x; lp[s * 6 + 4] = orig[k]; lp[s * 6 + 5] = zz;
  }
  laserGeo.attributes.position.needsUpdate = true;
  lasers.visible = p < 1;
}

// ---------- Stage 4: points → raster grid (columns) ----------
const rasterGroup = new THREE.Group();
scene.add(rasterGroup);

const C = 24; // coarse demo grid
const cellSize = SIZE / C;
let columnMesh;
const colHeights = new Float32Array(C * C);
{
  // average the fine DEM into coarse cells
  const per = N / C;
  for (let cj = 0; cj < C; cj++) {
    for (let ci = 0; ci < C; ci++) {
      let sum = 0, n = 0;
      for (let j = Math.floor(cj * per); j < Math.floor((cj + 1) * per); j++) {
        for (let i = Math.floor(ci * per); i < Math.floor((ci + 1) * per); i++) {
          sum += orig[j * N + i]; n++;
        }
      }
      colHeights[cj * C + ci] = sum / n;
    }
  }
  const geo = new THREE.BoxGeometry(cellSize * 0.92, 1, cellSize * 0.92);
  geo.translate(0, 0.5, 0);
  columnMesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    C * C
  );
  const c = new THREE.Color();
  const m = new THREE.Matrix4();
  for (let cj = 0; cj < C; cj++) {
    for (let ci = 0; ci < C; ci++) {
      const k = cj * C + ci;
      m.makeTranslation((ci + 0.5) / C * SIZE - SIZE / 2, 0, (cj + 0.5) / C * SIZE - SIZE / 2);
      m.scale(new THREE.Vector3(1, 0.001, 1));
      columnMesh.setMatrixAt(k, m);
      rampColor(elevT(colHeights[k]), c);
      columnMesh.setColorAt(k, c);
    }
  }
  rasterGroup.add(columnMesh);
  const wire = new THREE.GridHelper(SIZE, C, 0x2ea8ff, 0x1a3a4f);
  wire.position.y = 0.02;
  rasterGroup.add(wire);
}
const rasterCloud = new THREE.Points(cloudGeo.clone(), pointCloud.material.clone());
rasterCloud.geometry.setDrawRange(0, N * N);
rasterGroup.add(rasterCloud);

function updateRasterStage(dt, t) {
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (let cj = 0; cj < C; cj++) {
    for (let ci = 0; ci < C; ci++) {
      const k = cj * C + ci;
      const delay = (ci + cj) * 0.12;
      const p = easeInOut(clamp01((t - 0.6 - delay) / 1.4));
      v.set((ci + 0.5) / C * SIZE - SIZE / 2, 0, (cj + 0.5) / C * SIZE - SIZE / 2);
      m.makeTranslation(v.x, v.y, v.z);
      m.scale(new THREE.Vector3(1, Math.max(0.001, colHeights[k] * p), 1));
      columnMesh.setMatrixAt(k, m);
    }
  }
  columnMesh.instanceMatrix.needsUpdate = true;
  rasterCloud.material.opacity = Math.max(0.12, 1 - t * 0.18);
}

// ---------- Stages 5–9: fine terrain mesh with morphing ----------
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

const terrainGeo = buildGridGeometry(null, (k, c) => rampColor(elevT(orig[k]), c));
const terrainMesh = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
);
terrainGroup.add(terrainMesh);

const baseBox = new THREE.Mesh(
  new THREE.BoxGeometry(SIZE, 3, SIZE),
  new THREE.MeshStandardMaterial({ color: 0x0d1822, roughness: 1 })
);
baseBox.position.y = -1.55;
terrainGroup.add(baseBox);

const morph = { from: new Float32Array(N * N), to: orig, t: 1, dur: 1, active: false };
function startMorph(from, to, dur) {
  morph.from = from; morph.to = to; morph.dur = dur; morph.t = 0; morph.active = true;
}
function currentHeights() {
  const pos = terrainGeo.attributes.position.array;
  const h = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) h[k] = pos[k * 3 + 1];
  return h;
}
function setTerrainHeights(h) {
  const pos = terrainGeo.attributes.position.array;
  for (let k = 0; k < N * N; k++) pos[k * 3 + 1] = h[k];
  terrainGeo.attributes.position.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  morph.active = false;
}
function updateMorph(dt) {
  if (!morph.active) return;
  morph.t += dt;
  const p = easeInOut(clamp01(morph.t / morph.dur));
  const pos = terrainGeo.attributes.position.array;
  for (let k = 0; k < N * N; k++) {
    pos[k * 3 + 1] = morph.from[k] + (morph.to[k] - morph.from[k]) * p;
  }
  terrainGeo.attributes.position.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  if (morph.t >= morph.dur) morph.active = false;
}

// ---------- hover probe (elevation inspector) ----------
const probeGroup = new THREE.Group();
probeGroup.visible = false;
scene.add(probeGroup);
{
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.16, 10, 30),
    new THREE.MeshBasicMaterial({ color: 0xffd166 })
  );
  ring.rotation.x = Math.PI / 2;
  probeGroup.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 14, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5 })
  );
  beam.position.y = 7;
  probeGroup.add(beam);
}
const tooltip = document.getElementById('tooltip');

// ---------- Stage 6: sinks ----------
const sinkGroup = new THREE.Group();
scene.add(sinkGroup);
let sinkPts;
{
  const list = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!sinkMask[k]) continue;
      const [x, z] = gridToWorld(i, j);
      list.push(x, orig[k] + 0.3, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list), 3));
  sinkPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff4757, size: 1.7, transparent: true, opacity: 0.9, depthWrite: false, map: circleTex, alphaTest: 0.03 }));
  sinkGroup.add(sinkPts);
}

// ---------- Stage 7: fill sinks (interactive) ----------
const waterGeo = buildGridGeometry(null, (k, c) => c.setHex(0x2e86de));
const waterMesh = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: 0x2e86de, roughness: 0.55, metalness: 0.05 })
);
scene.add(waterMesh);
function setWaterLevel(p) {
  const pos = waterGeo.attributes.position.array;
  for (let k = 0; k < N * N; k++) {
    pos[k * 3 + 1] = sinkMask[k]
      ? orig[k] + (filled[k] - orig[k]) * p + 0.05
      : orig[k] - 3;
  }
  waterGeo.attributes.position.needsUpdate = true;
  waterGeo.computeVertexNormals();
}
const fillState = { p: 0, auto: false, swapped: false, slider: null, readout: null };
function applyFill(p) {
  fillState.p = p;
  setWaterLevel(p);
  if (fillState.readout) fillState.readout.textContent = Math.round(p * 100) + '%';
  if (fillState.slider && document.activeElement !== fillState.slider) fillState.slider.value = Math.round(p * 100);
  if (p >= 1 && !fillState.swapped) {
    fillState.swapped = true;
    startMorph(currentHeights(), filled, 2.2);
  }
}

// ---------- Stage 8: flow direction arrows ----------
const flowGroup = new THREE.Group();
scene.add(flowGroup);

let arrowMesh;
{
  const STEP = 5;
  const cells = [];
  for (let j = 2; j < N - 2; j += STEP) {
    for (let i = 2; i < N - 2; i += STEP) {
      const k = j * N + i;
      if (dir[k] >= 0) cells.push(k);
    }
  }
  const geo = new THREE.ConeGeometry(0.4, 1.5, 8);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfafafa, emissive: 0x2b6cb0, emissiveIntensity: 0.5, transparent: true, opacity: 0 });
  arrowMesh = new THREE.InstancedMesh(geo, mat, cells.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let n = 0; n < cells.length; n++) {
    const k = cells[n];
    const i = k % N, j = (k / N) | 0;
    const dk = dir[k];
    const dv = new THREE.Vector3((dk % N) - i, 0, ((dk / N) | 0) - j).normalize();
    const [x, z] = gridToWorld(i, j);
    q.setFromUnitVectors(_fwd, dv);
    m.compose(new THREE.Vector3(x, filled[k] + 0.9, z), q, new THREE.Vector3(1, 1, 1));
    arrowMesh.setMatrixAt(n, m);
  }
  flowGroup.add(arrowMesh);
}

// ---------- Stage 9: stream network (connected river lines + glow) ----------
const streamGroup = new THREE.Group();
scene.add(streamGroup);
let streamLines, streamGlow, streamSegCount, streamGlowCount, streamCellList;
{
  const cells = [];
  for (let k = 0; k < N * N; k++) if (acc[k] >= 30 && dir[k] >= 0) cells.push(k);
  cells.sort((a, b) => acc[a] - acc[b]); // headwaters first → rivers grow downstream
  streamCellList = cells;
  const c = new THREE.Color();

  // each stream cell connects to its downstream neighbour → a real river network
  const pos = new Float32Array(cells.length * 6);
  const col = new Float32Array(cells.length * 6);
  for (let n = 0; n < cells.length; n++) {
    const k = cells[n], dk = dir[k];
    const [x1, z1] = gridToWorld(k % N, (k / N) | 0);
    const [x2, z2] = gridToWorld(dk % N, (dk / N) | 0);
    pos.set([x1, filled[k] + 0.3, z1, x2, filled[dk] + 0.3, z2], n * 6);
    const big = clamp01(Math.log(acc[k]) / Math.log(4000));
    c.setHSL(0.58, 1.0, 0.42 + 0.33 * big);
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], n * 6);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  lg.setDrawRange(0, 0);
  streamSegCount = cells.length;
  streamLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  streamGroup.add(streamLines);

  // soft additive glow along the bigger rivers makes them look like water
  const glowCells = cells.filter((k) => acc[k] >= 100);
  const gpos = new Float32Array(glowCells.length * 3);
  const gcol = new Float32Array(glowCells.length * 3);
  for (let n = 0; n < glowCells.length; n++) {
    const k = glowCells[n];
    const [x, z] = gridToWorld(k % N, (k / N) | 0);
    gpos.set([x, filled[k] + 0.4, z], n * 3);
    const big = clamp01(Math.log(acc[k]) / Math.log(4000));
    c.setHSL(0.57, 1.0, 0.5 + 0.3 * big);
    gcol.set([c.r, c.g, c.b], n * 3);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  gg.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  gg.setDrawRange(0, 0);
  streamGlowCount = glowCells.length;
  streamGlow = new THREE.Points(gg, new THREE.PointsMaterial({
    size: 2.4, vertexColors: true, transparent: true, opacity: 0.55,
    depthWrite: false, map: circleTex, blending: THREE.AdditiveBlending,
  }));
  streamGroup.add(streamGlow);
}

// flowing water particles travelling down the river network
class StreamFlow {
  constructor(count) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      color: 0xbfe8ff, size: 1.15, transparent: true, opacity: 0.85,
      depthWrite: false, map: circleTex, blending: THREE.AdditiveBlending,
    }));
    this.state = [];
    for (let i = 0; i < count; i++) {
      this.state.push({});
      this.respawn(i, true);
    }
  }
  respawn(i, randomize = false) {
    const s = this.state[i];
    s.k = streamCellList[(Math.random() * streamCellList.length) | 0];
    s.p = randomize ? Math.random() : 0;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const s = this.state[i];
      let dk = dir[s.k];
      if (dk < 0) { this.respawn(i); dk = dir[s.k]; }
      const big = clamp01(Math.log(acc[s.k]) / Math.log(4000));
      s.p += dt * (4 + 9 * big); // bigger rivers flow faster
      let guard = 0;
      while (s.p >= 1 && guard++ < 8) {
        s.p -= 1;
        s.k = dk;
        dk = dir[s.k];
        if (dk < 0 || acc[s.k] < 30) { this.respawn(i); dk = dir[s.k]; break; }
      }
      const k = s.k, k2 = dir[k] >= 0 ? dir[k] : k;
      const [x1, z1] = gridToWorld(k % N, (k / N) | 0);
      const [x2, z2] = gridToWorld(k2 % N, (k2 / N) | 0);
      this.pos[i * 3] = x1 + (x2 - x1) * s.p;
      this.pos[i * 3 + 1] = filled[k] + (filled[k2] - filled[k]) * s.p + 0.45;
      this.pos[i * 3 + 2] = z1 + (z2 - z1) * s.p;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
const streamFlow = new StreamFlow(300);
streamGroup.add(streamFlow.points);

// ---------- click-to-trace flow paths ----------
const traceGroup = new THREE.Group();
scene.add(traceGroup);
const traces = []; // { line, drop, path:[Vector3], t }
function clearTraces() {
  for (const tr of traces) {
    traceGroup.remove(tr.line, tr.drop);
    tr.line.geometry.dispose();
  }
  traces.length = 0;
  if (traceInfo.el) traceInfo.el.textContent = '';
}
const traceInfo = { el: null };
function addTrace(worldPoint) {
  if (traces.length >= 4) {
    const old = traces.shift();
    traceGroup.remove(old.line, old.drop);
    old.line.geometry.dispose();
  }
  const i = Math.round((worldPoint.x / SIZE + 0.5) * (N - 1));
  const j = Math.round((worldPoint.z / SIZE + 0.5) * (N - 1));
  let k = Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i));
  const pathPts = [];
  let guard = 0;
  while (k >= 0 && guard++ < N * N) {
    const ci = k % N, cj = (k / N) | 0;
    const [x, z] = gridToWorld(ci, cj);
    pathPts.push(new THREE.Vector3(x, filled[k] + 0.6, z));
    k = dir[k];
  }
  if (pathPts.length < 2) return;
  const g = new THREE.BufferGeometry().setFromPoints(pathPts);
  g.setDrawRange(0, 1);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd166, linewidth: 2, transparent: true, opacity: 0.95 }));
  const drop = makeGlowSprite('rgb(255,230,140)', 3.2);
  drop.position.copy(pathPts[0]);
  traceGroup.add(line, drop);
  traces.push({ line, drop, path: pathPts, t: 0 });
  if (traceInfo.el) {
    traceInfo.el.textContent = `Path: ${pathPts.length} cells → exits at the map edge (outlet)`;
  }
}
function updateTraces(dt) {
  for (const tr of traces) {
    tr.t += dt * 28; // cells per second
    const idx = Math.min(tr.path.length - 1, tr.t);
    tr.line.geometry.setDrawRange(0, Math.floor(idx) + 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(tr.path.length - 1, i0 + 1);
    tr.drop.position.lerpVectors(tr.path[i0], tr.path[i1], idx - i0);
    if (tr.t > tr.path.length + 14) tr.t = 0; // replay
  }
}

// ---------- Stage 10: watersheds ----------
const basinGroup = new THREE.Group();
scene.add(basinGroup);

const basinPalette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff, 0xf4a261];
const basinNames = ['Basin A', 'Basin B', 'Basin C', 'Basin D', 'Basin E', 'Basin F'];
const labelColor = new Map();
const labelRank = new Map();
stats.forEach((s, idx) => {
  labelColor.set(s.label, idx < basinPalette.length ? basinPalette[idx] : 0x8d99ae);
  labelRank.set(s.label, idx);
});

function basinVertexColor(k, c, selected) {
  const lab = labels[k];
  const shade = 0.45 + 0.55 * elevT(filled[k]);
  if (selected === null || selected === lab) {
    c.setHex(labelColor.get(lab) ?? 0x8d99ae);
    if (selected === lab) c.multiplyScalar(1.18 * shade);
    else c.multiplyScalar(shade);
  } else {
    c.setHex(0x39434f).multiplyScalar(shade);
  }
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
}
const basinGeo = buildGridGeometry(filled, (k, c) => basinVertexColor(k, c, null));
const basinMesh = new THREE.Mesh(
  basinGeo,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
);
basinGroup.add(basinMesh);
basinGroup.add(baseBox.clone());

function recolorBasins(selected) {
  const col = basinGeo.attributes.color.array;
  const c = new THREE.Color();
  for (let k = 0; k < N * N; k++) {
    basinVertexColor(k, c, selected);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  basinGeo.attributes.color.needsUpdate = true;
}

// ridge lines (divides)
{
  const list = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const k = j * N + i;
      if (labels[k] !== labels[k + 1] || labels[k] !== labels[k + N]) {
        const [x, z] = gridToWorld(i, j);
        list.push(x, filled[k] + 0.4, z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list), 3));
  basinGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x111827, size: 1.0, depthWrite: false, transparent: true, map: circleTex, alphaTest: 0.03 })));
}

// outlet flags for the 3 biggest basins
for (let b = 0; b < Math.min(3, stats.length); b++) {
  const k = stats[b].label;
  const i = k % N, j = (k / N) | 0;
  const [x, z] = gridToWorld(i, j);
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0xe5e7eb })
  );
  pole.position.y = 3;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.4, 0.1),
    new THREE.MeshStandardMaterial({ color: basinPalette[b], emissive: basinPalette[b], emissiveIntensity: 0.35 })
  );
  banner.position.set(1.3, 5.2, 0);
  flag.add(pole, banner);
  flag.position.set(x, filled[k], z);
  basinGroup.add(flag);
}

const streamLines2 = new THREE.LineSegments(streamLines.geometry.clone(), streamLines.material.clone());
streamLines2.geometry.setDrawRange(0, streamSegCount * 2);
streamLines2.material.opacity = 0.85;
basinGroup.add(streamLines2);
const streamGlow2 = new THREE.Points(streamGlow.geometry.clone(), streamGlow.material.clone());
streamGlow2.geometry.setDrawRange(0, streamGlowCount);
streamGlow2.material.opacity = 0.45;
basinGroup.add(streamGlow2);
const streamFlow2 = new StreamFlow(300);
basinGroup.add(streamFlow2.points);

const basinInfo = { el: null };

// ---------- rain simulator ----------
class Rain {
  constructor(count, dem, { stickInPits = false, color = 0x9fdcff } = {}) {
    this.count = count;
    this.dem = dem;
    this.stick = stickInPits;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.state = [];
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 1.25, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, map: circleTex, alphaTest: 0.02,
    }));
    // motion-streak trails (falling = rain streak, sliding = flow trail)
    this.trailPos = new Float32Array(count * 6);
    this.trailCol = new Float32Array(count * 6);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    this.trail = new THREE.LineSegments(this.trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    this.obj = new THREE.Group();
    this.obj.add(this.points, this.trail);
    // splash ripple rings (spawned where drops hit the ground)
    this.splashes = [];
    const ringGeo = new THREE.RingGeometry(0.55, 0.8, 20);
    for (let n = 0; n < 28; n++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xcfeeff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.obj.add(m);
      this.splashes.push({ m, age: 9 });
    }
    this.baseColor = new THREE.Color(color);
    this.stuckColor = new THREE.Color(0xff4757);
    for (let i = 0; i < count; i++) {
      this.state.push({});
      this.respawn(i, true);
    }
  }
  respawn(i, randomY = false) {
    const s = this.state[i];
    s.x = (Math.random() - 0.5) * SIZE * 0.96;
    s.z = (Math.random() - 0.5) * SIZE * 0.96;
    s.y = randomY ? 18 + Math.random() * 26 : 38 + Math.random() * 8;
    s.px = s.x; s.py = s.y; s.pz = s.z;
    s.vx = 0; s.vz = 0;
    s.vy = -(4 + Math.random() * 8); // initial fall speed, gravity does the rest
    s.mode = 'fall';
    s.age = 0;
    this.setColor(i, this.baseColor);
  }
  spawnSplash(x, y, z) {
    const sp = this.splashes.find((s) => s.age > 0.5);
    if (!sp) return;
    sp.age = 0;
    sp.m.position.set(x, y + 0.12, z);
    sp.m.visible = true;
  }
  updateSplashes(dt) {
    for (const sp of this.splashes) {
      if (sp.age > 0.5) { sp.m.visible = false; continue; }
      sp.age += dt;
      const a = sp.age / 0.5;
      sp.m.scale.setScalar(0.4 + a * 4.5);
      sp.m.material.opacity = 0.7 * (1 - a);
    }
  }
  setColor(i, c) {
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.trailCol.set([c.r, c.g, c.b, c.r * 0.35, c.g * 0.35, c.b * 0.35], i * 6);
    this.geo.attributes.color.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }
  grad(x, z) {
    const d = SIZE / N;
    return [
      (heightAt(this.dem, Math.min(SIZE / 2, x + d), z) - heightAt(this.dem, Math.max(-SIZE / 2, x - d), z)) / (2 * d),
      (heightAt(this.dem, x, Math.min(SIZE / 2, z + d)) - heightAt(this.dem, x, Math.max(-SIZE / 2, z - d))) / (2 * d),
    ];
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const s = this.state[i];
      s.age += dt;
      if (s.mode === 'fall') {
        // real gravity: drops accelerate as they fall
        s.vy = Math.max(-46, s.vy - 55 * dt);
        s.y += s.vy * dt;
        const ground = heightAt(this.dem, s.x, s.z);
        if (s.y <= ground + 0.35) {
          s.y = ground + 0.35;
          s.mode = 'slide';
          this.spawnSplash(s.x, ground, s.z);
          s.vx = (Math.random() - 0.5) * 1.5;
          s.vz = (Math.random() - 0.5) * 1.5;
        }
      } else if (s.mode === 'slide') {
        // momentum flow: slope accelerates the drop, friction slows it → smooth water motion
        const [gx, gz] = this.grad(s.x, s.z);
        const gm = Math.hypot(gx, gz);
        s.vx += -gx * 65 * dt;
        s.vz += -gz * 65 * dt;
        const damp = Math.exp(-2.4 * dt);
        s.vx *= damp; s.vz *= damp;
        const spd = Math.hypot(s.vx, s.vz);
        if (spd > 17) { s.vx *= 17 / spd; s.vz *= 17 / spd; }
        if (gm < 0.02 && spd < 0.7) {
          if (this.stick) { s.mode = 'stuck'; this.setColor(i, this.stuckColor); }
        }
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.y = heightAt(this.dem, s.x, s.z) + 0.35;
        if (Math.abs(s.x) > SIZE / 2 - 0.5 || Math.abs(s.z) > SIZE / 2 - 0.5) this.respawn(i);
      } else if (s.mode === 'stuck' && s.age > 9) {
        this.respawn(i);
      }
      if (s.age > 16) this.respawn(i);
      // trailing point: speed-stretched streak while falling, smoothed flow trail while sliding
      if (s.mode === 'fall') {
        s.px = s.x; s.py = s.y + Math.min(3.2, -s.vy * 0.08); s.pz = s.z;
      } else {
        const f = Math.min(1, dt * 4);
        s.px += (s.x - s.px) * f; s.py += (s.y - s.py) * f; s.pz += (s.z - s.pz) * f;
      }
      this.pos[i * 3] = s.x; this.pos[i * 3 + 1] = s.y; this.pos[i * 3 + 2] = s.z;
      this.trailPos.set([s.x, s.y, s.z, s.px, s.py, s.pz], i * 6);
    }
    this.updateSplashes(dt);
    this.geo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.position.needsUpdate = true;
  }
}

const trapRain = new Rain(130, orig, { stickInPits: true });
sinkGroup.add(trapRain.obj);
const basinRain = new Rain(340, filled, { color: 0xe2f4ff });
basinGroup.add(basinRain.obj);

// ============================================================
// QUIZ
// ============================================================
const quizData = [
  {
    q: '1. What does “remote sensing” mean?',
    opts: ['Digging holes to measure the soil', 'Collecting information about the Earth without touching it', 'Drawing maps by hand', 'Measuring rainfall with a bucket'],
    correct: 1,
    explain: 'Remote sensing collects information from a distance — satellites and aircraft record energy reflected or emitted by the surface.',
  },
  {
    q: '2. How does an ACTIVE sensor (like LiDAR or radar) measure ground height?',
    opts: ['It photographs shadows', 'It uses sunlight only', 'It sends a pulse and times the echo — longer time = lower ground', 'It asks a weather station'],
    correct: 2,
    explain: 'Active sensors emit their own signal. The two-way travel time of each pulse gives the distance to the ground, hence the elevation.',
  },
  {
    q: '3. What is a DEM?',
    opts: ['A grid of cells where each cell stores one elevation value', 'A photo of the terrain', 'A list of river names', 'A type of satellite'],
    correct: 0,
    explain: 'A Digital Elevation Model is a raster: a regular grid where every cell holds a single height value.',
  },
  {
    q: '4. Why do we FILL SINKS before doing hydrology on a DEM?',
    opts: ['To make the map prettier', 'Because water in the model gets trapped in depressions and never reaches the outlet', 'To delete the rivers', 'To make the DEM smaller'],
    correct: 1,
    explain: 'Sinks (often data errors) trap simulated flow. Filling raises each depression to its pour point so every drop can drain to the edge.',
  },
  {
    q: '5. In the D8 method, where does water flow from each cell?',
    opts: ['Always north', 'To a random neighbour', 'To the steepest downhill neighbour of the 8 around it', 'Straight up'],
    correct: 2,
    explain: 'D8 looks at the 8 neighbours and sends all flow to the one with the steepest downhill slope.',
  },
  {
    q: '6. What is a watershed?',
    opts: ['A shed where water is stored', 'All the land area that drains to a common outlet', 'Another name for a lake', 'The deepest part of a river'],
    correct: 1,
    explain: 'A watershed (drainage basin / catchment) is the whole area whose runoff converges to the same outlet point. Ridgelines (divides) separate neighbouring watersheds.',
  },
];
let quizIdx = 0, quizScore = 0;
const quizEl = document.getElementById('quiz');
const quizBody = document.getElementById('quizBody');

function renderQuizQuestion() {
  const item = quizData[quizIdx];
  quizBody.innerHTML = '';
  const prog = document.createElement('div');
  prog.className = 'quiz-progress';
  prog.textContent = `QUESTION ${quizIdx + 1} / ${quizData.length} · SCORE ${quizScore}`;
  quizBody.appendChild(prog);
  const q = document.createElement('div');
  q.className = 'quiz-q';
  q.textContent = item.q;
  quizBody.appendChild(q);
  item.opts.forEach((opt, oi) => {
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.textContent = opt;
    b.onclick = () => {
      [...quizBody.querySelectorAll('.quiz-opt')].forEach((x, xi) => {
        x.disabled = true;
        if (xi === item.correct) x.classList.add('correct');
      });
      if (oi !== item.correct) b.classList.add('wrong');
      else quizScore++;
      const ex = document.createElement('div');
      ex.className = 'quiz-explain';
      ex.textContent = (oi === item.correct ? '✅ Correct! ' : '❌ Not quite. ') + item.explain;
      quizBody.appendChild(ex);
      const next = document.createElement('button');
      next.className = 'quiz-next';
      next.textContent = quizIdx < quizData.length - 1 ? 'Next question ▶' : 'See my score 🏁';
      next.onclick = () => {
        quizIdx++;
        if (quizIdx < quizData.length) renderQuizQuestion();
        else renderQuizResult();
      };
      quizBody.appendChild(next);
      prog.textContent = `QUESTION ${quizIdx + 1} / ${quizData.length} · SCORE ${quizScore}`;
    };
    quizBody.appendChild(b);
  });
}
function renderQuizResult() {
  const pct = quizScore / quizData.length;
  const msg = pct === 1 ? '🌟 Perfect! You are ready for real GIS hydrology!'
    : pct >= 0.66 ? '👏 Great job! Review the steps you missed and you\'ll master it.'
    : '💪 Good start! Walk through the journey once more — it will click.';
  quizBody.innerHTML = `
    <div class="quiz-score">${quizScore} / ${quizData.length}</div>
    <p class="quiz-msg">${msg}</p>
    <p class="quiz-msg">You followed elevation data from a <b>satellite</b> to a <b>DEM</b>,
    <b>filled the sinks</b>, traced <b>flow direction</b>, grew the <b>streams</b>,
    and delineated <b>watersheds</b> — the exact workflow used in ArcGIS &amp; QGIS.</p>
    <button class="quiz-restart" id="quizRestart">↺ Replay the journey</button>
    <button class="quiz-next" id="quizClose" style="margin-left:10px">Explore the 3D scene</button>
  `;
  document.getElementById('quizRestart').onclick = () => { quizEl.classList.add('hidden'); gotoStage(0); };
  document.getElementById('quizClose').onclick = () => quizEl.classList.add('hidden');
}

// ============================================================
// STAGE DEFINITIONS
// ============================================================
const interact = document.getElementById('interact');
function chip(text) {
  const s = document.createElement('span');
  s.className = 'chip';
  s.innerHTML = text;
  return s;
}
function widgetBtn(label, fn) {
  const b = document.createElement('button');
  b.innerHTML = label;
  b.onclick = fn;
  return b;
}
function liveSpan() {
  const s = document.createElement('span');
  s.className = 'live';
  return s;
}

const stages = [
  {
    title: '1 · What is Remote Sensing?',
    text: 'Remote sensing means <b>collecting information about the Earth without touching it</b>. Satellites and aircraft carry <b>sensors</b> that record energy reflected or emitted by the surface — and from that we can map vegetation, water, cities… and <b>terrain height</b>.',
    tip: '💡 The cyan beam is the sensor\'s <b>footprint</b> — the patch of ground being measured right now. Drag to fly around the Earth!',
    cam: { pos: [44, 16, 44], tgt: [0, 0, 0] },
    bg: 0x04070d,
    show: () => [earthGroup],
    enter: () => { scanCone.visible = true; pulses.forEach(r => r.visible = true); },
    update: (dt, t) => updateEarthStage(t),
  },
  {
    title: '2 · Passive vs Active Sensors',
    text: 'There are two families of sensors. <b>Passive</b> sensors (yellow) simply record <b>sunlight</b> reflected by the surface — like a camera. <b>Active</b> sensors (blue) such as <b>radar and LiDAR</b> create their <b>own signal</b>, fire it at the ground and listen for the echo. Active sensors work day or night, even through clouds!',
    tip: '💡 Follow the yellow photons (Sun → ground → satellite) and the blue pulses (satellite → ground → satellite).',
    cam: { pos: [34, 22, 42], tgt: [4, 6, 8] },
    bg: 0x04070d,
    show: () => [earthGroup, energyGroup],
    update: (dt, t) => updateEnergyStage(t),
  },
  {
    title: '3 · Measuring Height: Laser Pulses',
    text: 'To map terrain, an <b>active sensor</b> fires thousands of pulses per second and times each echo: <b>longer travel time = lower ground</b>. Sweeping line by line over the landscape, it collects millions of (x, y, elevation) measurements — a <b>point cloud</b>.',
    tip: '💡 Watch the live counter — every flash of the laser records one elevation point!',
    cam: { pos: [0, 62, 98], tgt: [0, 12, 0] },
    bg: 0x060d16,
    show: () => [scanGroup],
    enter: () => {
      cloudGeo.setDrawRange(0, 0);
      const lbl = document.createElement('span');
      lbl.className = 'widget-label';
      lbl.textContent = '📡 Points collected:';
      pulseCounter.el = liveSpan();
      pulseCounter.el.textContent = '0 pts';
      interact.append(lbl, pulseCounter.el);
    },
    update: (dt, t) => updateScanStage(t),
  },
  {
    title: '4 · From Points to a Raster Grid',
    text: 'Millions of scattered points are hard to work with, so GIS averages them into a <b>regular grid of square cells</b> (a <b>raster</b>). Watch each cell rise to the <b>average height of the points inside it</b>. One cell = one number. This demo uses big cells so you can see them — real DEMs use cells of 30 m, 10 m or even 1 m.',
    tip: '💡 Smaller cells = more detail = bigger files. This is called the <b>resolution</b> of the DEM.',
    cam: { pos: [55, 52, 70], tgt: [0, 5, 0] },
    bg: 0x060d16,
    show: () => [rasterGroup],
    enter: () => { rasterCloud.material.opacity = 1; },
    update: (dt, t) => updateRasterStage(dt, t),
  },
  {
    title: '5 · The DEM — Explore It!',
    text: 'Here is the full-resolution <b>Digital Elevation Model (DEM)</b> — a 3D map of the terrain that GIS software can analyse. Colours show elevation: <b>green = low</b>, <b>brown/white = high</b>. It is still just a big table of numbers — one height per cell.',
    tip: '👆 <b>Move your mouse over the terrain</b> to read the elevation of any cell — just like the Identify tool in GIS!',
    cam: { pos: [72, 48, 72], tgt: [0, 4, 0] },
    bg: 0x081019,
    show: () => [terrainGroup],
    hover: true,
    enter: () => {
      startMorph(new Float32Array(N * N), orig, 4);
      interact.append(chip('👆 Hover over the terrain to inspect elevations'));
    },
  },
  {
    title: '6 · The Problem: Sinks',
    text: 'Raw DEMs contain <b>sinks</b> — cells lower than all 8 neighbours, often caused by measurement errors. They break hydrology: simulated water flows in and <b>gets trapped</b>, so rivers can never reach the outlet. The pulsing <b>red areas</b> are real sinks detected in this DEM.',
    tip: '💡 Watch the raindrops: the ones that turn <b>red</b> are stuck in sinks. Real water would overflow and keep going!',
    cam: { pos: [40, 62, 52], tgt: [0, 0, 0] },
    bg: 0x081019,
    show: () => [terrainGroup, sinkGroup],
    hover: true,
    enter: () => setTerrainHeights(orig),
    update: (dt, t) => {
      sinkPts.material.opacity = 0.55 + 0.4 * Math.sin(t * 4);
      trapRain.update(dt);
    },
  },
  {
    title: '7 · Filling the Sinks — You Do It!',
    text: 'GIS fixes sinks with the <b>Fill</b> tool (ArcGIS) or <b>Fill Sinks</b> (QGIS/SAGA): every depression is <b>raised to its pour point</b> — the lowest place where water could escape — exactly as if it filled with water until overflowing. The result is a <b>depressionless DEM</b>.',
    tip: '🎛️ <b>Drag the slider</b> to fill the sinks yourself, or press Auto-fill. The solid blue material is the fill — at 100% it becomes part of the ground!',
    cam: { pos: [52, 44, 58], tgt: [0, 2, 0] },
    bg: 0x081019,
    show: () => [terrainGroup, waterMesh],
    enter: () => {
      setTerrainHeights(orig);
      fillState.p = 0; fillState.auto = false; fillState.swapped = false;
      waterMesh.visible = true;
      setWaterLevel(0);
      const lbl = document.createElement('span');
      lbl.className = 'widget-label';
      lbl.textContent = '🚰 Fill level:';
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = 0;
      slider.oninput = () => { fillState.auto = false; applyFill(slider.value / 100); };
      fillState.slider = slider;
      fillState.readout = liveSpan();
      fillState.readout.textContent = '0%';
      const auto = widgetBtn('▶ Auto-fill', () => { fillState.auto = true; });
      const reset = widgetBtn('↺ Reset', () => {
        fillState.auto = false; fillState.swapped = false;
        setTerrainHeights(orig);
        waterMesh.visible = true;
        applyFill(0);
      });
      interact.append(lbl, slider, fillState.readout, auto, reset);
    },
    update: (dt) => {
      if (fillState.auto && fillState.p < 1) applyFill(clamp01(fillState.p + dt / 6));
      // once the terrain has risen to the fill level, the solid fill becomes part of the DEM
      if (fillState.swapped && !morph.active) waterMesh.visible = false;
    },
  },
  {
    title: '8 · Flow Direction (D8) — Click to Trace!',
    text: 'On the filled DEM, GIS gives every cell a <b>flow direction</b>: water moves to the <b>steepest downhill neighbour</b> of the 8 cells around it (the <b>D8 method</b>). The arrows show the direction each part of the terrain drains. Every drop now has a complete path to the edge.',
    tip: '👆 <b>Click anywhere on the terrain</b> to release a drop and watch its full flow path to the outlet!',
    cam: { pos: [2, 88, 48], tgt: [0, 0, 0] },
    bg: 0x081019,
    show: () => [terrainGroup, flowGroup, traceGroup],
    click: 'trace',
    enter: () => {
      startMorph(currentHeights(), filled, 1.5);
      arrowMesh.material.opacity = 0;
      clearTraces();
      interact.append(chip('👆 Click the terrain to trace a flow path'));
      traceInfo.el = liveSpan();
      interact.append(traceInfo.el);
      interact.append(widgetBtn('🧹 Clear traces', clearTraces));
    },
    update: (dt, t) => {
      arrowMesh.material.opacity = clamp01((t - 0.5) / 2) * 0.9;
      updateTraces(dt);
    },
  },
  {
    title: '9 · Flow Accumulation → Streams',
    text: 'Next, GIS counts <b>how many upstream cells drain through each cell</b> — the <b>flow accumulation</b>. Cells that collect water from a large area become the <b>stream network</b> (blue). Brighter blue = more upstream area = a bigger river. This is how rivers are extracted automatically from a DEM!',
    tip: '👆 Still clickable! Trace drops and watch them join the blue streams. A common rule: cells with accumulation above a threshold = "stream".',
    cam: { pos: [30, 70, 60], tgt: [0, 0, 0] },
    bg: 0x081019,
    show: () => [terrainGroup, streamGroup, traceGroup],
    click: 'trace',
    enter: () => {
      setTerrainHeights(filled);
      streamLines.geometry.setDrawRange(0, 0);
      streamGlow.geometry.setDrawRange(0, 0);
      interact.append(chip('👆 Click to trace — drops follow the streams'));
      traceInfo.el = liveSpan();
      interact.append(traceInfo.el, widgetBtn('🧹 Clear traces', clearTraces));
    },
    update: (dt, t) => {
      const sp = easeInOut(clamp01(t / 6));
      streamLines.geometry.setDrawRange(0, Math.floor(sp * streamSegCount) * 2);
      streamGlow.geometry.setDrawRange(0, Math.floor(sp * streamGlowCount));
      streamFlow.points.material.opacity = 0.85 * sp;
      streamFlow.update(dt);
      updateTraces(dt);
    },
  },
  {
    title: '10 · Watersheds in 3D — Click a Basin!',
    text: 'A <b>watershed</b> (drainage basin / catchment) is <b>all the land that drains to a common outlet</b>. GIS traces every cell\'s flow path and groups cells by the outlet they reach — each colour is one watershed. Dark dots mark the <b>drainage divides</b> (ridgelines); flags mark the main <b>outlets</b>.',
    tip: '👆 <b>Click any coloured area</b> to highlight that watershed and see its size. Watch the rain drain each basin to its own outlet!',
    cam: { pos: [62, 58, 66], tgt: [0, 2, 0] },
    bg: 0x081019,
    show: () => [basinGroup, traceGroup],
    click: 'basin',
    enter: () => {
      recolorBasins(null);
      clearTraces();
      interact.append(chip('👆 Click a coloured basin to inspect it'));
      basinInfo.el = liveSpan();
      interact.append(basinInfo.el, widgetBtn('🎨 Show all basins', () => {
        recolorBasins(null);
        if (basinInfo.el) basinInfo.el.textContent = '';
      }));
    },
    update: (dt) => {
      basinRain.update(dt);
      streamFlow2.update(dt);
      updateTraces(dt);
    },
  },
  {
    title: '11 · Recap & Quiz',
    text: 'You followed the complete workflow: <b>satellite → pulses → point cloud → raster DEM → fill sinks → flow direction → flow accumulation → watersheds</b>. This is exactly what tools like ArcGIS Hydrology or QGIS/SAGA do. Now prove you understood it!',
    tip: '🎓 Answer the questions — instant feedback with explanations.',
    cam: { pos: [80, 66, 80], tgt: [0, 2, 0] },
    bg: 0x081019,
    show: () => [basinGroup],
    enter: () => {
      quizIdx = 0; quizScore = 0;
      renderQuizQuestion();
      quizEl.classList.remove('hidden');
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
    },
    leave: () => {
      quizEl.classList.add('hidden');
      controls.autoRotate = false;
    },
    update: (dt) => { basinRain.update(dt); streamFlow2.update(dt); },
  },
];

// ============================================================
// STAGE MANAGER
// ============================================================
const allGroups = [earthGroup, energyGroup, scanGroup, rasterGroup, terrainGroup, sinkGroup, waterMesh, flowGroup, streamGroup, traceGroup, basinGroup];
let stageIdx = -1;
let stageTime = 0;
const camTween = { active: false, t: 0, dur: 1.8, fromP: new THREE.Vector3(), toP: new THREE.Vector3(), fromT: new THREE.Vector3(), toT: new THREE.Vector3() };

function gotoStage(idx) {
  if (idx < 0 || idx >= stages.length || idx === stageIdx) return;
  if (stageIdx >= 0) stages[stageIdx].leave?.();
  stageIdx = idx;
  stageTime = 0;
  const st = stages[idx];
  for (const g of allGroups) g.visible = false;
  for (const g of st.show()) g.visible = true;
  probeGroup.visible = false;
  tooltip.classList.add('hidden');
  interact.innerHTML = '';
  st.enter?.();
  bgTarget.setHex(st.bg ?? 0x04070d);
  camTween.active = true; camTween.t = 0;
  camTween.fromP.copy(camera.position);
  camTween.toP.set(...st.cam.pos);
  camTween.fromT.copy(controls.target);
  camTween.toT.set(...st.cam.tgt);
  updateUI();
}

// ============================================================
// RAYCASTING (hover probe + click trace / basin select)
// ============================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerClient = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointerClient = { x: e.clientX, y: e.clientY };
});

let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6 || stageIdx < 0) return; // it was a drag, not a click
  const st = stages[stageIdx];
  if (!st.click) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const target = st.click === 'basin' ? basinMesh : terrainMesh;
  const hit = raycaster.intersectObject(target)[0];
  if (!hit) return;
  if (st.click === 'trace') {
    addTrace(hit.point);
  } else if (st.click === 'basin') {
    const i = Math.round((hit.point.x / SIZE + 0.5) * (N - 1));
    const j = Math.round((hit.point.z / SIZE + 0.5) * (N - 1));
    const k = Math.max(0, Math.min(N * N - 1, j * N + i));
    const lab = labels[k];
    recolorBasins(lab);
    addTrace(hit.point);
    if (basinInfo.el) {
      const st2 = stats.find((s) => s.label === lab);
      const rank = labelRank.get(lab);
      const name = rank < basinNames.length ? basinNames[rank] : 'Minor basin';
      const km2 = (st2.count * 0.0009 * M_PER_UNIT).toFixed(1); // playful scale
      basinInfo.el.textContent = `${name}: ${st2.count.toLocaleString()} cells ≈ ${km2} km²`;
    }
  }
});

function updateHoverProbe() {
  const st = stages[stageIdx];
  if (!st || !st.hover || !terrainGroup.visible) {
    probeGroup.visible = false;
    tooltip.classList.add('hidden');
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(terrainMesh)[0];
  if (!hit) {
    probeGroup.visible = false;
    tooltip.classList.add('hidden');
    return;
  }
  probeGroup.visible = true;
  probeGroup.position.copy(hit.point);
  const i = Math.round((hit.point.x / SIZE + 0.5) * (N - 1));
  const j = Math.round((hit.point.z / SIZE + 0.5) * (N - 1));
  const k = Math.max(0, Math.min(N * N - 1, j * N + i));
  const elev = Math.round(orig[k] * M_PER_UNIT + 200);
  const isSink = sinkMask[k] === 1;
  tooltip.innerHTML = `⛰️ Elevation: <b>${elev} m</b><br>Cell: row ${j}, col ${i}${isSink ? '<br>🕳️ <b style="color:#ff8a8a">This cell is in a SINK!</b>' : ''}`;
  tooltip.style.left = pointerClient.x + 'px';
  tooltip.style.top = pointerClient.y + 'px';
  tooltip.classList.remove('hidden');
}

// ============================================================
// UI
// ============================================================
const $ = (id) => document.getElementById(id);
const dotsEl = $('dots');
stages.forEach((st, i) => {
  const d = document.createElement('div');
  d.className = 'dot';
  d.title = st.title;
  d.onclick = () => gotoStage(i);
  dotsEl.appendChild(d);
});

function updateUI() {
  const st = stages[stageIdx];
  $('stageBadge').textContent = `Step ${stageIdx + 1} of ${stages.length}`;
  $('stageTitle').textContent = st.title;
  $('stageText').innerHTML = st.text;
  $('stageTip').innerHTML = st.tip;
  $('prevBtn').disabled = stageIdx === 0;
  $('nextBtn').disabled = stageIdx === stages.length - 1;
  [...dotsEl.children].forEach((d, i) => {
    d.classList.toggle('active', i === stageIdx);
    d.classList.toggle('done', i < stageIdx);
  });
}

$('prevBtn').onclick = () => gotoStage(stageIdx - 1);
$('nextBtn').onclick = () => gotoStage(stageIdx + 1);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') gotoStage(stageIdx + 1);
  if (e.key === 'ArrowLeft') gotoStage(stageIdx - 1);
});

let started = false;
$('startBtn').onclick = () => {
  $('intro').classList.add('fade');
  setTimeout(() => $('intro').remove(), 900);
  ['brand', 'panel', 'hint', 'foot'].forEach((id) => $(id).classList.remove('hidden'));
  started = true;
  gotoStage(0);
};

// ============================================================
// MAIN LOOP
// ============================================================
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  bgCurrent.lerp(bgTarget, 0.03);
  scene.background = bgCurrent;
  if (started && stageIdx >= 0) {
    stageTime += dt;
    stages[stageIdx].update?.(dt, stageTime);
    updateMorph(dt);
    updateHoverProbe();
    if (camTween.active) {
      camTween.t += dt;
      const p = easeInOut(clamp01(camTween.t / camTween.dur));
      camera.position.lerpVectors(camTween.fromP, camTween.toP, p);
      controls.target.lerpVectors(camTween.fromT, camTween.toT, p);
      if (camTween.t >= camTween.dur) camTween.active = false;
    }
    if ($('autoChk').checked && stageTime > 24 && stageIdx < stages.length - 1) {
      gotoStage(stageIdx + 1);
    }
  } else {
    updateEarthStage(clock.elapsedTime);
    earthGroup.visible = true;
  }
  controls.update();
  renderer.render(scene, camera);
}
for (const g of allGroups) g.visible = false;
earthGroup.visible = true;
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
