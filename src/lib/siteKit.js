import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// Building blocks for the facility models: photographed CC0 materials (Poly Haven), real wall openings,
// ribbed roof sheets, steel sections and plants. Sizes are metres; +y is up, +z is the front of a site.

const BASE = import.meta.env.BASE_URL ?? '/';

/* ---------------- repeatable randomness, so a site looks the same every time ---------------- */
let state = 1;
export const reseed = (n) => { state = n >>> 0 || 1; };
export const rnd = (a = 0, b = 1) => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return a + (b - a) * (((t ^ (t >>> 14)) >>> 0) / 4294967296);
};

/* ---------------- materials ---------------- */
const loader = new THREE.TextureLoader();
const seen = new Map();
function photo(file, tile, srgb) {
  const key = `${file}@${tile}`;
  if (seen.has(key)) return seen.get(key);
  const t = loader.load(`${BASE}textures/${file}.jpg`);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  seen.set(key, t);
  return t;
}

/** A photographed surface, tiled at a true size in metres. */
function surface(name, tile, { color = '#ffffff', gain = 1, normal = 1, ...rest } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: photo(`${name}_diff`, tile, true),
    normalMap: photo(`${name}_nor`, tile, false),
    roughnessMap: photo(`${name}_rough`, tile, false),
    normalScale: new THREE.Vector2(normal, normal),
    roughness: 1,
    metalness: 0,
    ...rest,
  });
  m.color.set(color).multiplyScalar(gain);
  m.userData.box = true;
  return m;
}
const plain = (color, roughness, metalness = 0, rest = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });

/* Plant textures: colour and cut-out drawn separately, so edges never fringe. */
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function painted(w, h, paint) {
  const colour = canvas(w, h, (g) => paint(g, false));
  const alpha = canvas(w, h, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); paint(g, true); });
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const alphaMap = new THREE.CanvasTexture(alpha);
  alphaMap.anisotropy = 8;
  return { map, alphaMap };
}
const leafPlant = (textures, extra = {}) => {
  const m = new THREE.MeshStandardMaterial({ ...textures, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.68, metalness: 0, envMapIntensity: 0.6, ...extra });
  m.userData.plant = true;
  return m;
};

