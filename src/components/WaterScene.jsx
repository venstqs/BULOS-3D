import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { get } from '../api';
import { stationStatus } from '../lib/format';
import { riverAt } from '../lib/twinField';
import { NOISE, RAIN_FRAG, RAIN_VERT, RIBBON_VERT, RIVER_FRAG, paintRiver } from '../lib/waterShaders';

// The watershed as a physical model: real Copernicus elevation, a carved river channel,
// and water drawn by shaders, so the water itself is what you look at.
// Units are kilometres. Satellite imagery is draped on when online; without it the model
// falls back to relief colours, so it still works with only the data server.
const RELIEF = 2.6;             // terrain height exaggeration
const IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const bandOf = (r) => (r >= 0.6 ? 'SEVERE' : r >= 0.45 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW');

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Lon/lat/height to scene coordinates for this grid. */
function projector(t) {
  const lat0 = (t.north + t.south) / 2;
  const lon0 = (t.west + t.east) / 2;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return {
    x: (lon) => (lon - lon0) * kx,
    z: (lat) => -(lat - lat0) * 111.32,
    y: (m) => (m / 1000) * RELIEF,
    w: (t.east - t.west) * kx,
    d: (t.north - t.south) * 111.32,
  };
}

function loadGrid(t) {
  const raw = bytes(t.elev);
  const i16 = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  const elev = Float32Array.from(i16, (v) => v / 10);
  return { elev, hand: bytes(t.hand) };
}

/** Stitch satellite tiles for the grid into one texture, with each vertex's place on it. */
async function satellite(t, ground) {
  const Z = 14;
  const n = 2 ** Z;
  const tx = (lon) => ((lon + 180) / 360) * n;
  const ty = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; };
  const [x0, x1, y0, y1] = [Math.floor(tx(t.west)), Math.floor(tx(t.east)), Math.floor(ty(t.north)), Math.floor(ty(t.south))];
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * 256;
  canvas.height = (y1 - y0 + 1) * 256;
  const g = canvas.getContext('2d');
  const jobs = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      jobs.push(new Promise((ok, no) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { g.drawImage(img, (x - x0) * 256, (y - y0) * 256); ok(); };
        img.onerror = no;
        img.src = IMAGERY.replace('{z}', Z).replace('{y}', y).replace('{x}', x);
      }));
    }
  }
  const done = await Promise.allSettled(jobs);
  if (done.filter((d) => d.status === 'fulfilled').length < done.length * 0.8) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  const geo = ground.clone();
  const uv = geo.getAttribute('uv');
  for (let r = 0; r < t.nrows; r += 1) {
    const lat = t.north - (r / (t.nrows - 1)) * (t.north - t.south);
    for (let q = 0; q < t.ncols; q += 1) {
      const lon = t.west + (q / (t.ncols - 1)) * (t.east - t.west);
      uv.setXY(r * t.ncols + q, (tx(lon) - x0) / (x1 - x0 + 1), (ty(lat) - y0) / (y1 - y0 + 1));
    }
  }
  return { tex, geo };
}

/** Lower the ground under the river so the water sits in a real channel. */
function carve(elev, t, coords, radius, depth) {
  const r0 = (t.north - t.south) / (t.nrows - 1);
  const c0 = (t.east - t.west) / (t.ncols - 1);
  for (const [lon, lat, z] of coords) {
    const r = Math.round((t.north - lat) / r0);
    const c = Math.round((lon - t.west) / c0);
    for (let i = -radius; i <= radius; i += 1) {
      for (let j = -radius; j <= radius; j += 1) {
        const [rr, cc] = [r + i, c + j];
        if (rr < 0 || cc < 0 || rr >= t.nrows || cc >= t.ncols) continue;
        const k = rr * t.ncols + cc;
        elev[k] = Math.min(elev[k], z - depth * (1 - 0.45 * (Math.abs(i) + Math.abs(j)) / Math.max(1, 2 * radius)));
      }
    }
  }
}

const HYPSO = [[0, '#8fbf86'], [40, '#79b078'], [160, '#5e9c68'], [500, '#47855b'], [1000, '#5f8a68'], [1500, '#8c9a80'], [2000, '#b5b3a1']]
  .map(([h, c]) => [h, new THREE.Color(c)]);

