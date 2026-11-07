import * as THREE from 'three';
import { animatePerson, person } from './people';
import { waterDirt, waterRgb } from './waterColour';
import {
  add, angleBar, banana, box, coconut, cyl, boxUV, fence, fern, gableRoof, gateValve, grassTufts, hillside, house, kit, ladder, lean, mergeStatic,
  patch, path, pipe, polyTank, reseed, ribbon, rnd, rock, signPanel, slab, solarPanel, strut, tankStand, tree, waterMaterial,
} from './siteKit';

export { animatePerson, person };

// The facilities in the twin, in true metres. Each one is built from real construction parts and
// photographed materials, then joined into a few meshes so the same model can run on the map and in the site view.

const REST = ['#3f7fd6', '#d9534f', '#3fa676', '#f0b429', '#8a63d2', '#e87ba4', '#f2f2f2', '#2c8a99'];
const pick = (i) => REST[i % REST.length];

/** Ground that lies under everything: painted first on the map, so it never cuts into the terrain. */
function lay(ctx, mesh) {
  const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = flat.attributes.position;
  flat.computeBoundingBox();
  const { min, max } = flat.boundingBox;
  const uv1 = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 1) {
    uv1[i * 2] = (p.getX(i) - min.x) / (max.x - min.x || 1);
    uv1[i * 2 + 1] = (p.getZ(i) - min.z) / (max.z - min.z || 1);
  }
  boxUV(flat);
  flat.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  mesh.geometry = flat;
  mesh.receiveShadow = true;
  ctx.ground.push(mesh);
  return mesh;
}
const disc = (ctx, r, mat) => { ctx.radius = r; return lay(ctx, add(ctx.g, new THREE.CircleGeometry(r, 72).rotateX(-Math.PI / 2), mat, 0, 0.01, 0)); };
const spot = (ctx, mat, x, z, rx, rz, y) => lay(ctx, patch(ctx.g, mat, x, z, rx, rz, y));
const track = (ctx, pts, w, mat) => { const before = ctx.g.children.length; path(ctx.g, pts, w, mat); ctx.g.children.slice(before).forEach((o) => lay(ctx, o)); };

function addPerson(ctx, options, x, z, ry = 0, y = 0.03) {
  const p = person(options);
  p.position.set(x, y, z);
  p.rotation.y = ry;
  ctx.people.push(p);
  ctx.g.add(p);
  return p;
}

/** Standing water with a ripple; the colour follows the site's turbidity reading. */
function pond(ctx, geo, x, y, z) {
  ctx.waterMat ??= waterMaterial();
  const flat = geo.toNonIndexed();
  boxUV(flat);
  return add(ctx.g, flat, ctx.waterMat, x, y, z);
}

function jerrycan(p, x, z, ry, color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42 });
  const g = new THREE.Group();
  box(g, 0.26, 0.36, 0.16, m, 0, 0.19, 0);
  box(g, 0.1, 0.03, 0.04, m, -0.04, 0.39, 0);
  cyl(g, 0.03, 0.03, 0.05, kit().yellow, 0.08, 0.39, 0, 10);
  g.position.set(x, 0.05, z);
  g.rotation.y = ry;
  p.add(g);
}

/* ---------------- the sensor station at each water point ---------------- */
const PROBES = [['TURB', '#f0872e'], ['pH', '#34b36b'], ['ORP', '#8a63d2'], ['TDS', '#2f7fe0'], ['TEMP', '#d9483b']];

function sensorNode(ctx, x, z, { ry = 0, bio = false } = {}) {
  const { g, m } = ctx;
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  s.rotation.y = ry;
  slab(s, 1.9, 1.3, 0, 0, 0.12, m.concrete);
  // Galvanised frame
  for (const px of [-0.62, 0.62]) angleBar(s, [px, 0.12, -0.3], [px, 2.0, -0.3], 0.05, m.steel);
  for (const y of [0.42, 1.0, 1.95]) strut(s, [-0.66, y, -0.28], [0.66, y, -0.28], 0.018, m.steel, true);
  // Weatherproof enclosure with a live screen
  box(s, 0.72, 0.88, 0.26, m.enclosure, 0, 1.48, -0.16);
  box(s, 0.68, 0.84, 0.015, m.tankWhite, 0, 1.48, -0.02);
  for (const hy of [1.2, 1.76]) cyl(s, 0.012, 0.012, 0.08, m.steel, 0.35, hy, -0.015, 8);
  box(s, 0.03, 0.09, 0.03, m.darkSteel, -0.3, 1.48, -0.005);
  const hood = box(s, 0.86, 0.02, 0.5, m.steel, 0, 1.97, -0.08);
  hood.rotation.x = 0.16;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 200;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  screenMat.userData.keep = true;
  add(s, new THREE.PlaneGeometry(0.5, 0.39), screenMat, 0, 1.58, -0.008);
  ctx.display = { c, tex };
  const led = (color, px) => { const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false }); mat.userData.keep = true; add(s, new THREE.SphereGeometry(0.012, 8, 6), mat, px, 1.3, -0.008); };
  led('#35e06a', -0.14); led('#35e06a', -0.08); led('#ffc533', -0.02);
  // Flow cell: the sample runs through a clear manifold, one probe per measurement
  const list = bio ? [...PROBES, ['TLF', '#f6c32c']] : PROBES;
  box(s, 1.2, 0.5, 0.02, m.pvc, 0, 0.72, -0.27);
  strut(s, [-0.54, 0.6, -0.14], [0.54, 0.6, -0.14], 0.042, m.acrylic);
  strut(s, [-0.54, 0.6, -0.14], [0.54, 0.6, -0.14], 0.03, ctx.waterMat ?? (ctx.waterMat = waterMaterial()));
  for (const px of [-0.46, 0.46]) box(s, 0.03, 0.1, 0.13, m.steel, px, 0.63, -0.2);
  list.forEach(([, color], i) => {
    const px = -0.38 + (0.76 / (list.length - 1)) * i;
    const collar = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    cyl(s, 0.019, 0.019, 0.26, m.steel, px, 0.72, -0.14, 10);
    cyl(s, 0.03, 0.03, 0.09, collar, px, 0.87, -0.14, 12);
    pipe(s, [[px, 0.91, -0.14], [px, 1.0, -0.2], [px * 0.4, 1.06, -0.2]], 0.005, m.black, { fittings: false });
  });
  // Sample pump, drain and return line
  box(s, 0.22, 0.17, 0.17, m.pvcBlue, 0.42, 0.21, -0.1);
  pipe(s, [[0.53, 0.2, -0.1], [0.62, 0.6, -0.14], [0.56, 0.6, -0.14]], 0.011, m.black, { fittings: false });
  pipe(s, [[-0.56, 0.6, -0.14], [-0.74, 0.6, -0.14], [-0.74, 0.1, -0.14], [-1.3, 0.05, 0.1]], 0.011, m.pvc, { fittings: false });
  // Solar panel, antenna and status light
  cyl(s, 0.03, 0.04, 3.1, m.steel, -0.86, 1.55, -0.4, 10);
  solarPanel(s, 0.9, 0.62, -0.86, 3.08, -0.3, 0.3);
  cyl(s, 0.009, 0.014, 1.15, m.tankWhite, -0.66, 2.6, -0.4, 8);
  strut(s, [-0.86, 2.3, -0.4], [-0.66, 2.3, -0.4], 0.012, m.steel);
  g.add(s);
  ctx.sensorAt = [x, z];
  ctx.sensorRy = ry;
}