function frondTexture() {
  return painted(128, 512, (g, mask) => {
    reseed(11);
    if (!mask) { g.fillStyle = '#3f7d2e'; g.fillRect(0, 0, 128, 512); }
    for (let y = 6; y < 508; y += 6.4) {
      const f = y / 512;
      const len = 60 * Math.sin(Math.min(1, f * 1.15 + 0.06) * Math.PI) ** 0.6;
      for (const s of [-1, 1]) {
        g.strokeStyle = mask ? '#fff' : ['#3d7e2c', '#4a9136', '#5aa03c', '#35702a'][Math.floor(rnd(0, 4))];
        g.lineWidth = 4.3 - f * 1.6;
        g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.55, y + 4, 64 + s * len, y + 22 + rnd(-3, 3)); g.stroke();
      }
    }
    g.strokeStyle = mask ? '#fff' : '#b8b45f';
    g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  });
}
function bananaTexture() {
  return painted(128, 512, (g, mask) => {
    reseed(5);
    const edge = (y) => 58 * Math.sin((y / 512) ** 0.72 * Math.PI) ** 0.42;
    g.beginPath();
    g.moveTo(64, 0);
    for (let y = 0; y <= 512; y += 8) g.lineTo(64 + edge(y), y);
    for (let y = 512; y >= 0; y -= 8) g.lineTo(64 - edge(y), y);
    g.closePath();
    if (mask) { g.fillStyle = '#fff'; g.fill(); } else {
      g.fillStyle = '#4c9a38'; g.fillRect(0, 0, 128, 512);
      g.strokeStyle = 'rgba(30,80,25,0.32)'; g.lineWidth = 1;
      for (let y = 0; y < 512; y += 5) { g.beginPath(); g.moveTo(64, y); g.lineTo(0, y + 16); g.moveTo(64, y); g.lineTo(128, y + 16); g.stroke(); }
      g.strokeStyle = '#c3cf79'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
    }
    if (mask) {
      g.strokeStyle = '#000'; g.lineWidth = 1.6;
      for (let i = 0; i < 9; i += 1) { const y = rnd(60, 470); const s = rnd() > 0.5 ? 1 : -1; g.beginPath(); g.moveTo(64 + s * rnd(16, 26), y); g.lineTo(64 + s * 64, y + 14); g.stroke(); }
    }
  });
}
function foliageTexture(tones) {
  return painted(512, 512, (g, mask) => {
    reseed(29);
    if (!mask) { g.fillStyle = tones[0]; g.fillRect(0, 0, 512, 512); }
    for (let i = 0; i < 620; i += 1) {
      const a = rnd(0, Math.PI * 2);
      const r = Math.sqrt(rnd()) * 226;
      const [x, y] = [256 + Math.cos(a) * r, 256 + Math.sin(a) * r];
      g.save();
      g.translate(x, y);
      g.rotate(rnd(0, Math.PI * 2));
      g.fillStyle = mask ? '#fff' : tones[Math.floor(rnd(0, tones.length))];
      g.beginPath(); g.ellipse(0, 0, rnd(13, 22), rnd(6, 10), 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  });
}
function grassTexture() {
  return painted(256, 128, (g, mask) => {
    reseed(3);
    if (!mask) { g.fillStyle = '#7cb04c'; g.fillRect(0, 0, 256, 128); }
    for (let i = 0; i < 90; i += 1) {
      const x = rnd(8, 248);
      g.strokeStyle = mask ? '#fff' : ['#8cc05a', '#7cb04c', '#9ccb68', '#6ea143'][Math.floor(rnd(0, 4))];
      g.lineWidth = rnd(1.6, 3);
      g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + rnd(-8, 8), 70, x + rnd(-26, 26), rnd(6, 60)); g.stroke();
    }
  });
}
function chainTexture() {
  const c = canvas(64, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.22, 1 / 0.22);
  t.anisotropy = 8;
  return t;
}
function solarTexture() {
  const c = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#0d1d3f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,220,250,0.5)'; g.lineWidth = 1.4;
    for (let i = 0; i <= 8; i += 1) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    g.strokeStyle = 'rgba(205,220,250,0.2)'; g.lineWidth = 0.7;
    for (let i = 0; i <= 64; i += 1) { g.beginPath(); g.moveTo(0, i * 4); g.lineTo(w, i * 4); g.stroke(); }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function barkTexture() {
  const c = canvas(64, 256, (g, w, h) => {
    reseed(17);
    g.fillStyle = '#7b6a55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(40,30,22,${rnd(0.18, 0.5)})`; g.fillRect(0, y, w, rnd(1.2, 2.6)); }
    for (let i = 0; i < 500; i += 1) { g.fillStyle = `rgba(${rnd() > 0.5 ? '190,175,150' : '45,35,28'},0.14)`; g.fillRect(rnd(0, w), rnd(0, h), 2, rnd(1, 5)); }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rippleTexture() {
  const size = 128;
  const h = new Float32Array(size * size);
  reseed(41);
  for (let k = 0; k < 26; k += 1) {
    const [fx, fy, ph, a] = [Math.round(rnd(1, 7)) * (rnd() > 0.5 ? 1 : -1), Math.round(rnd(1, 7)), rnd(0, 6.28), rnd(0.4, 1)];
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) h[y * size + x] += a * Math.sin(((x * fx + y * fy) / size) * Math.PI * 2 + ph);
  }
  const c = canvas(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
      const i = (y * size + x) * 4;
      img.data[i] = 128 + dx * 22; img.data[i + 1] = 128 + dy * 22; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 3, 1 / 3);
  return t;
}

let M = null;
export function kit() {
  if (M) return M;
  const leaf = foliageTexture(['#3c7a30', '#4b8f3a', '#5ca344', '#316a2c', '#6db04f']);
  const leaf2 = foliageTexture(['#4f8a34', '#68a03f', '#7bb04a', '#40782e', '#8bbb55']);
  M = {
    paint: surface('block', 3, { color: '#e6efff', gain: 1.95, normal: 0.35 }),
    paintBlue: surface('block', 3, { color: '#b9d2f8', gain: 1.85, normal: 0.35 }),
    paintGreen: surface('block', 3, { color: '#d8e9cb', gain: 1.72, normal: 0.35 }),
    paintYellow: surface('block', 3, { color: '#f7dd8f', gain: 1.72, normal: 0.35 }),
    block: surface('wall', 2.6, { gain: 1.1 }),
    concrete: surface('floor', 3.2, { gain: 1.05 }),
    slab: surface('floor', 4.5, { color: '#e9e7df', gain: 1.15, normal: 0.7 }),
    stone: surface('stone', 2.2),
    grass: surface('grass', 11, { color: '#c0f09a', gain: 1.15, normal: 0.8 }),
    gravel: surface('gravel', 3.4, { color: '#ece4d8', gain: 1.25 }),
    soil: surface('soil', 2.6),
    wood: surface('wood', 1.6),
    bluePlate: surface('steel', 1.4, { metalness: 0.5 }),
    rust: surface('roofold', 2.4, { metalness: 0.45 }),
    roofBlue: plain('#2a59ad', 0.5, 0.3),
    roofTin: plain('#aab3ba', 0.42, 0.85),
    roofRed: plain('#a7402c', 0.5, 0.45),
    steel: plain('#a8b1b9', 0.38, 0.9),
    darkSteel: plain('#454c56', 0.48, 0.75),
    black: plain('#191b1f', 0.62, 0.1),
    hdpe: plain('#16181c', 0.5, 0),
    pvc: plain('#e9edf0', 0.42),
    pvcBlue: plain('#2f6fd1', 0.4),
    tank: plain('#2b6dcc', 0.38),
    tankWhite: plain('#d7dde2', 0.45),
    enclosure: plain('#e9ecee', 0.46, 0.1),
    trim: plain('#f5f6f3', 0.5),
    door: plain('#2d4f86', 0.5, 0.1),
    frame: plain('#6f7780', 0.42, 0.7),
    interior: plain('#1d2126', 0.9),
    glass: plain('#8fbbd4', 0.08, 0.7, { emissive: '#ffd27a', emissiveIntensity: 0 }),
    acrylic: plain('#cfe9f7', 0.06, 0, { transparent: true, opacity: 0.5 }),
    red: plain('#c7322b', 0.42),
    yellow: plain('#f0bd2e', 0.45),
    solar: new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.16, metalness: 0.6 }),
    chain: new THREE.MeshStandardMaterial({ color: '#b5bcc3', alphaMap: chainTexture(), alphaTest: 0.32, side: THREE.DoubleSide, metalness: 0.75, roughness: 0.42 }),
    trunk: new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 }),
    crown: plain('#3a7330', 0.95, 0, { envMapIntensity: 0.35 }),
    pig: plain('#e6b3a7', 0.7),
    frond: leafPlant(frondTexture()),
    banana: leafPlant(bananaTexture()),
    leaf: leafPlant(leaf),
    leaf2: leafPlant(leaf2),
    tuft: leafPlant(grassTexture(), { alphaTest: 0.36 }),
    ripple: rippleTexture(),
  };
  M.chain.userData.box = true;
  M.tuft.userData.flat = true;
  return M;
}

/** Water that takes its colour from the reading at that site. */
export function waterMaterial(color = '#3f86b8') {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.84, normalMap: kit().ripple.clone(), normalScale: new THREE.Vector2(0.5, 0.5) });
  m.userData.keep = true;
  m.userData.box = true;
  return m;
}