function hypso(h, out) {
  if (h <= HYPSO[0][0]) return out.copy(HYPSO[0][1]);
  for (let i = 1; i < HYPSO.length; i += 1) {
    if (h <= HYPSO[i][0]) return out.lerpColors(HYPSO[i - 1][1], HYPSO[i][1], (h - HYPSO[i - 1][0]) / (HYPSO[i][0] - HYPSO[i - 1][0]));
  }
  return out.copy(HYPSO.at(-1)[1]);
}

/** Terrain surface plus a skirt, so the model reads as a solid block on a table. */
function terrainGeometry(t, elev, p) {
  const { nrows, ncols } = t;
  const pos = new Float32Array(nrows * ncols * 3);
  const uv = new Float32Array(nrows * ncols * 2);
  const col = new Float32Array(nrows * ncols * 3);
  const c = new THREE.Color();
  for (let r = 0; r < nrows; r += 1) {
    for (let q = 0; q < ncols; q += 1) {
      const k = r * ncols + q;
      const h = elev[k];
      pos.set([(q / (ncols - 1) - 0.5) * p.w, p.y(Math.max(h, -8)), (r / (nrows - 1) - 0.5) * p.d], k * 3);
      uv.set([q / (ncols - 1), r / (nrows - 1)], k * 2);
      hypso(h, c);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const idx = new Uint32Array((nrows - 1) * (ncols - 1) * 6);
  let n = 0;
  for (let r = 0; r < nrows - 1; r += 1) {
    for (let q = 0; q < ncols - 1; q += 1) {
      const a = r * ncols + q;
      idx.set([a, a + ncols, a + 1, a + 1, a + ncols, a + ncols + 1], n);
      n += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

function skirtGeometry(g, t, base) {
  const { nrows, ncols } = t;
  const P = g.getAttribute('position');
  const edge = [];
  for (let q = 0; q < ncols; q += 1) edge.push(q);
  for (let r = 1; r < nrows; r += 1) edge.push(r * ncols + ncols - 1);
  for (let q = ncols - 2; q >= 0; q -= 1) edge.push((nrows - 1) * ncols + q);
  for (let r = nrows - 2; r >= 0; r -= 1) edge.push(r * ncols);
  const pos = [];
  for (let i = 0; i < edge.length - 1; i += 1) {
    const [a, b] = [edge[i], edge[i + 1]];
    const [ax, ay, az, bx, by, bz] = [P.getX(a), Math.max(P.getY(a), 0), P.getZ(a), P.getX(b), Math.max(P.getY(b), 0), P.getZ(b)];
    pos.push(ax, ay, az, bx, by, bz, ax, base, az, bx, by, bz, bx, base, bz, ax, base, az);
  }
  const s = new THREE.BufferGeometry();
  s.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  s.computeVertexNormals();
  return s;
}

/** Smooth a stair-stepped DEM line so ribbons bend like water. */
function smooth(coords, window = 2) {
  return coords.map((c, i) => {
    let [x, y, n] = [0, 0, 0];
    for (let j = Math.max(0, i - window); j <= Math.min(coords.length - 1, i + window); j += 1) { x += coords[j][0]; y += coords[j][1]; n += 1; }
    return [x / n, y / n, c[2]];
  });
}

/** A flat strip along a path. uv.x = km along it, uv.y = 0..1 across, aS = 0..1 along. */
function ribbon(coords, p, width, lift) {
  const pts = smooth(coords).map(([lon, lat, z]) => new THREE.Vector3(p.x(lon), p.y(z) + lift, p.z(lat)));
  const pos = [];
  const uv = [];
  const s = [];
  const idx = [];
  let along = 0;
  const side = new THREE.Vector3();
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    side.set(-(b.z - a.z), 0, b.x - a.x).normalize();
    if (i) along += pts[i].distanceTo(pts[i - 1]);
    const f = i / (pts.length - 1);
    const half = width(f) / 2;
    pos.push(pts[i].x + side.x * half, pts[i].y, pts[i].z + side.z * half, pts[i].x - side.x * half, pts[i].y, pts[i].z - side.z * half);
    uv.push(along, 0, along, 1);
    s.push(f, f);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  }
  return { pos, uv, s, idx, pts };
}

function ribbonsToGeometry(list) {
  const g = new THREE.BufferGeometry();
  const [pos, uv, s, idx] = [[], [], [], []];
  for (const r of list) {
    const base = pos.length / 3;
    pos.push(...r.pos); uv.push(...r.uv); s.push(...r.s);
    for (const i of r.idx) idx.push(i + base);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
  g.setIndex(idx);
  return g;
}

const FLOOD_VERT = `
attribute float aHand; varying float vHand; varying vec3 vW;
void main(){ vHand=aHand; vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.0); }`;

const FLOOD_FRAG = `
precision highp float;
uniform float uTime; uniform float uLevel; varying float vHand; varying vec3 vW;
${NOISE}
void main(){
  if (vHand >= uLevel) discard;
  float depth = clamp((uLevel - vHand) / 4.0, 0.0, 1.0);
  float n = noise(vW.xz * 6.0 + uTime * 0.25);
  vec3 c = mix(vec3(0.42, 0.74, 0.98), vec3(0.08, 0.36, 0.8), depth);
  gl_FragColor = vec4(c + n * 0.08, 0.42 + depth * 0.4);
}`;

function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [o.material].flat()) { m?.map?.dispose?.(); m?.dispose?.(); }
  });
}

export default function WaterScene({ staticData, live, heatmap, selectedId, onSelect, onInspect, layers, tauStep, atTime, controls, onTour }) {
  const host = useRef(null);
  const labels = useRef({});
  const world = useRef(null);
  const [terrain, setTerrain] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [failed, setFailed] = useState(false);
  const [imagery, setImagery] = useState(false);
  if (fatal) throw fatal;

  useEffect(() => {
    let alive = true;
    get('/api/terrain').then((t) => { if (alive) setTerrain(t); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  /* ---------------- build the model ---------------- */
  useEffect(() => {
    if (!terrain || !staticData) return undefined;
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      setFatal(new Error(`3D view could not start (${e.message}). WebGL may be disabled.`));
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI / 2.05;
    orbit.minDistance = 3;
    orbit.maxDistance = 90;

    const hemi = new THREE.HemisphereLight('#f4f8ff', '#6f8f7a', 1.5);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-18, 16, 10);
    scene.add(hemi, sun);

    const p = projector(terrain);
    const { elev, hand } = loadGrid(terrain);
    const stem = staticData.main_stem;
    const bigStreams = staticData.streams.filter((s) => s.area_km2 >= 0.5);
    carve(elev, terrain, stem, 1, 7);
    for (const s of bigStreams) carve(elev, terrain, s.coords, 0, 3);

    const ground = terrainGeometry(terrain, elev, p);
    const land = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    const base = -0.55;
    const skirt = new THREE.Mesh(skirtGeometry(ground, terrain, base), new THREE.MeshStandardMaterial({ color: '#6f6a5f', roughness: 1, side: THREE.DoubleSide }));
    scene.add(land, skirt);

    const time = { value: 0 };
    let gone = false;
    satellite(terrain, ground).then((sat) => {
      if (!sat) return;
      if (gone) { sat.tex.dispose(); sat.geo.dispose(); return; }
      sat.tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      land.geometry = sat.geo;
      land.material.map = sat.tex;
      land.material.vertexColors = false;
      land.material.needsUpdate = true;
      setImagery(true);
    });
    // River: its colour along the channel lives in a small texture, rewritten on each update
    const field = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
    field.minFilter = THREE.LinearFilter;
    field.magFilter = THREE.LinearFilter;
    const flowMat = (tint, useField, flow) => new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { uTime: time, uFlow: { value: flow }, uField: { value: field }, uTint: { value: new THREE.Color(tint) }, uUseField: { value: useField } },
    });
    const main = ribbon(stem, p, (f) => 0.14 + 0.34 * f, 0.012);
    const river = new THREE.Mesh(ribbonsToGeometry([main]), flowMat('#3aa8ff', 1, 1.5));
    river.renderOrder = 3;
    const streamMesh = new THREE.Mesh(
      ribbonsToGeometry(bigStreams.map((s) => ribbon(s.coords, p, () => Math.min(0.13, 0.05 + 0.012 * Math.sqrt(s.area_km2)), 0.01))),
      flowMat('#6cc4ff', 0, 1.1),
    );
    streamMesh.renderOrder = 2;
    scene.add(river, streamMesh);

    const pipes = (staticData.pipes ?? []).map((pipe) => {
      const m = new THREE.Mesh(ribbonsToGeometry([ribbon(pipe.coords, p, () => 0.05, 0.03)]), flowMat('#f4f8ff', 0, 1.8));
      m.renderOrder = 4;
      m.userData.pipeId = pipe.id;
      scene.add(m);
      return m;
    });

    // Rising flood water on low ground beside the river
    const handAttr = new Float32Array(hand.length);
    for (let i = 0; i < hand.length; i += 1) handAttr[i] = hand[i] === 255 ? 999 : hand[i] / 4;
    const sheet = ground.clone();
    sheet.setAttribute('aHand', new THREE.BufferAttribute(handAttr, 1));
    const floodLevel = { value: 0 };
    const flood = new THREE.Mesh(sheet, new THREE.ShaderMaterial({
      vertexShader: FLOOD_VERT, fragmentShader: FLOOD_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: time, uLevel: floodLevel }, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    flood.renderOrder = 1;
    flood.visible = false;
    scene.add(flood);

    // Risk painted on the ground
    const heatData = new Uint8Array(terrain.nrows * terrain.ncols * 4);
    const heatTex = new THREE.DataTexture(heatData, terrain.ncols, terrain.nrows, THREE.RGBAFormat);
    heatTex.minFilter = THREE.LinearFilter;
    heatTex.magFilter = THREE.LinearFilter;
    const heat = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ map: heatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    heat.renderOrder = 1;
    heat.visible = false;
    scene.add(heat);

    // Rain
    const drops = 1600;
    const rainPos = new Float32Array(drops * 6);
    const rainSeed = new Float32Array(drops * 2);
    const top = 9;
    for (let i = 0; i < drops; i += 1) {
      const [x, y, z, s] = [(Math.random() - 0.5) * p.w, Math.random() * top, (Math.random() - 0.5) * p.d, Math.random()];
      rainPos.set([x, y, z, x + 0.02, y + 0.28, z], i * 6);
      rainSeed.set([s, s], i * 2);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(rainSeed, 1));
    const rainAmount = { value: 0 };
    const rain = new THREE.LineSegments(rainGeo, new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: time, uTop: { value: top }, uAmount: rainAmount },
    }));
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);

    // Plume front marker
    const front = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), new THREE.MeshBasicMaterial({ color: '#ff5a36', depthTest: false, transparent: true }));
    front.renderOrder = 7;
    front.visible = false;
    scene.add(front);

    // Water points
    const posOf = (lon, lat) => {
      const c = Math.round(((lon - terrain.west) / (terrain.east - terrain.west)) * (terrain.ncols - 1));
      const r = Math.round(((terrain.north - lat) / (terrain.north - terrain.south)) * (terrain.nrows - 1));
      return new THREE.Vector3(p.x(lon), p.y(elev[r * terrain.ncols + c]) + 0.03, p.z(lat));
    };
    const points = {};

    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const resize = new ResizeObserver(fit);
    resize.observe(el);
    fit();

    // Frame the river, not the whole block
    const mid = main.pts[Math.floor(main.pts.length * 0.62)];
    const span = main.pts[0].distanceTo(main.pts.at(-1));
    const dist = span * Math.max(1.08, 1.34 / camera.aspect);
    const homeTarget = new THREE.Vector3(mid.x, 0.1, mid.z);
    const homePos = new THREE.Vector3(mid.x - 0.08 * dist, 0.6 * dist, mid.z + 0.74 * dist);
    camera.position.copy(homePos);
    orbit.target.copy(homeTarget);

    let flight = null;
    const flyTo = (pos, target, seconds = 1.3) => {
      flight = { p0: camera.position.clone(), t0: orbit.target.clone(), p1: pos, t1: target, start: performance.now(), ms: seconds * 1000 };
    };

    let tour = null;
    const stopTour = () => {
      if (!tour) return;
      tour = null;
      orbit.enabled = true;
      onTour?.(false);
    };
    const startTour = () => {
      if (tour) return;
      flight = null;
      tour = { start: performance.now(), ms: 36000 };
      orbit.enabled = false;
      onTour?.(true);
    };
    renderer.domElement.addEventListener('pointerdown', stopTour);
    controls.current = { home: () => flyTo(homePos.clone(), homeTarget.clone()), startTour, stopTour };

    const state = { frontTarget: null, frontS: null, level: 0, rainTarget: 0, pipeFlow: {} };
    const spot = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    let raf;
    let last = performance.now();
    const clock = () => {
      raf = requestAnimationFrame(clock);
      if (document.hidden) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time.value = now / 1000;

      floodLevel.value += (state.level - floodLevel.value) * Math.min(1, dt * 1.6);
      rainAmount.value += (state.rainTarget - rainAmount.value) * Math.min(1, dt * 2);
      rain.visible = rainAmount.value > 0.02;
      hemi.intensity = 1.5 - 0.55 * rainAmount.value;
      sun.intensity = 2.6 - 1.7 * rainAmount.value;

      if (state.frontTarget != null) {
        state.frontS = state.frontS == null ? state.frontTarget : state.frontS + (state.frontTarget - state.frontS) * Math.min(1, dt * 2.5);
        const k = state.frontS * (main.pts.length - 1);
        const i = Math.floor(k);
        front.position.lerpVectors(main.pts[i], main.pts[Math.min(main.pts.length - 1, i + 1)], k - i);
        front.position.y += 0.1;
        front.scale.setScalar(1 + 0.22 * Math.sin(now / 240));
      }

      for (const pt of Object.values(points)) {
        pt.height += (pt.targetHeight - pt.height) * Math.min(1, dt * 4);
        pt.pillar.scale.y = pt.height;
        pt.pillar.position.y = pt.base.y + pt.height / 2;
        const ph = (now / 1500 + pt.phase) % 1;
        pt.ring.scale.setScalar(0.5 + ph * 1.9);
        pt.ring.material.opacity = (1 - ph) * 0.9;
      }

      if (tour) {
        const f = (now - tour.start) / tour.ms;
        if (f >= 1) { stopTour(); flyTo(homePos.clone(), homeTarget.clone(), 2); } else {
          const n = main.pts.length - 1;
          const i = Math.min(n - 1, Math.floor(f * 0.97 * n));
          const look = main.pts[Math.min(n, i + 26)];
          const back = main.pts[Math.max(0, i - 22)];
          spot.copy(back);
          spot.y += 2.4;
          camera.position.lerp(spot, 0.04);
          ahead.lerp(look, 0.05);
          camera.lookAt(ahead);
        }
      } else if (flight) {
        const f = Math.min(1, (now - flight.start) / flight.ms);
        const e = f * f * (3 - 2 * f);
        camera.position.lerpVectors(flight.p0, flight.p1, e);
        orbit.target.lerpVectors(flight.t0, flight.t1, e);
        if (f >= 1) flight = null;
        orbit.update();
      } else {
        orbit.update();
      }

      renderer.render(scene, camera);

      const w = el.clientWidth;
      const h = el.clientHeight;
      for (const [id, pt] of Object.entries(points)) {
        const tag = labels.current[id];
        if (!tag) continue;
        spot.copy(pt.base).project(camera);
        const on = spot.z < 1 && Math.abs(spot.x) < 1.05 && Math.abs(spot.y) < 1.05;
        tag.style.display = on ? '' : 'none';
        tag.style.transform = `translate(-50%, -50%) translate(${((spot.x + 1) / 2) * w}px, ${((1 - spot.y) / 2) * h}px)`;
      }
      const tag = labels.current.front;
      if (tag) {
        spot.copy(front.position).project(camera);
        tag.style.display = front.visible ? '' : 'none';
        tag.style.transform = `translate(-50%, 16px) translate(${((spot.x + 1) / 2) * w}px, ${((1 - spot.y) / 2) * h}px)`;
      }
    };
    clock();

    world.current = { scene, state, points, posOf, field, river, streamMesh, pipes, flood, heat, heatTex, heatData, front, main };
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer.domElement.removeEventListener('pointerdown', stopTour);
      onTour?.(false);
      orbit.dispose();
      dispose(scene);
      field.dispose();
      heatTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      world.current = null;
      controls.current = {};
    };
  }, [terrain, staticData, controls, onTour]);

  /* ---------------- live state into the model ---------------- */
  useEffect(() => {
    const w = world.current;
    if (!w || !live || !atTime) return;
    const lastDirty = paintRiver(w.field.image.data, riverAt(tauStep, live, atTime));
    w.field.needsUpdate = true;
    const moving = lastDirty >= 0 && lastDirty < 250;
    w.state.frontTarget = moving ? lastDirty / 255 : null;
    if (!moving) w.state.frontS = null;
    w.front.visible = moving;

    const rainNow = atTime[live.stations[0].id]?.rain ?? 0;
    w.state.rainTarget = Math.min(1, rainNow / 30);
    w.state.level = layers.flood ? 1.5 + Math.min(1, rainNow / 45) * 5.5 : 0;

    const flows = Object.fromEntries((live.pipes ?? []).map((q) => [q.id, q]));
    for (const m of w.pipes) m.material.uniforms.uFlow.value = flows[m.userData.pipeId]?.flowing ? 1.8 : 0;

    for (const st of live.stations) {
      const risk = atTime[st.id]?.risk ?? st.risk;
      const shown = tauStep === 0 ? st : { ...st, risk_band: bandOf(risk), classification: 'NORMAL', edge_state: 'NORMAL' };
      const color = stationStatus(shown).color;
      let pt = w.points[st.id];
      if (!pt) {
        const base = w.posOf(st.lon, st.lat);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 20), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.9, emissive: color, emissiveIntensity: 0.3 }));
        pillar.position.copy(base);
        pillar.renderOrder = 6;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
        ring.renderOrder = 5;
        ring.position.copy(base);
        ring.position.y += 0.05;
        w.scene.add(pillar, ring);
        pt = { base, pillar, ring, height: 0.12, targetHeight: 0.12, phase: Math.random() };
        w.points[st.id] = pt;
      }
      pt.pillar.material.color.set(color);
      pt.pillar.material.emissive.set(color);
      pt.ring.material.color.set(color);
      pt.targetHeight = 0.12 + risk * 1.9;
      pt.pillar.visible = layers.columns !== false;
      pt.ring.visible = risk >= 0.25 || Boolean(tauStep === 0 && st.valve && !st.valve.open);
      const tag = labels.current[st.id];
      if (tag) {
        const closed = tauStep === 0 && st.valve && !st.valve.open;
        const fc = live.forecast.stations?.[st.id];
        const eta = tauStep === 0 && fc?.arrival_s > 0 ? ` · ETA ${Math.round(fc.arrival_s / 60)} min` : '';
        tag.querySelector('[data-t]').textContent = `${st.id}${closed ? ' · closed' : ''}${eta}`;
        tag.querySelector('[data-d]').style.background = color;
        tag.querySelector('button').style.outline = st.id === selectedId ? '2px solid #2f5be7' : 'none';
      }
    }
  }, [live, atTime, tauStep, selectedId, layers.flood, layers.columns, terrain]);

  /* ---------------- layers ---------------- */
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.streamMesh.visible = layers.streams;
    w.flood.visible = Boolean(layers.flood);
    for (const m of w.pipes) m.visible = layers.pipes !== false;
    const flow = layers.particles ? 1 : 0;
    w.river.material.uniforms.uFlow.value = 1.5 * flow;
    w.streamMesh.material.uniforms.uFlow.value = 1.1 * flow;
  }, [layers, terrain]);

  /* ---------------- risk painted on the ground ---------------- */
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const on = layers.heatmap && tauStep === 0 && heatmap?.data;
    w.heat.visible = Boolean(on);
    if (!on || w.heatKey === heatmap.data) return;
    w.heatKey = heatmap.data;
    const b = bytes(heatmap.data);
    for (let i = 0; i < b.length; i += 1) {
      const t = b[i] ? (b[i] - 1) / 254 : 0;
      w.heatData.set([250 - 60 * t, 200 - 170 * t, 120 - 90 * t, t < 0.04 ? 0 : 40 + 190 * t ** 0.8], i * 4);
    }
    w.heatTex.needsUpdate = true;
  }, [heatmap, layers.heatmap, tauStep, terrain]);

  if (failed) return <div className="flex h-full items-center justify-center bg-panel-2 p-4 text-center text-sm text-muted">The elevation model could not load. Check that the data server is running.</div>;

  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#dfe8ff] to-[#c9e3fb]">
      <div ref={host} className="absolute inset-0" />
      {!terrain && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Building the watershed model…</div>}
      {live?.stations.map((st, i) => (
        <div key={st.id} ref={(n) => { labels.current[st.id] = n; }} className="pointer-events-none absolute left-0 top-0 z-[5]" style={{ display: 'none' }}>
          <button
            onClick={() => onSelect?.(st.id)} onDoubleClick={() => onInspect?.(st.id)}
            className="pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink shadow-sm"
            style={{ transform: `translateY(${i % 2 ? 20 : -20}px)` }}
          >
            <span data-d className="h-2 w-2 rounded-full" />
            <span data-t>{st.id}</span>
          </button>
        </div>
      ))}
      <div ref={(n) => { labels.current.front = n; }} className="pointer-events-none absolute left-0 top-0 z-[5] whitespace-nowrap rounded-md bg-[#c43b1f]/95 px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ display: 'none' }}>
        Plume front
      </div>
      <p className="pointer-events-none absolute bottom-[70px] left-2 z-[5] max-w-[55%] rounded bg-white/70 px-1 text-[9px] leading-tight text-ink-2">Elevation: Copernicus GLO-90{imagery ? ' · Imagery © Esri, Maxar, Earthstar Geographics' : ''}</p>
    </div>
  );
}