/** Redraw the screen on a sensor station. */
export function updateDisplay(ctx, st) {
  const d = ctx.display;
  if (!d || !st?.reading) return;
  const g = d.c.getContext('2d');
  const r = st.reading;
  g.fillStyle = '#071a2f'; g.fillRect(0, 0, 256, 200);
  g.fillStyle = '#35e06a'; g.font = '700 21px monospace'; g.fillText(`${st.id}  SIM`, 12, 26);
  const rows = [['TURB', `${r.turbidity?.toFixed(1)} NTU`], ['pH', r.ph?.toFixed(2)], ['ORP', `${Math.round(r.orp)} mV`], ['TDS', `${Math.round(r.tds)} mg/L`], ['TEMP', `${r.temp?.toFixed(1)} C`]];
  if (r.bio != null) rows.push(['TLF', `${r.bio.toFixed(1)} ppb`]);
  g.font = '500 19px monospace';
  rows.forEach(([k, v], i) => {
    const y = 52 + i * 24;
    g.fillStyle = '#7fd0ff'; g.fillText(k, 12, y);
    g.fillStyle = '#ffffff'; g.fillText(v, 96, y);
  });
  d.tex.needsUpdate = true;
}

/* ---------------- water points ---------------- */
function kiosk(ctx) {
  const { g, m } = ctx;
  disc(ctx, 23, m.grass);
  spot(ctx, m.gravel, -1, 3.5, 17, 11);
  slab(g, 10, 4.2, 2.4, 7.6);

  house(g, {
    x: 0, z: -2, w: 8.6, d: 5.4, h: 2.9, paint: m.paint, roof: m.roofBlue, doorMat: m.door,
    front: [{ k: 'counter', x: -1.7, y: 0.95, w: 3, h: 1.15 }, { k: 'door', x: 2.7, y: 0, w: 0.95, h: 2.1 }],
    back: [-2.4, 0, 2.4].map((x) => ({ x, y: 1.05, w: 1.1, h: 1.05 })),
    right: [{ x: 0, y: 1.05, w: 1.1, h: 1.05 }],
  });
  lean(g, 9.4, 2.5, 3.2, 2.75, -0.2, 2.1 + 0.95, m.roofTin);
  signPanel(g, 'BULOS WATER KIOSK', 'Safe water from the Barangay Council', -0.2, 3.12, 4.36, 6.4, { bg: '#2f5be7', fg: '#ffffff', h: 0.68 });
  for (const x of [-3.2, 2.8]) strut(g, [x, 2.76, 4.34], [x, 3, 4.34], 0.022, m.steel);
  for (const x of [-4.6, 4.2]) cyl(g, 0.05, 0.05, 2.75, m.steel, x, 1.37, 4.2, 10);

  tankStand(g, -8.4, -4.2, 2.5, 4.2);
  polyTank(g, 1.12, 2.25, -8.4, 4.3, -4.2, m.tank);
  ladder(g, -6.95, 0, -4.2, 4.4, Math.PI / 2, true);
  pipe(g, [[-7.6, 4.3, -3.4], [-7.6, 0.5, -3.4], [-7.6, 0.5, 1.2], [-6, 0.5, 1.2]], 0.042, m.pvcBlue);
  gateValve(ctx, g, -7.6, 0.5, -1, 0.05, 'z');
  ctx.tankAt = [-8.4, 5.4, -4.2];

  // Cartridge filters on a skid
  slab(g, 3.2, 1.5, -4.4, 1.3, 0.14, m.concrete);
  for (let i = 0; i < 3; i += 1) {
    const x = -5.4 + i * 0.95;
    cyl(g, 0.14, 0.14, 0.95, m.tankWhite, x, 0.72, 1.3, 16);
    cyl(g, 0.16, 0.16, 0.08, m.pvcBlue, x, 1.23, 1.3, 16);
    add(g, new THREE.SphereGeometry(0.05, 10, 8), m.steel, x, 1.32, 1.3);
  }
  pipe(g, [[-6, 1.38, 1.3], [-2.9, 1.38, 1.3], [-2.9, 0.1, 1.3], [-2.9, 0.1, 7.1], [-0.5, 0.1, 7.1]], 0.028, m.pvcBlue);

  // Tap stand: tiled wall, four brass taps, drain channel
  box(g, 6.2, 0.95, 0.42, m.block, 2.6, 0.62, 7.1);
  box(g, 6.32, 0.06, 0.52, m.concrete, 2.6, 1.12, 7.1);
  box(g, 6.6, 0.1, 0.7, m.concrete, 2.6, 0.19, 7.75);
  box(g, 6.1, 0.012, 0.3, m.darkSteel, 2.6, 0.245, 7.75);
  ctx.taps = [];
  const brass = new THREE.MeshStandardMaterial({ color: '#c79a3f', roughness: 0.32, metalness: 0.9 });
  for (let i = 0; i < 4; i += 1) {
    const x = 0.5 + i * 1.4;
    strut(g, [x, 0.92, 7.3], [x, 0.92, 7.42], 0.016, brass);
    cyl(g, 0.016, 0.012, 0.09, brass, x, 0.87, 7.43, 8);
    box(g, 0.1, 0.012, 0.02, brass, x, 0.98, 7.34);
    const stream = cyl(g, 0.012, 0.009, 0.62, ctx.waterMat ?? (ctx.waterMat = waterMaterial()), x, 0.53, 7.43, 8);
    ctx.taps.push(stream);
  }
  sensorNode(ctx, 9, 2.4, { ry: -0.5 });
  box(g, 2.3, 0.06, 0.48, m.wood, -5.2, 0.47, 6.8);
  for (const x of [-6.1, -4.3]) box(g, 0.07, 0.44, 0.42, m.darkSteel, x, 0.23, 6.8);
  for (const [x, z, c] of [[-0.6, 8.9, '#2b6fd0'], [0.1, 9.2, '#f0b429'], [4.6, 8.9, '#2b6fd0'], [5.3, 9.1, '#e9edf0'], [7.4, 7.3, '#2b6fd0']]) jerrycan(g, x, z, rnd(0, 3), c);

  for (let i = 0; i < 6; i += 1) addPerson(ctx, { shirt: pick(i), pants: i % 2 ? '#2e3a4f' : '#6a5a48', shorts: i % 3 === 0, long: i % 2 === 1, carry: 'can', hair: i % 4 === 0 ? '#3b2a20' : '#17120f' }, 0.5 + (i % 2) * 2.8, 9.4 + Math.floor(i / 2) * 1, Math.PI);
  addPerson(ctx, { shirt: '#e87ba4', long: true, carry: 'can', mode: 'fill' }, 1.9, 8.15, Math.PI);
  addPerson(ctx, { shirt: '#3fa676', shorts: true, hat: 'cap', carry: 'can', mode: 'fill' }, 3.3, 8.15, Math.PI);
  addPerson(ctx, { shirt: '#f0b429', carry: 'can', mode: 'walk', path: [[11, 9], [-9, 13], [-14, 5], [11, 9]] }, 0, 0);
  addPerson(ctx, { shirt: '#8a63d2', long: true, carry: 'can', mode: 'walk', path: [[-10, 11], [12, 12], [13, 4], [-10, 11]], speed: 1 }, 0, 0);
  addPerson(ctx, { shirt: '#ffffff', shorts: true, scale: 0.72, mode: 'play', path: [[9, 6], [13, 8], [9, 11], [9, 6]], speed: 2 }, 0, 0);

  for (const [x, z, h] of [[-14, -9, 10], [14, -8, 9], [17, 5, 11], [-17, 7, 9]]) coconut(g, x, z, h);
  tree(g, 7, -12, 1.2);
  tree(g, -3, -13, 0.95);
  for (const [x, z] of [[13, 13], [-13, 12], [-15, -2]]) banana(g, x, z);
  grassTufts(g, 130, 14, 17.8);
}