/* The sky that lights every model, for true reflections on metal and water */
let skyLoad = null;
export function sky() {
  skyLoad ??= new HDRLoader().loadAsync(`${BASE}textures/sky.hdr`).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; return t; });
  return skyLoad;
}

/* ---------------- geometry helpers ---------------- */
export const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
export const box = (p, w, h, d, mat, x = 0, y = 0, z = 0) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
export const cyl = (p, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);

const UP = new THREE.Vector3(0, 1, 0);
/** A round or square member between two points. */
export function strut(p, a, b, r, mat, square = false) {
  const [A, B] = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  const len = A.distanceTo(B);
  const geo = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, r < 0.03 ? 6 : 12);
  const m = add(p, geo, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.sub(A).normalize());
  return m;
}

/** Steel angle section: two thin plates at a right angle. */
export function angleBar(p, a, b, size, mat, spin = 0) {
  const [A, B] = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  const len = A.distanceTo(B);
  const g = new THREE.Group();
  g.position.copy(A).add(B).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
  const inner = new THREE.Group();
  inner.rotation.y = spin;
  box(inner, size, len, 0.008, mat, size / 2, 0, 0);
  box(inner, 0.008, len, size, mat, 0, 0, size / 2);
  g.add(inner);
  p.add(g);
  return g;
}

/** A pipe run with straight lengths, proper elbows and couplings. */
export function pipe(p, pts, r, mat, { fittings = true, coupling = 3 } = {}) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    strut(p, pts[i], pts[i + 1], r, mat);
    if (i > 0 && fittings) add(p, new THREE.SphereGeometry(r * 1.32, 12, 10), mat, ...pts[i]);
    if (!fittings) continue;
    const d = new THREE.Vector3(...pts[i + 1]).sub(new THREE.Vector3(...pts[i]));
    const len = d.length();
    for (let s = coupling; s < len - 0.3; s += coupling) {
      const at = new THREE.Vector3(...pts[i]).addScaledVector(d, s / len);
      strut(p, at.clone().addScaledVector(d, -0.05 / len).toArray(), at.clone().addScaledVector(d, 0.05 / len).toArray(), r * 1.28, mat);
    }
  }
}

/** Gate valve with a hand wheel. The wheel shows open or closed, so it stays its own object. */
export function gateValve(ctx, p, x, y, z, r = 0.09, along = 'x') {
  const m = kit();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (along === 'z') g.rotation.y = Math.PI / 2;
  strut(g, [-r * 2.3, 0, 0], [r * 2.3, 0, 0], r * 1.15, m.darkSteel);
  for (const s of [-1, 1]) strut(g, [s * r * 2.4, 0, 0], [s * r * 2.7, 0, 0], r * 1.8, m.darkSteel);
  cyl(g, r * 1.05, r * 1.5, r * 2.6, m.darkSteel, 0, r * 1.5, 0);
  cyl(g, r * 0.24, r * 0.24, r * 4.6, m.steel, 0, r * 4.5, 0, 8);
  const mat = new THREE.MeshStandardMaterial({ color: '#22a35a', roughness: 0.4, emissive: '#22a35a', emissiveIntensity: 0.3 });
  mat.userData.keep = true;
  const wheel = add(g, new THREE.TorusGeometry(r * 2, r * 0.3, 8, 24), mat, 0, r * 6.2, 0);
  wheel.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i += 1) { const s = cyl(g, r * 0.14, r * 0.14, r * 3.9, mat, 0, r * 6.2, 0, 6); s.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 3); }
  p.add(g);
  ctx.valve ??= mat;
  ctx.valveAt ??= [x, y + r * 6, z];
}

/** Ribbed polyethylene tank. */
export function polyTank(p, r, h, x, y, z, mat) {
  const m = kit();
  const pts = [new THREE.Vector2(0.001, 0)];
  for (let i = 0; i <= 44; i += 1) {
    const f = i / 44;
    const rib = 1 + 0.016 * Math.sin(f * Math.PI * 14);
    pts.push(new THREE.Vector2(r * rib * (f > 0.84 ? Math.cos(((f - 0.84) / 0.16) * 1.32) : 1), f * h));
  }
  const body = add(p, new THREE.LatheGeometry(pts, 40), mat, x, y, z);
  cyl(p, r * 0.3, r * 0.32, 0.12, m.black, x, y + h + 0.03, z, 22);
  strut(p, [x + r * 0.98, y + 0.16, z], [x + r * 1.22, y + 0.16, z], 0.035, m.pvc);
  return body;
}

/** Vertical ladder with hoops above head height. */
export function ladder(p, x, y, z, h, ry, cage = false) {
  const m = kit();
  const g = new THREE.Group();
  for (const s of [-0.22, 0.22]) cyl(g, 0.02, 0.02, h, m.steel, s, h / 2, 0, 8);
  for (let v = 0.3; v < h; v += 0.3) strut(g, [-0.22, v, 0], [0.22, v, 0], 0.012, m.steel);
  if (cage) for (let v = 2.4; v < h; v += 0.9) { const t = add(g, new THREE.TorusGeometry(0.38, 0.012, 6, 18, Math.PI), m.steel, 0, v, 0.08); t.rotation.x = Math.PI / 2; t.rotation.z = Math.PI; }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  p.add(g);
}

