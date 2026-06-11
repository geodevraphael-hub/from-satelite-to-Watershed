// ============================================================
// GeoInsight Enterprise — terrain & hydrology engine
// Heightfield generation, sink filling (priority-flood),
// D8 flow direction, flow accumulation, watershed labelling.
// ============================================================

export const N = 96;        // grid vertices per side
export const SIZE = 100;    // world size

// ---------- deterministic value noise ----------
function hash(ix, iy) {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  const u = smooth(fx), v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
  let s = 0, amp = 0.55, f = 1;
  for (let o = 0; o < 5; o++) { s += amp * noise2(x * f, y * f); amp *= 0.5; f *= 2.05; }
  return s;
}

// ---------- heightfield with deliberate depressions (sinks) ----------
export function generateHeights() {
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), v = j / (N - 1);
      let y = 11.0 * fbm(u * 4.3 + 7.1, v * 4.3 + 3.7);
      y += 5.0 * v;                                   // tilt: north (j=0) is low → main outlet side
      y += 2.2 * fbm(u * 11 + 21, v * 11 + 13);       // detail
      // soft valley running down the middle
      y -= 2.6 * Math.exp(-Math.pow((u - 0.5 + 0.18 * Math.sin(v * 6)) * 4.2, 2));
      h[j * N + i] = y;
    }
  }
  // carve depressions (sinks) — these are what GIS "Fill" repairs
  const pits = [
    [0.30, 0.38, 2.4, 4.2], [0.66, 0.55, 2.0, 3.6], [0.48, 0.72, 2.6, 4.6],
    [0.20, 0.66, 1.6, 3.0], [0.78, 0.30, 1.8, 3.4], [0.58, 0.22, 1.4, 2.8],
  ];
  for (const [pu, pv, depth, sig] of pits) {
    const ci = pu * (N - 1), cj = pv * (N - 1);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const d2 = (i - ci) * (i - ci) + (j - cj) * (j - cj);
        h[j * N + i] -= depth * Math.exp(-d2 / (2 * sig * sig));
      }
    }
  }
  // normalize min to 0
  let mn = Infinity;
  for (let k = 0; k < h.length; k++) mn = Math.min(mn, h[k]);
  for (let k = 0; k < h.length; k++) h[k] -= mn;
  return h;
}

// ---------- min-heap (key, index) ----------
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const topV = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < k.length && k[l] < k[s]) s = l;
        if (r < k.length && k[r] < k[s]) s = r;
        if (s === i) break;
        [k[s], k[i]] = [k[i], k[s]]; [v[s], v[i]] = [v[i], v[s]]; i = s;
      }
    }
    return topV;
  }
}

// ---------- sink filling: priority-flood (Barnes et al.) ----------
export function fillSinks(h) {
  const out = Float32Array.from(h);
  const visited = new Uint8Array(N * N);
  const heap = new MinHeap();
  const EPS = 0.0008; // tiny gradient so water always drains
  for (let i = 0; i < N; i++) {
    for (const idx of [i, (N - 1) * N + i, i * N, i * N + N - 1]) {
      if (!visited[idx]) { visited[idx] = 1; heap.push(out[idx], idx); }
    }
  }
  const di = [-1, 1, 0, 0, -1, -1, 1, 1];
  const dj = [0, 0, -1, 1, -1, 1, -1, 1];
  while (heap.size) {
    const c = heap.pop();
    const ci = c % N, cj = (c / N) | 0;
    for (let d = 0; d < 8; d++) {
      const ni = ci + di[d], nj = cj + dj[d];
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni;
      if (visited[n]) continue;
      visited[n] = 1;
      out[n] = Math.max(h[n], out[c] + EPS);
      heap.push(out[n], n);
    }
  }
  return out;
}

// ---------- D8 flow direction (index of downstream cell, -1 = outlet) ----------
export function flowDirections(h) {
  const dir = new Int32Array(N * N).fill(-1);
  const di = [-1, 1, 0, 0, -1, -1, 1, 1];
  const dj = [0, 0, -1, 1, -1, 1, -1, 1];
  const dist = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = j * N + i;
      let best = -1, bestS = 0;
      for (let d = 0; d < 8; d++) {
        const ni = i + di[d], nj = j + dj[d];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const s = (h[c] - h[nj * N + ni]) / dist[d];
        if (s > bestS) { bestS = s; best = nj * N + ni; }
      }
      dir[c] = best;
    }
  }
  return dir;
}

// ---------- flow accumulation (cells draining through each cell) ----------
export function flowAccumulation(h, dir) {
  const order = Array.from({ length: N * N }, (_, k) => k).sort((a, b) => h[b] - h[a]);
  const acc = new Float32Array(N * N).fill(1);
  for (const c of order) {
    if (dir[c] >= 0) acc[dir[c]] += acc[c];
  }
  return acc;
}

// ---------- watershed labels: which outlet does each cell drain to ----------
export function watershedLabels(dir) {
  // dir comes from the filled DEM, so paths strictly descend (no cycles).
  const label = new Int32Array(N * N).fill(-1);
  const stack = [];
  for (let c = 0; c < N * N; c++) {
    if (label[c] !== -1) continue;
    stack.length = 0;
    let cur = c;
    while (label[cur] === -1 && dir[cur] !== -1) {
      stack.push(cur);
      cur = dir[cur];
    }
    const lab = label[cur] !== -1 ? label[cur] : cur; // terminal outlet labels itself
    label[cur] = lab;
    for (const s of stack) label[s] = lab;
  }
  return label;
}

// basin stats: returns [{label, count}] sorted by area desc
export function basinStats(label) {
  const map = new Map();
  for (let c = 0; c < label.length; c++) {
    map.set(label[c], (map.get(label[c]) || 0) + 1);
  }
  return [...map.entries()].map(([l, count]) => ({ label: l, count }))
    .sort((a, b) => b.count - a.count);
}

// world helpers
export function gridToWorld(i, j) {
  return [
    (i / (N - 1) - 0.5) * SIZE,
    (j / (N - 1) - 0.5) * SIZE,
  ];
}
export function heightAt(h, x, z) {
  // bilinear sample, x/z in world coords
  const fi = (x / SIZE + 0.5) * (N - 1);
  const fj = (z / SIZE + 0.5) * (N - 1);
  const i = Math.max(0, Math.min(N - 2, Math.floor(fi)));
  const j = Math.max(0, Math.min(N - 2, Math.floor(fj)));
  const u = Math.max(0, Math.min(1, fi - i)), v = Math.max(0, Math.min(1, fj - j));
  const a = h[j * N + i], b = h[j * N + i + 1];
  const c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