function springBox(ctx) {
  const { g, m } = ctx;
  disc(ctx, 23, m.grass);
  hillside(g, 50, 24, 9, 0, -10.5, m.grass);
  spot(ctx, m.gravel, 1, 5.5, 11, 5.5);
  track(ctx, [[20, 9], [12, 8.5], [6, 6]], 1.3, m.soil);

  // Spring box: a concrete chamber built into the slope, with stone wing walls
  box(g, 7, 2, 4.4, m.concrete, 0, 1, -1.6);
  box(g, 7.5, 0.22, 4.9, m.slab, 0, 2.1, -1.6);
  for (const [x, ry] of [[-5.9, 0.42], [5.9, -0.42]]) { const w = box(g, 5.2, 1.8, 0.55, m.stone, x, 0.9, -1.6); w.rotation.y = ry; }
  for (const [x, d] of [[-1.5, 1.2], [1.5, 1.2]]) {
    box(g, d, 0.09, d, m.bluePlate, x, 2.26, -1.5);
    box(g, 0.28, 0.03, 0.05, m.steel, x, 2.33, -1.5 + d / 2 - 0.18);
    for (const s of [-1, 1]) box(g, 0.03, 0.03, d, m.darkSteel, x + (s * d) / 2, 2.27, -1.5);
  }
  // Screened vents
  for (const x of [-3, 3]) {
    pipe(g, [[x, 2.2, -2.6], [x, 3.05, -2.6]], 0.05, m.pvc, { fittings: false });
    const v = add(g, new THREE.TorusGeometry(0.11, 0.05, 8, 14, Math.PI), m.pvc, x + 0.11, 3.05, -2.6);
    v.rotation.y = 0;
    box(g, 0.13, 0.015, 0.13, m.darkSteel, x + 0.22, 3, -2.6);
  }
  signPanel(g, 'IN-01  SPRING INTAKE', 'Protected source. Keep clear.', 0, 1.3, 0.64, 3.6, { bg: '#f7f7f2', fg: '#20335e', h: 0.8 });

  // Overflow into a stone-lined pool, running away as a brook
  pipe(g, [[-2.4, 0.6, 0.6], [-2.4, 0.6, 1.2]], 0.075, m.pvc, { fittings: false });
  ctx.taps = [];
  ctx.waterMat = waterMaterial();
  ctx.taps.push(cyl(g, 0.05, 0.035, 0.6, ctx.waterMat, -2.4, 0.3, 1.26, 10));
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 3.4, 2.1, 0, Math.PI * 2);
  pond(ctx, new THREE.ShapeGeometry(shape, 28).rotateX(-Math.PI / 2), -4, 0.06, 3.2);
  for (let i = 0; i < 26; i += 1) { const a = (i / 26) * 6.28; rock(g, -4 + Math.cos(a) * rnd(3.3, 3.8), 3.2 + Math.sin(a) * rnd(2, 2.5), rnd(0.2, 0.52)); }
  const course = [[-6.4, 4.6, 0.8], [-8, 6.2, 1], [-8.4, 8.6, 1.2], [-10.4, 10.6, 1], [-11, 13.4, 1.2], [-13.6, 15.6, 1], [-14.4, 18.4, 1.1], [-17, 21, 0.9]];
  pond(ctx, ribbon(course, 1.5), 0, 0.05, 0);
  for (const [x, z] of course.slice(1)) for (const s of [-1, 1]) for (let i = 0; i < 2; i += 1) rock(g, x + s * rnd(0.8, 1.2) + rnd(-0.4, 0.4), z + rnd(-0.9, 0.9), rnd(0.16, 0.42));

  // Outlet: chamber with a gate valve, then black HDPE down the slope on concrete blocks
  box(g, 2, 0.9, 1.6, m.concrete, 4.6, 0.45, 2);
  box(g, 1.6, 0.1, 1.2, m.interior, 4.6, 0.86, 2);
  pipe(g, [[3.4, 0.5, 0.6], [3.4, 0.62, 2], [5.9, 0.62, 2], [9, 0.32, 5], [22, 0.32, 8]], 0.06, m.hdpe, { coupling: 6 });
  gateValve(ctx, g, 4.6, 0.62, 2, 0.07);
  for (const [x, z] of [[9, 5], [13.3, 6], [17.6, 7]]) box(g, 0.5, 0.26, 0.4, m.concrete, x, 0.13, z);
  sensorNode(ctx, 8.4, 1.2, { ry: -0.35 });
  ctx.tankAt = [0, 1.4, -1.6];

  // Concrete posts and barbed wire around the protected zone
  for (let i = 0; i <= 12; i += 1) {
    const a = 0.1 + (i / 12) * 2.95;
    const [x, z] = [Math.cos(a) * 16, Math.sin(a) * 9.6 + 1];
    box(g, 0.14, 1.5, 0.14, m.concrete, x, 0.75, z);
    if (i < 12) {
      const b = 0.1 + ((i + 1) / 12) * 2.95;
      for (const y of [0.6, 1.05, 1.42]) strut(g, [x, y, z], [Math.cos(b) * 16, y, Math.sin(b) * 9.6 + 1], 0.006, m.steel);
    }
  }
  addPerson(ctx, { shirt: '#f28c28', pants: '#37424f', hat: 'hard', mode: 'work' }, 4.6, 3.2, Math.PI);
  addPerson(ctx, { shirt: '#3f7fd6', hat: 'farmer', carry: 'pack', mode: 'walk', path: [[19, 9], [8, 7.6], [2, 7.5], [8, 7.6], [19, 9]] }, 0, 0);

  for (const [x, z, s] of [[-13, -9, 1.5], [-6, -11, 1.3], [5, -12, 1.5], [13, -9, 1.35], [18, 0, 1.15], [-18, 0, 1.25], [-19, 10, 1.1], [0, -15, 1.4]]) { const t = new THREE.Group(); t.position.y = Math.max(0, -z - 3) * 0.32; tree(t, x, z, s); g.add(t); }
  for (let i = 0; i < 22; i += 1) { const x = rnd(-20, 20); const z = rnd(-7, -4.4); if (Math.abs(x) > 8.4) fern(g, x, z + 0, rnd(0.8, 1.3)); }
  for (const [x, z] of [[-16, 4], [16, 5], [14, -3], [-9, 11]]) banana(g, x, z, 2.2);
  for (const [x, z, r] of [[-8.6, 7, 0.9], [-6.8, -0.2, 1], [8.6, -2.4, 1.1], [11, 3, 0.7]]) rock(g, x, z, r);
  grassTufts(g, 150, 8, 17.8, [[-4, 3.2, 5], [1, 5.5, 9], [-11, 8.4, 3]]);
}