/** Painted sign. Text is drawn to fit. */
export function signPanel(p, text, sub, x, y, z, w, { bg = '#ffffff', fg = '#14305f', ry = 0, h = w / 3.6, posts = false } = {}) {
  const m = kit();
  const c = canvas(512, Math.round(512 * (h / w)), (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(9, 9, cw - 18, ch - 18);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = sub ? ch * 0.36 : ch * 0.48;
    do { g.font = `700 ${size}px Sora, Arial, sans-serif`; size -= 2; } while (g.measureText(text).width > cw - 44 && size > 14);
    g.fillText(text, cw / 2, sub ? ch * 0.39 : ch / 2);
    if (sub) {
      size = ch * 0.19;
      do { g.font = `500 ${size}px Inter, Arial, sans-serif`; size -= 1; } while (g.measureText(sub).width > cw - 44 && size > 10);
      g.fillText(sub, cw / 2, ch * 0.72);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  box(g, w, h, 0.03, m.steel);
  add(g, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }), 0, 0, 0.018);
  if (posts) for (const s of [-1, 1]) cyl(g, 0.035, 0.035, y + h / 2, m.steel, s * w * 0.38, -(y - h / 2) / 2 - h / 2 + h / 2, -0.03, 8);
  p.add(g);
}

/* ---------------- buildings ---------------- */
/** A wall with real openings cut through it. Outer face sits at z = 0. */
function wallPanel(len, h, openings, thick, peak = 0) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, h);
  if (peak) s.lineTo(0, h + peak);
  s.lineTo(-len / 2, h); s.closePath();
  for (const o of openings) {
    const q = new THREE.Path();
    const [x0, x1, y0, y1] = [o.x - o.w / 2, o.x + o.w / 2, o.y, o.y + o.h];
    q.moveTo(x0, y0); q.lineTo(x0, y1); q.lineTo(x1, y1); q.lineTo(x1, y0); q.closePath();
    s.holes.push(q);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick);
  return g;
}

function jalousie(p, o, t) {
  const m = kit();
  const { x, y, w, h } = o;
  const g = new THREE.Group();
  g.position.set(x, y + h / 2, -t * 0.55);
  for (const s of [-1, 1]) { box(g, 0.05, h, 0.07, m.frame, s * (w / 2 - 0.025)); box(g, w, 0.05, 0.07, m.frame, 0, s * (h / 2 - 0.025)); }
  box(g, 0.035, h, 0.05, m.frame);
  const n = Math.round(h / 0.11);
  for (let i = 0; i < n; i += 1) { const s = box(g, w - 0.1, 0.1, 0.006, m.glass, 0, -h / 2 + 0.06 + i * ((h - 0.1) / n)); s.rotation.x = -0.42; }
  p.add(g);
  for (let i = 1; i < 6; i += 1) cyl(p, 0.008, 0.008, h, m.darkSteel, x - w / 2 + (w / 6) * i, y + h / 2, 0.03, 6);
  for (const f of [0.34, 0.68]) strut(p, [x - w / 2, y + h * f, 0.03], [x + w / 2, y + h * f, 0.03], 0.008, m.darkSteel);
  box(p, w + 0.14, 0.05, 0.14, m.slab, x, y - 0.02, 0.03);
}

function doorLeaf(p, o, t, mat) {
  const m = kit();
  const { x, y, w, h } = o;
  const g = new THREE.Group();
  g.position.set(x, y + h / 2, -t * 0.5);
  for (const s of [-1, 1]) box(g, 0.06, h, t + 0.02, m.frame, s * (w / 2 - 0.03));
  box(g, w, 0.06, t + 0.02, m.frame, 0, h / 2 - 0.03);
  box(g, w - 0.12, h - 0.08, 0.04, mat ?? m.door, 0, -0.02);
  for (const [py, ph] of [[h * 0.22, h * 0.36], [-h * 0.24, h * 0.36]]) box(g, w - 0.34, ph, 0.012, m.frame, 0, py, 0.024);
  add(g, new THREE.SphereGeometry(0.03, 10, 8), m.steel, w / 2 - 0.15, -0.04, 0.05);
  p.add(g);
}

/** Service counter with a roller shutter head and a steel shelf. */
function counter(p, o, t) {
  const m = kit();
  const { x, y, w, h } = o;
  box(p, w + 0.1, 0.05, 0.55, m.steel, x, y - 0.02, 0.14);
  box(p, w + 0.12, 0.2, 0.2, m.frame, x, y + h + 0.1, 0.05);
  for (let i = 1; i < 6; i += 1) cyl(p, 0.01, 0.01, h, m.darkSteel, x - w / 2 + (w / 6) * i, y + h / 2, -t * 0.7, 6);
}

/** Corrugated sheet, ribs running down the slope. */
function ribbed(width, length) {
  const waves = Math.max(2, Math.round(width / 0.19));
  const geo = new THREE.PlaneGeometry(width, length, waves * 4, 1).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 1) p.setY(i, 0.017 * Math.sin((p.getX(i) / width) * waves * Math.PI * 2));
  geo.computeVertexNormals();
  return geo;
}

/** Gable roof, ridge along x: sheets, ridge cap, fascia, purlins, rafters and a rain gutter. */
export function gableRoof(p, w, d, rise, y, mat, { gutter = true } = {}) {
  const m = kit();
  const run = d / 2;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const n = Math.max(2, Math.round(w / 0.92));
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i += 1) {
      const sw = w / n + 0.02;
      const o = add(p, ribbed(sw, slope + 0.06), mat, -w / 2 + (i + 0.5) * (w / n), y + rise / 2 + 0.03, (s * run) / 2);
      o.rotation.x = s * angle;
      o.userData.shade = rnd(0.86, 1.06);
    }
    box(p, w + 0.06, 0.16, 0.03, m.trim, 0, y - 0.06, s * (run + 0.01));
    for (let k = 0; k < 4; k += 1) {
      const f = (k + 0.5) / 4;
      box(p, w, 0.05, 0.05, m.darkSteel, 0, y + rise * (1 - f) - 0.05, s * run * f);
    }
    if (gutter) {
      const gt = add(p, new THREE.CylinderGeometry(0.07, 0.07, w, 10, 1, true, 0, Math.PI), m.steel, 0, y - 0.12, s * (run + 0.08));
      gt.rotation.set(0, 0, Math.PI / 2);
      gt.material = m.steel;
    }
    for (const e of [-1, 1]) {
      const b = box(p, 0.03, 0.16, slope + 0.05, m.trim, e * (w / 2 + 0.01), y + rise / 2 - 0.05, (s * run) / 2);
      b.rotation.x = s * angle;
    }
  }
  const nr = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i <= nr; i += 1) {
    const x = -w / 2 + 0.15 + ((w - 0.3) * i) / nr;
    for (const s of [-1, 1]) { const r = box(p, 0.05, 0.11, slope, m.darkSteel, x, y + rise / 2 - 0.1, (s * run) / 2); r.rotation.x = s * angle; }
  }
  for (const s of [-1, 1]) { const c = box(p, w + 0.04, 0.012, 0.3, m.steel, 0, y + rise + 0.03 - 0.03, s * 0.13); c.rotation.x = s * angle; }
}

/** Mono-pitch awning or shelter roof on steel posts. */
export function lean(p, w, d, h0, h1, x, z, mat) {
  const m = kit();
  const rise = h0 - h1;
  const slope = Math.hypot(d, rise);
  const n = Math.max(2, Math.round(w / 0.92));
  for (let i = 0; i < n; i += 1) {
    const o = add(p, ribbed(w / n + 0.02, slope), mat, x - w / 2 + (i + 0.5) * (w / n), (h0 + h1) / 2, z);
    o.rotation.x = Math.atan2(rise, d);
    o.userData.shade = rnd(0.86, 1.06);
  }
  box(p, w, 0.1, 0.05, m.darkSteel, x, h1 - 0.06, z + d / 2);
  box(p, w, 0.1, 0.05, m.darkSteel, x, h0 - 0.06, z - d / 2);
}

/** A complete hollow-block building: slab, real openings, jalousie windows, doors and a tin roof. */
export function house(p, { x = 0, z = 0, ry = 0, y = 0, w, d, h = 2.8, paint, roof, rise, over = 0.55, floor = 0.3, front = [], back = [], left = [], right = [], doorMat, gutter = true }) {
  const m = kit();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const r = rise ?? d * 0.17;
  box(g, w + 0.5, floor, d + 0.5, m.concrete, 0, floor / 2, 0);
  box(g, w - 0.2, h - 0.02, d - 0.2, m.interior, 0, floor + h / 2, 0);
  const t = 0.15;
  const sides = [
    [front, w, 0, 0, d / 2, 0], [right, d, r, w / 2, 0, Math.PI / 2],
    [back, w, 0, 0, -d / 2, Math.PI], [left, d, r, -w / 2, 0, -Math.PI / 2],
  ];
  for (const [list, len, peak, sx, sz, rot] of sides) {
    const side = new THREE.Group();
    side.position.set(sx, floor, sz);
    side.rotation.y = rot;
    add(side, wallPanel(len, h, list, t, roof === null ? 0 : peak), paint);
    box(side, len + 0.02, 0.32, 0.02, m.block, 0, 0.04, 0.008);
    for (const o of list) {
      if (o.k === 'door') doorLeaf(side, o, t, doorMat);
      else if (o.k === 'counter') counter(side, o, t);
      else jalousie(side, o, t);
    }
    g.add(side);
  }
  if (roof) gableRoof(g, w + over * 2, d + over * 2, r * (1 + (over * 2) / d), floor + h, roof, { gutter });
  p.add(g);
  return g;
}

/** Steel tank stand: angle legs, cross bracing, platform with rail. */
export function tankStand(p, x, z, size, H) {
  const m = kit();
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const s = size / 2;
  const foot = s * 1.12;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  corners.forEach(([a, b], i) => {
    angleBar(g, [a * foot, 0.1, b * foot], [a * s, H, b * s], 0.09, m.steel, Math.PI * (i / 2));
    box(g, 0.5, 0.2, 0.5, m.concrete, a * foot, 0.08, b * foot);
    box(g, 0.2, 0.012, 0.2, m.steel, a * foot, 0.19, b * foot);
  });
  const levels = Math.max(2, Math.round(H / 2.2));
  const at = (l) => l / levels;
  const width = (f) => foot + (s - foot) * f;
  for (let l = 0; l < levels; l += 1) {
    const [f0, f1] = [at(l), at(l + 1)];
    const [y0, y1] = [0.1 + (H - 0.1) * f0, 0.1 + (H - 0.1) * f1];
    const [w0, w1] = [width(f0), width(f1)];
    for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const pa = ax ? [ax * w0, y0, -w0] : [-w0, y0, az * w0];
      const pb = ax ? [ax * w1, y1, w1] : [w1, y1, az * w1];
      const pc = ax ? [ax * w0, y0, w0] : [w0, y0, az * w0];
      const pd = ax ? [ax * w1, y1, -w1] : [-w1, y1, az * w1];
      strut(g, pa, pb, 0.017, m.steel, true);
      strut(g, pc, pd, 0.017, m.steel, true);
      if (l > 0) strut(g, ax ? [ax * w0, y0, -w0] : [-w0, y0, az * w0], ax ? [ax * w0, y0, w0] : [w0, y0, az * w0], 0.03, m.steel, true);
    }
  }
  box(g, size + 0.9, 0.09, size + 0.9, m.darkSteel, 0, H + 0.03, 0);
  for (let i = -3; i <= 3; i += 1) strut(g, [i * (size / 6.4), H + 0.09, -s - 0.42], [i * (size / 6.4), H + 0.09, s + 0.42], 0.018, m.steel, true);
  const e = s + 0.42;
  for (const [a, b] of [[[-e, -e], [e, -e]], [[e, -e], [e, e]], [[e, e], [-e, e]], [[-e, e], [-e, -e]]]) {
    strut(g, [a[0], H + 1.05, a[1]], [b[0], H + 1.05, b[1]], 0.018, m.steel);
    strut(g, [a[0], H + 0.6, a[1]], [b[0], H + 0.6, b[1]], 0.012, m.steel);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k <= len; k += 1.1) { const f = k / len; cyl(g, 0.017, 0.017, 1, m.steel, a[0] + (b[0] - a[0]) * f, H + 0.56, a[1] + (b[1] - a[1]) * f, 8); }
  }
  p.add(g);
  return g;
}