/** Hydromet station on the Naga River: stilling well, telemetry mast, instrument yard and river catwalk. */
function sentinel(ctx) {
  const { g, m } = ctx;
  disc(ctx, 23, m.grass);
  spot(ctx, m.gravel, -0.5, 0.5, 13.5, 11);
  slab(g, 6, 3.5, -5.4, 3.2, 0.1, m.concrete);
  fence(g, [[-1.8, 9], [-11.5, 9], [-11.5, -8.5], [10.5, -8.5], [10.5, 9], [1.2, 9]]);
  const gate = new THREE.Group();
  gate.position.set(-1.8, 0, 9);
  gate.rotation.y = -0.45;
  add(gate, new THREE.PlaneGeometry(1.5, 1.75), m.chain, 0.75, 0.95, 0);
  for (const [a, b] of [[[0, 0.1, 0], [1.5, 0.1, 0]], [[0, 1.82, 0], [1.5, 1.82, 0]], [[1.5, 0.1, 0], [1.5, 1.82, 0]]]) strut(gate, a, b, 0.02, m.steel);
  g.add(gate);

  house(g, {
    x: -5, z: -4.6, w: 6.4, d: 4.2, h: 2.7, paint: m.paintBlue, roof: m.roofTin,
    front: [{ k: 'door', x: 1.5, y: 0, w: 0.95, h: 2.1 }, { x: -1.2, y: 1, w: 1.2, h: 1 }],
    back: [{ x: 0, y: 1, w: 1.2, h: 1 }],
    left: [{ x: 0, y: 1, w: 1, h: 1 }],
  });
  signPanel(g, 'HYDROMET STATION AG-02', 'River and water quality monitoring', -5.8, 2.75, -2.44, 3.6, { bg: '#10325f', fg: '#ffffff', h: 0.55 });

  // Stilling well: a concrete tower connected to the river, with the recorder shelter on top
  cyl(g, 0.68, 0.76, 4.3, m.concrete, 6, 2.15, 5, 28);
  box(g, 2.2, 1.5, 2.2, m.paintBlue, 6, 5, 5);
  box(g, 0.8, 1.2, 0.04, m.door, 6, 4.9, 6.12);
  const cap = new THREE.Group();
  cap.position.set(6, 0, 5);
  gableRoof(cap, 2.8, 2.8, 0.42, 5.75, m.roofTin, { gutter: false });
  g.add(cap);
  ladder(g, 7.1, 0, 5, 4.3, Math.PI / 2, true);
  box(g, 2.8, 0.06, 1.1, m.darkSteel, 7.3, 4.24, 5);
  for (const z of [4.5, 5.5]) strut(g, [6.9, 5.2, z], [8.7, 5.2, z], 0.018, m.steel);
  for (const [x, z] of [[8.7, 4.5], [8.7, 5.5]]) cyl(g, 0.016, 0.016, 1, m.steel, x, 4.72, z, 8);
  ctx.tankAt = [6, 4, 5];
  pipe(g, [[6, 0.3, 5.7], [6, 0.3, 11.5], [6, 0.1, 20]], 0.06, m.pvc, { coupling: 3 });

  // Staff gauge
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const q = c.getContext('2d');
  q.fillStyle = '#ffffff'; q.fillRect(0, 0, 64, 512);
  for (let i = 0; i < 40; i += 1) { q.fillStyle = i % 10 === 0 ? '#c0281f' : '#14243f'; if (i % 2 === 0) q.fillRect(0, i * 12.8, i % 10 === 0 ? 64 : 34, 6.4); }
  const staff = new THREE.CanvasTexture(c);
  staff.colorSpace = THREE.SRGBColorSpace;
  add(g, new THREE.BoxGeometry(0.2, 3.6, 0.03), new THREE.MeshStandardMaterial({ map: staff, roughness: 0.5 }), 8.8, 1.8, 7.9);
  cyl(g, 0.04, 0.04, 4, m.steel, 8.8, 2, 7.84, 8);

  // Telemetry mast: a triangular lattice with guy wires
  const [mx, mz, H] = [5.4, -4.4, 12];
  const legs = [[0, 0.32], [-0.28, -0.16], [0.28, -0.16]];
  legs.forEach(([a, b]) => cyl(g, 0.024, 0.03, H, m.steel, mx + a, H / 2, mz + b, 8));
  for (let y = 0.6; y < H; y += 0.6) {
    legs.forEach(([a, b], i) => {
      const [c2, d2] = legs[(i + 1) % 3];
      strut(g, [mx + a, y, mz + b], [mx + c2, y + 0.6, mz + d2], 0.008, m.steel);
      strut(g, [mx + a, y, mz + b], [mx + c2, y, mz + d2], 0.009, m.steel);
    });
  }
  box(g, 1.1, 0.3, 1.1, m.concrete, mx, 0.15, mz);
  for (const [a, b] of [[-3.6, 2.8], [3.4, 2.6], [0, -3.4]]) strut(g, [mx, 8, mz], [mx + a, 0.2, mz + b], 0.004, m.steel);
  solarPanel(g, 1.8, 1.05, mx, 6.5, mz + 0.9, 0.42);
  strut(g, [mx, 6.4, mz + 0.2], [mx, 6.5, mz + 0.9], 0.03, m.darkSteel);
  box(g, 0.5, 0.7, 0.22, m.enclosure, mx, 2, mz + 0.42);
  cyl(g, 0.014, 0.02, 2.2, m.tankWhite, mx, H + 1, mz, 8);
  const dish = add(g, new THREE.SphereGeometry(0.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), m.tankWhite, mx, 10, mz + 0.5);
  dish.rotation.x = 2;
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff3b30', toneMapped: false });
  beaconMat.userData.keep = true;
  ctx.beacon = add(g, new THREE.SphereGeometry(0.08, 12, 10), beaconMat, mx, H + 2.15, mz);
  // Cup anemometer
  const head = new THREE.Group();
  head.position.set(mx + 0.4, H + 0.3, mz);
  strut(g, [mx, H + 0.1, mz], [mx + 0.4, H + 0.1, mz], 0.012, m.darkSteel);
  cyl(g, 0.012, 0.012, 0.22, m.darkSteel, mx + 0.4, H + 0.2, mz, 8);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    strut(head, [0, 0, 0], [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], 0.006, m.darkSteel);
    add(head, new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI), m.tankWhite, Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22).rotation.y = -a;
  }
  g.add(head);
  ctx.spin.push(head);

  // Instrument yard
  sensorNode(ctx, -6.2, 3, { bio: true });
  rainGauge(g, -1.8, 3, m);
  screen(g, 1.4, 3.4, m);
  for (const x of [0.6, 1.6]) { box(g, 0.72, 1.2, 0.42, m.enclosure, x, 0.72, -1.2); box(g, 0.8, 0.12, 0.5, m.concrete, x, 0.06, -1.2); }
  pipe(g, [[1.2, 0.1, -0.9], [4, 0.1, 2.6], [5.2, 0.1, 4.2]], 0.03, m.black, { fittings: false });

  // Catwalk out to the river, carrying the biological sonde
  const zs = [9.4, 11.8, 14.2, 16.6];
  for (let i = 0; i < 34; i += 1) box(g, 1.4, 0.05, 0.22, m.wood, -6.2, 0.92, 9.3 + i * 0.25);
  for (const x of [-6.75, -5.65]) {
    strut(g, [x, 0.84, 9.2], [x, 0.84, 17.7], 0.05, m.darkSteel, true);
    strut(g, [x, 1.92, 9.2], [x, 1.92, 17.7], 0.02, m.steel);
    strut(g, [x, 1.42, 9.2], [x, 1.42, 17.7], 0.012, m.steel);
    for (const z of zs) { cyl(g, 0.018, 0.018, 1, m.steel, x, 1.42, z, 8); cyl(g, 0.05, 0.05, 1.5, m.darkSteel, x, 0.1, z, 10); }
  }
  cyl(g, 0.012, 0.012, 1.4, m.black, -6.2, 0.3, 17.6, 6);
  cyl(g, 0.06, 0.06, 0.5, m.tankWhite, -6.2, -0.3, 17.6, 12);

  addPerson(ctx, { shirt: '#f28c28', pants: '#37424f', hat: 'hard', carry: 'clipboard', mode: 'work' }, -6.2, 16.2, 0, 0.95);
  addPerson(ctx, { shirt: '#ffffff', pants: '#1f3a5f', long: true, carry: 'clipboard', mode: 'walk', path: [[-1, 6], [5, 8], [8, 0], [0, 1], [-1, 6]], speed: 0.9 }, 0, 0);
  addPerson(ctx, { shirt: '#2c8a99', pants: '#37424f', hat: 'cap', mode: 'work' }, 1.1, -0.3, Math.PI);
  for (const [x, z, s] of [[-17, -8, 1.2], [16, 8, 1.1], [15, -13, 1.3], [-17, 10, 1]]) tree(g, x, z, s);
  coconut(g, 17, -2, 9.5);
  coconut(g, -16, 2, 10);
  banana(g, 13.5, 13);
  grassTufts(g, 110, 13.5, 17.8, [[-6, 13, 3]]);
}

function rainGauge(g, x, z, m) {
  box(g, 0.7, 0.14, 0.7, m.concrete, x, 0.07, z);
  cyl(g, 0.05, 0.07, 1, m.steel, x, 0.64, z, 12);
  cyl(g, 0.11, 0.11, 0.36, m.tankWhite, x, 1.3, z, 24);
  add(g, new THREE.LatheGeometry([new THREE.Vector2(0.02, 0), new THREE.Vector2(0.1, 0.09), new THREE.Vector2(0.12, 0.12)], 24), m.darkSteel, x, 1.47, z);
}

/** Louvred instrument shelter on legs. */
function screen(g, x, z, m) {
  for (const [a, b] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) cyl(g, 0.025, 0.03, 1.2, m.trim, x + a, 0.6, z + b, 8);
  box(g, 0.76, 0.52, 0.76, m.interior, x, 1.45, z);
  for (let i = 0; i < 7; i += 1) for (const [a, b, w, d] of [[0, 0.39, 0.8, 0.02], [0, -0.39, 0.8, 0.02], [0.39, 0, 0.02, 0.8], [-0.39, 0, 0.02, 0.8]]) box(g, w, 0.05, d, m.trim, x + a, 1.22 + i * 0.075, z + b);
  box(g, 0.96, 0.05, 0.96, m.trim, x, 1.76, z);
}