/** Chain-link fence along corner points, with posts, rails and footings. */
export function fence(p, pts, h = 1.9) {
  const m = kit();
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 2.6));
    const mesh = add(p, new THREE.PlaneGeometry(len, h - 0.1), m.chain, (a[0] + b[0]) / 2, h / 2 + 0.03, (a[1] + b[1]) / 2);
    mesh.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    strut(p, [a[0], h, a[1]], [b[0], h, b[1]], 0.02, m.steel);
    strut(p, [a[0], 0.12, a[1]], [b[0], 0.12, b[1]], 0.011, m.steel);
    for (let k = 0; k <= n; k += 1) {
      const [x, z] = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      cyl(p, 0.03, 0.03, h + 0.12, m.steel, x, (h + 0.12) / 2, z, 10);
      cyl(p, 0.09, 0.11, 0.1, m.concrete, x, 0.05, z, 10);
    }
  }
}

/** Solar panel with an aluminium frame, tilted toward the south. */
export function solarPanel(p, w, d, x, y, z, tilt = 0.26, ry = 0) {
  const m = kit();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(tilt, ry, 0, 'YXZ');
  box(g, w, 0.035, d, m.frame);
  add(g, new THREE.PlaneGeometry(w - 0.05, d - 0.05).rotateX(-Math.PI / 2), m.solar, 0, 0.019, 0);
  p.add(g);
}