function solarWell(ctx) {
  const { g, m } = ctx;
  disc(ctx, 23, m.grass);
  spot(ctx, m.soil, 0, 2, 16, 12);
  spot(ctx, m.gravel, 2.5, -2.5, 7.5, 6, 0.022);

  // Ground-mounted array: two rows on a steel rack
  for (let r = 0; r < 2; r += 1) {
    const z = 6 + r * 3.8;
    for (const x of [-11.4, -7.9, -4.4, -0.9]) {
      cyl(g, 0.04, 0.05, 0.95, m.steel, x, 0.47, z + 0.75, 10);
      cyl(g, 0.04, 0.05, 1.95, m.steel, x, 0.97, z - 0.75, 10);
      box(g, 0.3, 0.14, 0.3, m.concrete, x, 0.07, z + 0.75);
      box(g, 0.3, 0.14, 0.3, m.concrete, x, 0.07, z - 0.75);
      strut(g, [x, 0.95, z + 0.75], [x, 1.95, z - 0.75], 0.03, m.steel, true);
    }
    strut(g, [-12, 1.2, z + 0.4], [-0.3, 1.2, z + 0.4], 0.024, m.steel, true);
    strut(g, [-12, 1.72, z - 0.4], [-0.3, 1.72, z - 0.4], 0.024, m.steel, true);
    for (let i = 0; i < 6; i += 1) solarPanel(g, 1.92, 1.72, -11.15 + i * 1.98, 1.5, z, 0.58);
  }
  pipe(g, [[-0.3, 0.8, 6], [0.9, 0.1, 5], [-1.8, 0.1, 1.4]], 0.018, m.black, { fittings: false });

  // Elevated tank and riser
  tankStand(g, 5.4, -3.2, 3, 6.4);
  polyTank(g, 1.35, 2.6, 5.4, 6.5, -3.2, m.tankWhite);
  ladder(g, 7.2, 0, -3.2, 6.6, Math.PI / 2, true);
  pipe(g, [[4.6, 6.5, -2.4], [4.6, 0.45, -2.4], [0, 0.45, -1.4], [-2.4, 0.45, 1.8]], 0.05, m.pvcBlue);
  gateValve(ctx, g, 2.4, 0.45, -1.92, 0.06);
  ctx.tankAt = [5.4, 7.6, -3.2];

  // Pump house and wellhead
  house(g, {
    x: -7, z: -4.6, w: 4.4, d: 3.4, h: 2.4, paint: m.paintGreen, roof: m.roofBlue,
    front: [{ k: 'door', x: 0.9, y: 0, w: 0.9, h: 2 }, { x: -0.9, y: 1, w: 1, h: 0.9 }],
    left: [{ x: 0, y: 1, w: 0.9, h: 0.9 }],
  });
  box(g, 1.7, 0.5, 1.7, m.concrete, -2.4, 0.25, 2.2);
  cyl(g, 0.16, 0.16, 0.5, m.darkSteel, -2.4, 0.74, 2.2, 16);
  cyl(g, 0.24, 0.24, 0.05, m.darkSteel, -2.4, 1, 2.2, 16);
  for (let i = 0; i < 8; i += 1) { const a = (i / 8) * 6.28; cyl(g, 0.012, 0.012, 0.07, m.steel, -2.4 + Math.cos(a) * 0.2, 1.04, 2.2 + Math.sin(a) * 0.2, 6); }
  box(g, 0.5, 0.65, 0.2, m.enclosure, -0.9, 1.15, 3);
  cyl(g, 0.03, 0.03, 1.5, m.steel, -0.9, 0.75, 3.13, 8);
  sensorNode(ctx, 9.6, 3.4, { ry: -0.4 });
  signPanel(g, 'MB-04 SOLAR WELL', 'Barangay Water Association', 3.2, 1.7, 2.6, 2.6, { bg: '#f7f7f2', fg: '#20335e', h: 0.7, posts: true });

  addPerson(ctx, { shirt: '#3fa676', pants: '#5b4b3a', hat: 'farmer', mode: 'work' }, -1.6, 3.4, Math.PI);
  addPerson(ctx, { shirt: '#d9534f', hat: 'farmer', shorts: true, carry: 'can', mode: 'walk', path: [[11, 9], [4, 12], [-12, 1], [1, -8], [11, 9]] }, 0, 0);
  for (const [x, z, h] of [[15, -8, 10], [-16, 3, 9], [14, 11, 11], [-14, -11, 9.5]]) coconut(g, x, z, h);
  tree(g, 0, -14, 1.2);
  for (const [x, z] of [[16, 3], [-17, 13], [8, 15]]) banana(g, x, z);
  grassTufts(g, 110, 13.5, 17.8);
}

function healthUnit(ctx) {
  const { g, m } = ctx;
  disc(ctx, 34, m.grass);
  spot(ctx, m.gravel, -3, 6.5, 29, 12);
  slab(g, 13, 7, 0, 5.2);

  const win = (n, w, sp = 0) => Array.from({ length: n }, (_, i) => ({ x: -w / 2 + (w / (n + 1)) * (i + 1) + sp, y: 1.05, w: 1.15, h: 1.1 }));
  house(g, {
    x: 0, z: -2.4, w: 16, d: 7, h: 3.1, paint: m.paint, roof: m.roofBlue,
    front: [...win(4, 16).map((o) => ({ ...o, x: o.x + (o.x > 0 ? 1.1 : -1.1) })), { k: 'door', x: 0, y: 0, w: 1.7, h: 2.2 }],
    back: win(5, 16),
    left: win(2, 7), right: win(2, 7),
  });
  house(g, { x: 12, z: 0.5, w: 7.4, d: 9, h: 3.1, paint: m.paint, roof: m.roofBlue, front: win(2, 7.4), back: win(2, 7.4), right: win(3, 9) });
  signPanel(g, 'RURAL HEALTH UNIT', 'Naga City Health Office', 0, 4.25, 3.2, 6.6, { bg: '#ffffff', fg: '#17478f', h: 0.72 });
  // Entrance canopy and an accessible ramp
  lean(g, 6, 3, 3.5, 3.2, 0, 2.6, m.roofTin);
  for (const x of [-2.8, 2.8]) cyl(g, 0.07, 0.07, 3.2, m.steel, x, 1.6, 3.8, 12);
  const ramp = box(g, 1.3, 0.1, 3.8, m.slab, -4.7, 0.24, 3.2);
  ramp.rotation.x = 0.08;
  for (const x of [-5.3, -4.1]) { strut(g, [x, 1.2, 1.3], [x, 0.95, 5.1], 0.018, m.steel); for (const z of [1.4, 3.2, 5]) cyl(g, 0.016, 0.016, 0.85, m.steel, x, 0.72, z, 8); }
  box(g, 0.9, 0.3, 2.4, m.concrete, 0, 0.15, 2.2);

  // School with an upper corridor
  const school = new THREE.Group();
  school.position.set(-21, 0, -2);
  const classes = (x) => ({ x, y: 1, w: 1.4, h: 1.15 });
  const front = [classes(-5.6), classes(-2.8), { k: 'door', x: 0, y: 0, w: 1, h: 2.1 }, classes(2.8), classes(5.6)];
  house(school, { w: 15.5, d: 7, h: 3, paint: m.paintYellow, roof: null, front, back: [-5.6, -2.8, 0, 2.8, 5.6].map(classes) });
  box(school, 15.9, 0.18, 7.4, m.concrete, 0, 3.39, 0);
  house(school, { y: 3.3, w: 15.5, d: 7, h: 3, floor: 0.2, paint: m.paintYellow, roof: m.roofRed, front, back: [-5.6, -2.8, 0, 2.8, 5.6].map(classes) });
  box(school, 15.9, 0.16, 1.5, m.concrete, 0, 3.4, 4.2);
  for (let i = 0; i <= 16; i += 1) cyl(school, 0.02, 0.02, 1, m.darkSteel, -7.8 + i * 0.975, 3.96, 4.92, 6);
  strut(school, [-7.8, 4.46, 4.92], [7.8, 4.46, 4.92], 0.024, m.darkSteel);
  for (const x of [-7.6, -2.6, 2.6, 7.6]) cyl(school, 0.1, 0.1, 3.35, m.slab, x, 1.68, 4.82, 12);
  signPanel(school, 'ELEMENTARY SCHOOL', '', 0, 2.75, 3.52, 4.8, { bg: '#2f5be7', fg: '#ffffff', h: 0.42 });
  g.add(school);

  // Flag on a pole
  cyl(g, 0.04, 0.06, 9, m.steel, -14, 4.5, 10, 10);
  box(g, 1.6, 0.3, 1.6, m.concrete, -14, 0.15, 10);
  const flag = new THREE.Group();
  box(flag, 1.5, 0.45, 0.015, new THREE.MeshStandardMaterial({ color: '#0038a8' }), 0.78, 0.23, 0).material.userData.keep = true;
  box(flag, 1.5, 0.45, 0.015, new THREE.MeshStandardMaterial({ color: '#ce1126' }), 0.78, -0.22, 0).material.userData.keep = true;
  flag.position.set(-14, 8.3, 10);
  g.add(flag);
  ctx.flag = flag;

  // Water supply: tank, valve and a tap by the gate
  tankStand(g, 19, 7.4, 2.2, 3.2);
  polyTank(g, 1, 2, 19, 3.3, 7.4, m.tank);
  ladder(g, 20.3, 0, 7.4, 3.3, Math.PI / 2);
  pipe(g, [[18.4, 3.3, 8], [18.4, 0.45, 8], [14, 0.45, 8.6], [8, 0.45, 8.6], [8, 0.9, 8.6]], 0.04, m.pvcBlue);
  gateValve(ctx, g, 15.6, 0.45, 8.42, 0.055);
  ctx.tankAt = [19, 4.4, 7.4];
  box(g, 0.3, 0.9, 0.3, m.block, 8, 0.45, 8.6);
  sensorNode(ctx, 21.4, 13, { ry: -0.6 });

  addPerson(ctx, { shirt: '#7dd0c3', pants: '#7dd0c3', long: true, carry: 'clipboard', mode: 'idle' }, 4.6, 7.2, -0.8);
  addPerson(ctx, { shirt: '#7dd0c3', pants: '#7dd0c3', carry: 'clipboard', mode: 'walk', path: [[-3, 6], [3.5, 6], [3.5, 9.5], [-3, 9.5], [-3, 6]], speed: 1 }, 0, 0);
  addPerson(ctx, { shirt: '#c7a3e8', long: true }, -1.6, 6.4, Math.PI * 0.9, 0.17);
  for (let i = 0; i < 6; i += 1) addPerson(ctx, { shirt: '#ffffff', pants: '#23427e', shorts: true, scale: 0.72, carry: i % 2 ? 'pack' : null, mode: 'play', speed: 2.2, path: [[-27 + i, 7 + (i % 3) * 2], [-17, 11 + (i % 2) * 3], [-13 - i, 6], [-27 + i, 7 + (i % 3) * 2]] }, 0, 0);
  for (const [x, z, h] of [[25, -9, 10], [25, 15, 11], [-31, 13, 9.5], [8, 15, 10]]) coconut(g, x, z, h);
  tree(g, -31, -9, 1.25);
  tree(g, 26, 3, 1.1);
  tree(g, -6, -11, 1.05);
  for (const [x, z] of [[16, 16], [-26, 15]]) banana(g, x, z);
  grassTufts(g, 140, 20, 26.5, [[-3, 6.5, 22]]);
}

/** The piggery where the spill scenario starts. */
function farm(ctx) {
  const { g, m } = ctx;
  disc(ctx, 25, m.grass);
  spot(ctx, m.soil, 0, 3, 15, 10);
  // Open-sided pens under a tin roof
  slab(g, 13, 6, 0, -2, 0.16, m.concrete);
  for (let i = 0; i <= 5; i += 1) box(g, 0.14, 0.85, 5.6, m.block, -6.2 + i * 2.48, 0.58, -2);
  box(g, 12.5, 0.85, 0.14, m.block, 0, 0.58, -4.8);
  box(g, 12.5, 0.85, 0.14, m.block, 0, 0.58, 0.8);
  for (let i = 0; i < 6; i += 1) { cyl(g, 0.05, 0.05, 2.5, m.steel, -6.2 + i * 2.48, 1.3, 0.8, 8); cyl(g, 0.05, 0.05, 2.5, m.steel, -6.2 + i * 2.48, 1.3, -4.8, 8); }
  gableRoof(g, 14, 7.6, 1, 2.5, m.roofTin);
  const pig = (x, z, ry) => {
    const p = new THREE.Group();
    const b = add(p, new THREE.CapsuleGeometry(0.27, 0.55, 6, 14), m.pig, 0, 0.42, 0);
    b.rotation.x = Math.PI / 2;
    add(p, new THREE.SphereGeometry(0.2, 14, 12), m.pig, 0, 0.5, 0.52);
    add(p, new THREE.CylinderGeometry(0.08, 0.09, 0.08, 10), m.pig, 0, 0.47, 0.72).rotation.x = Math.PI / 2;
    for (const s of [-0.1, 0.1]) { const e = add(p, new THREE.ConeGeometry(0.06, 0.12, 8), m.pig, s, 0.68, 0.46); e.rotation.x = -0.4; }
    for (const [a, c] of [[-0.17, 0.26], [0.17, 0.26], [-0.17, -0.26], [0.17, -0.26]]) cyl(p, 0.05, 0.05, 0.28, m.pig, a, 0.14, c, 8);
    p.position.set(x, 0.16, z);
    p.rotation.y = ry;
    g.add(p);
  };
  for (let i = 0; i < 10; i += 1) pig(-5 + (i % 5) * 2.48, -3.6 + Math.floor(i / 5) * 2.8, rnd(0, 6));

  // Open waste lagoon: the spill source
  ctx.waterMat = waterMaterial('#7fa8a0');
  ctx.lagoon = ctx.waterMat;
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 8, 5.2, 0, Math.PI * 2);
  pond(ctx, new THREE.ShapeGeometry(shape, 36).rotateX(-Math.PI / 2), -13, 0.08, 7);
  const bank = add(g, new THREE.TorusGeometry(1, 0.11, 8, 56).rotateX(Math.PI / 2), m.soil, -13, 0.03, 7);
  bank.scale.set(8.3, 1.2, 5.5);
  pipe(g, [[-6.2, 0.2, 0.9], [-9, 0.14, 3.6]], 0.07, m.pvc, { fittings: false });

  addPerson(ctx, { shirt: '#b5894d', pants: '#4e4134', hat: 'farmer', mode: 'walk', path: [[-2, 3], [9, 3], [9, 8], [-2, 8], [-2, 3]], speed: 0.9 }, 0, 0);
  for (const [x, z, h] of [[12, -7, 9], [-9, -8, 8.5], [15, 6, 10]]) coconut(g, x, z, h);
  banana(g, 9, 11);
  grassTufts(g, 90, 15, 19.5);
}