/* ---------------- ground ---------------- */
function blobShape(rx, rz, wobble) {
  const s = new THREE.Shape();
  const n = 40;
  const ph = [rnd(0, 6), rnd(0, 6), rnd(0, 6)];
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (Math.sin(a * 3 + ph[0]) * 0.5 + Math.sin(a * 5 + ph[1]) * 0.3 + Math.sin(a * 9 + ph[2]) * 0.2);
    if (i === 0) s.moveTo(Math.cos(a) * rx * k, Math.sin(a) * rz * k); else s.lineTo(Math.cos(a) * rx * k, Math.sin(a) * rz * k);
  }
  return s;
}
/** An irregular patch of ground such as gravel or packed soil. */
export function patch(p, mat, x, z, rx, rz, y = 0.02, wobble = 0.12) {
  return add(p, new THREE.ShapeGeometry(blobShape(rx, rz, wobble), 1).rotateX(-Math.PI / 2), mat, x, y, z);
}
/** A poured slab with real thickness. */
export function slab(p, w, d, x, z, t = 0.14, mat) {
  return box(p, w, t, d, mat ?? kit().slab, x, t / 2, z);
}
/** Footpath between points. */
export function path(p, pts, w, mat, y = 0.03) {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const o = add(p, new THREE.PlaneGeometry(w, len + w * 0.4).rotateX(-Math.PI / 2), mat, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    o.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
}
/** A slope of ground behind a structure. */
export function hillside(p, w, d, h, x, z, mat) {
  const seg = 24;
  const geo = new THREE.PlaneGeometry(w, d, seg, seg).rotateX(-Math.PI / 2);
  const q = geo.attributes.position;
  for (let i = 0; i < q.count; i += 1) {
    const [px, pz] = [q.getX(i), q.getZ(i)];
    const f = 0.5 - pz / d;
    const edge = Math.max(0, 1 - (Math.abs(px) / (w / 2)) ** 4);
    q.setY(i, h * f ** 1.3 * edge * (1 + 0.1 * Math.sin(px * 0.7) * Math.cos(pz * 0.9)));
  }
  geo.computeVertexNormals();
  return add(p, geo, mat, x, 0, z);
}
export function rock(p, x, z, r, mat) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const q = geo.attributes.position;
  const seen2 = new Map();
  for (let i = 0; i < q.count; i += 1) {
    const key = `${q.getX(i).toFixed(3)},${q.getY(i).toFixed(3)},${q.getZ(i).toFixed(3)}`;
    if (!seen2.has(key)) seen2.set(key, 0.8 + rnd(0, 0.4));
    const k = seen2.get(key);
    q.setXYZ(i, q.getX(i) * k, q.getY(i) * k * 0.72, q.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const o = add(p, geo, mat ?? kit().stone, x, r * 0.26, z);
  o.rotation.y = rnd(0, 6);
  return o;
}

/** A strip of ground or water following a course of points. */
export function ribbon(points, width) {
  const pos = [];
  const idx = [];
  points.forEach(([x, z, w = 1], i) => {
    const [a, b] = [points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]];
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dz) || 1;
    const [nx, nz] = [(-dz / len) * width * w * 0.5, (dx / len) * width * w * 0.5];
    pos.push(x + nx, 0, z + nz, x - nx, 0, z - nz);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- plants ---------------- */
const cardNormals = (geo, nx, ny, nz) => {
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i += 1) n.setXYZ(i, nx, ny, nz);
};

/** One arching leaf: a folded strip that droops toward its tip. */
function archedLeaf(len, width, lift, droop, fold = 0.2) {
  const seg = 9;
  const pos = []; const uv = []; const idx = [];
  for (let k = 0; k <= seg; k += 1) {
    const f = k / seg;
    const y = lift * Math.sin(f * 1.5) - droop * f * f;
    const out = len * f * (1 - 0.14 * f);
    pos.push(out, y - width * fold, -width / 2, out, y, 0, out, y - width * fold, width / 2);
    uv.push(0, 1 - f, 0.5, 1 - f, 1, 1 - f);
    if (k < seg) { const b = k * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function coconut(p, x, z, h = 9, lean2 = 0.8) {
  const m = kit();
  const g = new THREE.Group();
  const dir = rnd(0, Math.PI * 2);
  const [lx, lz] = [Math.cos(dir) * lean2, Math.sin(dir) * lean2];
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(lx * 0.15, h * 0.62, lz * 0.15), new THREE.Vector3(lx, h, lz));
  const trunk = new THREE.TubeGeometry(curve, 14, 0.17, 10);
  const u2 = trunk.attributes.uv;
  for (let i = 0; i < u2.count; i += 1) u2.setXY(i, u2.getY(i), u2.getX(i) * h * 0.5);
  add(g, trunk, m.trunk);
  add(g, new THREE.SphereGeometry(0.26, 12, 10), m.trunk, 0, 0.02, 0).scale.y = 0.6;
  const crown = new THREE.Group();
  crown.position.set(lx, h, lz);
  const fronds = 21;
  for (let i = 0; i < fronds; i += 1) {
    const ring = i < 7 ? 0 : i < 14 ? 1 : 2;
    const a = (i / 7) * Math.PI * 2 + ring * 0.42 + rnd(-0.1, 0.1);
    const len = rnd(3.6, 4.5) - ring * 0.4;
    const f = add(crown, archedLeaf(len, 1.15, [0.9, 1.5, 2.1][ring], [2.6, 2.2, 1.5][ring] + rnd(-0.2, 0.3)), m.frond);
    f.rotation.y = a;
  }
  for (let i = 0; i < 6; i += 1) add(crown, new THREE.SphereGeometry(0.14, 10, 8), m.trunk, Math.cos(i * 1.1) * 0.24, -0.26 - (i % 2) * 0.08, Math.sin(i * 1.1) * 0.24);
  g.add(crown);
  g.position.set(x, 0, z);
  p.add(g);
  return g;
}

export function banana(p, x, z, h = 2.4) {
  const m = kit();
  const g = new THREE.Group();
  const stems = 3;
  for (let s = 0; s < stems; s += 1) {
    const [ox, oz, sh] = [rnd(-0.45, 0.45), rnd(-0.45, 0.45), h * rnd(0.7, 1)];
    const c = cyl(g, 0.07, 0.12, sh, m.trunk, ox, sh / 2, oz, 10);
    c.userData.shade = 1.25;
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const l = add(g, archedLeaf(rnd(1.6, 2.1), 0.62, rnd(0.5, 1.1), rnd(0.8, 1.5), 0.12), m.banana, ox, sh * 0.96, oz);
      l.rotation.y = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
    }
  }
  g.position.set(x, 0, z);
  p.add(g);
}

/** Broadleaf tree: a real branching trunk carrying a mass of leaf clusters. */
export function tree(p, x, z, s = 1, mat) {
  const m = kit();
  const g = new THREE.Group();
  const H = 5.2;
  const limb = (a, b, r0) => strut(g, a, b, r0, m.trunk);
  limb([0, -0.1, 0], [0.1, 2.6, 0.05], 0.24);
  const tips = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + rnd(0, 0.5);
    const out = rnd(1.1, 1.9);
    const tip = [Math.cos(a) * out, rnd(3.8, 5), Math.sin(a) * out];
    limb([0.1, 2.3, 0.05], tip, 0.09);
    tips.push(tip);
  }
  const centre = new THREE.Vector3(0, H, 0);
  const add2 = (px, py, pz, size, material) => {
    const geo = new THREE.PlaneGeometry(size, size);
    const o = add(g, geo, material, px, py, pz);
    o.rotation.set(rnd(-0.9, 0.9), rnd(0, 6.28), rnd(0, 6.28));
    o.updateMatrix();
    const q = o.quaternion.clone().invert();
    const n = new THREE.Vector3(px, py, pz).sub(centre).normalize();
    n.y = n.y * 0.75 + 0.25;
    n.normalize().applyQuaternion(q);
    cardNormals(geo, n.x, n.y, n.z);
  };
  const leaf = mat ?? m.leaf;
  // A dark core, so the crown stays solid when seen through its outer leaves
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const r = i === 6 ? 0 : 1.25;
    const c = add(g, new THREE.IcosahedronGeometry(1.5, 1), m.crown, Math.cos(a) * r, H + 0.3 + (i === 6 ? 0.5 : rnd(-0.3, 0.3)), Math.sin(a) * r);
    c.scale.y = 0.72;
  }
  for (let i = 0; i < 130; i += 1) {
    const u = rnd(-1, 1);
    const a = rnd(0, Math.PI * 2);
    const r = 3.1 * Math.cbrt(rnd(0.45, 1));
    const k = Math.sqrt(1 - u * u);
    add2(Math.cos(a) * k * r, H + u * r * 0.62 + 0.4, Math.sin(a) * k * r, rnd(1.7, 2.6), i % 3 === 0 ? m.leaf2 : leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  p.add(g);
}

export function fern(p, x, z, s = 1) {
  const m = kit();
  const g = new THREE.Group();
  for (let i = 0; i < 9; i += 1) {
    const l = add(g, archedLeaf(rnd(0.9, 1.3), 0.34, rnd(0.35, 0.7), rnd(0.4, 0.8), 0.1), m.frond);
    l.rotation.y = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2);
  }
  g.position.set(x, 0.04, z);
  g.scale.setScalar(s);
  p.add(g);
}

/** Tufts of grass scattered inside a ring, keeping clear of the listed spots. */
export function grassTufts(p, count, r0, r1, clear = []) {
  const m = kit();
  for (let i = 0; i < count; i += 1) {
    const a = rnd(0, Math.PI * 2);
    const r = Math.sqrt(rnd(r0 * r0, r1 * r1));
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    const [w, h] = [rnd(0.7, 1.2), rnd(0.28, 0.5)];
    for (const rot of [0, Math.PI / 2]) {
      const geo = new THREE.PlaneGeometry(w, h);
      cardNormals(geo, 0, 1, 0);
      const o = add(p, geo, m.tuft, x, h / 2, z);
      o.rotation.y = rot + a;
    }
  }
}

/* ---------------- merging ---------------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Project UVs in metres along each face's main axis, so every surface shows the photo at true size. */
export function boxUV(geo) {
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    for (let k = 0; k < 3; k += 1) {
      const q = k === 0 ? a : k === 1 ? b : c;
      const o = (i + k) * 2;
      if (ay >= ax && ay >= az) { uv[o] = q.x; uv[o + 1] = q.z; } else if (ax >= az) { uv[o] = q.z; uv[o + 1] = q.y; } else { uv[o] = q.x; uv[o + 1] = q.y; }
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const shaded = new WeakMap();
function withVertexColour(mat) {
  if (!shaded.has(mat)) {
    const c = mat.clone();
    c.vertexColors = true;
    shaded.set(mat, c);
  }
  return shaded.get(mat);
}

/**
 * Join every still part of a site into one mesh per material, which is what keeps the map fast.
 * Also darkens surfaces toward the ground, so buildings sit in the scene instead of floating on it.
 */
export function mergeStatic(ctx) {
  const { g } = ctx;
  g.updateMatrixWorld(true);
  const inverse = g.matrixWorld.clone().invert();
  const keep = new Set();
  for (const o of ctx.live) o.traverse((c) => keep.add(c));
  for (const o of ctx.ground) keep.add(o);
  const buckets = new Map();
  const gone = [];
  const matrix = new THREE.Matrix4();
  g.traverse((o) => {
    if (!o.isMesh || keep.has(o) || o.material.userData.keep) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(matrix.multiplyMatrices(inverse, o.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (o.material.userData.box) boxUV(geo);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const shade = o.userData.shade ?? 1;
    const plant = o.material.userData.plant;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const v = (plant ? 0.82 + 0.18 * smooth(0, 3, y) : 0.6 + 0.4 * smooth(0, 1.1, y)) * shade;
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    gone.push(o);
  });
  for (const o of gone) o.removeFromParent();
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false);
    for (const geo of list) geo.dispose();
    const mesh = new THREE.Mesh(merged, withVertexColour(mat));
    mesh.castShadow = !mat.transparent && !mat.userData.flat;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  // Materials that kept their own mesh still cast shadows in the site view
  g.traverse((o) => { if (o.isMesh && !ctx.ground.includes(o)) { o.castShadow = !o.material.transparent && !o.material.userData.flat; o.receiveShadow = true; } });
}

/* ---------------- shadows for the map ---------------- */
let baker = null;
let bakerIdle = 0;

/** Draw a site's soft shadow once, from the sun's direction, and return it as a ground texture. */
export function bakeShadow(ctx, sun) {
  const size = 768;
  const R = ctx.radius * 1.25;
  if (!baker) {
    baker = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true });
    baker.setSize(size, size, false);
    baker.setClearColor(0x000000, 0);
    baker.shadowMap.enabled = true;
    baker.shadowMap.type = THREE.PCFShadowMap;
  }
  const scene = new THREE.Scene();
  const casters = ctx.g.children.filter((o) => o.isMesh && o.castShadow && !ctx.ground.includes(o));
  for (const o of casters) {
    const c = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, alphaMap: o.material.alphaMap ?? null, alphaTest: o.material.alphaTest ?? 0, side: THREE.DoubleSide }));
    c.castShadow = true;
    scene.add(c);
  }
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 1 }));
  catcher.receiveShadow = true;
  scene.add(catcher);
  const light = new THREE.DirectionalLight('#ffffff', 1);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -R * 1.5, right: R * 1.5, top: R * 1.5, bottom: -R * 1.5, near: 1, far: R * 8 });
  light.shadow.bias = -0.0006;
  scene.add(light, light.target);
  const eye = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, 400);
  eye.up.set(0, 0, -1);
  eye.position.set(0, 200, 0);
  eye.lookAt(0, 0, 0);

  const out = document.createElement('canvas');
  out.width = size; out.height = size;
  const g = out.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const dir = sun.clone().normalize();
  // Several nearby sun positions together give a soft edge
  const passes = [[0, 0, 0.5], [0.09, 0.03, 0.2], [-0.07, 0.08, 0.2], [0.02, -0.1, 0.2], [0.3, 0.3, 0.08], [-0.3, 0.3, 0.08], [-0.3, -0.3, 0.08], [0.3, -0.3, 0.08]];
  const mask = document.createElement('canvas');
  mask.width = size; mask.height = size;
  const m = mask.getContext('2d');
  for (const [dx, dz, weight] of passes) {
    light.position.copy(dir).add(new THREE.Vector3(dx, 0, dz)).normalize().multiplyScalar(R * 4);
    baker.render(scene, eye);
    m.clearRect(0, 0, size, size);
    m.drawImage(baker.domElement, 0, 0);
    // Shadow alpha becomes white on black
    const img = m.getImageData(0, 0, size, size);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; px[i] = a; px[i + 1] = a; px[i + 2] = a; px[i + 3] = 255; }
    m.putImageData(img, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = weight;
    g.filter = 'blur(1.2px)';
    g.drawImage(mask, 0, 0);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.filter = 'none';
  for (const o of scene.children) if (o.material?.dispose) o.material.dispose();
  catcher.geometry.dispose();
  light.shadow.map?.dispose();
  // The helper context is only needed while sites are appearing
  clearTimeout(bakerIdle);
  bakerIdle = setTimeout(() => { baker?.dispose(); baker?.forceContextLoss(); baker = null; }, 6000);
  const t = new THREE.CanvasTexture(out);
  t.anisotropy = 4;
  return t;
}