/* ---------------- structures along the network ---------------- */
function rainStation(ctx) {
  const { g, m } = ctx;
  disc(ctx, 10, m.grass);
  spot(ctx, m.gravel, 0, 0, 6, 6);
  fence(g, [[-5.5, -5.5], [5.5, -5.5], [5.5, 5.5], [-5.5, 5.5], [-5.5, -5.5]]);
  rainGauge(g, -2, 1, m);
  rainGauge(g, 0.2, 2, m);
  box(g, 0.62, 1.1, 0.36, m.enclosure, 2.4, 0.7, 0.2);
  box(g, 0.75, 0.14, 0.5, m.concrete, 2.4, 0.07, 0.2);
  cyl(g, 0.05, 0.07, 6.5, m.steel, 1.2, 3.25, -3, 10);
  solarPanel(g, 1.2, 0.8, 1.2, 5.3, -2.5, 0.5);
  signPanel(g, 'AUTOMATED RAIN GAUGE', 'Naga City', 0, 1.3, 5.6, 2.4, { bg: '#10325f', fg: '#ffffff', h: 0.6 });
}

function breakTank(ctx) {
  const { g, m } = ctx;
  box(g, 3.4, 1.6, 2.6, m.concrete, 0, 0.8, 0);
  box(g, 3.6, 0.12, 2.8, m.slab, 0, 1.66, 0);
  box(g, 0.9, 0.08, 0.9, m.bluePlate, 0.6, 1.76, 0);
  pipe(g, [[-0.9, 1.7, 0.5], [-0.9, 2.3, 0.5]], 0.05, m.pvc, { fittings: false });
  pipe(g, [[-5, 0.5, 0], [-1.7, 0.5, 0]], 0.07, m.hdpe, { fittings: false });
  pipe(g, [[1.7, 0.5, 0], [5, 0.5, 0]], 0.07, m.hdpe, { fittings: false });
  signPanel(g, 'BREAK-PRESSURE TANK', '', 0, 1, 1.32, 1.9, { bg: '#f7f7f2', fg: '#20335e', h: 0.34 });
}

function valveChamber(ctx) {
  const { g, m } = ctx;
  box(g, 2.2, 0.55, 2.2, m.concrete, 0, 0.27, 0);
  box(g, 1.2, 0.06, 1.2, m.bluePlate, 0, 0.58, 0);
  cyl(g, 0.04, 0.04, 0.6, m.steel, -0.75, 0.85, 0.75, 8);
  const w = add(g, new THREE.TorusGeometry(0.17, 0.028, 8, 20), m.darkSteel, -0.75, 1.16, 0.75);
  w.rotation.x = Math.PI / 2;
}

function pumpStation(ctx) {
  const { g, m } = ctx;
  lay(ctx, add(g, new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2), m.gravel, 0, 0.02, 0));
  house(g, { w: 6, d: 4.4, h: 2.8, paint: m.paintBlue, roof: m.roofBlue, front: [{ k: 'door', x: 0, y: 0, w: 1, h: 2.1 }, { x: -1.9, y: 1, w: 1, h: 1 }, { x: 1.9, y: 1, w: 1, h: 1 }], back: [{ x: 0, y: 1, w: 1.2, h: 1 }] });
  polyTank(g, 1.3, 3.1, -5.2, 0.1, -0.5, m.tank);
  cyl(g, 0.5, 0.58, 0.5, m.concrete, 4.6, 0.25, 2.2, 18);
  box(g, 1, 0.55, 0.7, m.pvcBlue, 4.6, 0.78, 2.2);
  pipe(g, [[3.8, 0.5, 2.2], [1.5, 0.5, 2.9], [-4, 0.5, 2.9], [-5.2, 0.5, 1]], 0.07, m.pvcBlue);
  fence(g, [[-8, -5], [8, -5], [8, 6], [-8, 6], [-8, -5]]);
}

function waterTower(ctx) {
  const { g, m } = ctx;
  lay(ctx, add(g, new THREE.CircleGeometry(6, 36).rotateX(-Math.PI / 2), m.gravel, 0, 0.02, 0));
  tankStand(g, 0, 0, 3.6, 12);
  cyl(g, 2.5, 2.5, 3.6, m.tankWhite, 0, 13.9, 0, 32);
  add(g, new THREE.ConeGeometry(2.6, 0.9, 32), m.tank, 0, 16.15, 0);
  pipe(g, [[0, 0.3, 0], [0, 12.1, 0]], 0.1, m.pvcBlue);
  ladder(g, 2, 0, 0, 12, Math.PI / 2, true);
}

export const BUILDERS = { 'IN-01': springBox, 'AG-02': sentinel, 'KS-03': kiosk, 'MB-04': solarWell, 'RH-05': healthUnit, FARM: farm, RAIN: rainStation, BPT: breakTank, CHAMBER: valveChamber, PUMP: pumpStation, TOWER: waterTower };

/** Build a facility. Returns its group and the parts the scene animates. */
export function buildSite(id) {
  let hash = 7;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  reseed(hash);
  const m = kit();
  const g = new THREE.Group();
  const ctx = { id, g, m, people: [], taps: [], spin: [], live: [], ground: [], valve: null, flag: null, beacon: null, lagoon: null, radius: 12 };
  (BUILDERS[id] ?? kiosk)(ctx);
  ctx.live.push(...ctx.people, ...ctx.spin, ...ctx.taps);
  if (ctx.flag) ctx.live.push(ctx.flag);
  mergeStatic(ctx);
  return ctx;
}

const CLEAR = new THREE.Color('#3f86b8');
const dirty = new THREE.Color();
/** Show the latest reading on the model: water colour, valve state and running taps. */
export function applyReading(ctx, st) {
  if (ctx.waterMat && ctx.waterMat !== ctx.lagoon && st.reading) {
    // A dirty probe reads high turbidity while the water itself is fine
    const te = st.classification === 'SENSOR_BIOFOULING' ? 0 : st.reading.turbidity - (st.baseline?.turbidity ?? 0);
    const od = (st.baseline?.orp ?? st.reading.orp) - st.reading.orp;
    const [r, g, b] = waterRgb(te, od);
    ctx.waterMat.color.copy(CLEAR).lerp(dirty.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace), waterDirt(te, od));
  }
  const closed = st.valve && !st.valve.open;
  ctx.valve?.color.set(closed ? '#d03b3b' : '#22a35a');
  ctx.valve?.emissive.set(closed ? '#d03b3b' : '#22a35a');
  for (const tap of ctx.taps) tap.visible = !closed;
}

/** Everything that moves in a site, for one frame. */
export function tickSite(ctx, t, dt, { rain = 0, people = true } = {}) {
  if (ctx.flag) ctx.flag.rotation.y = Math.sin(t * 2.4) * 0.22;
  for (const c of ctx.spin) c.rotation.y = t * (3 + rain * 9);
  if (ctx.beacon) ctx.beacon.visible = Math.sin(t * 5) > 0;
  for (const tap of ctx.taps) tap.scale.x = 1 + Math.sin(t * 22 + tap.position.x) * 0.2;
  if (ctx.waterMat) { const n = ctx.waterMat.normalMap; n.offset.set((t * 0.02) % 1, (t * 0.035) % 1); }
  for (const p of ctx.people) { p.visible = people; if (people) animatePerson(p, t, dt); }
}

export function setNightGlow(k) {
  kit().glass.emissiveIntensity = k * 1.15;
}
