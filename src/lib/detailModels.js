import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Detailed facility and people models for the map. Sizes are real metres; +y is up, +z is south.

/* ---------------- textures ---------------- */
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

const speckle = (g, w, h, n, alpha) => {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '40,40,40'},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
};

const roofTex = (base) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    const grad = g.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.26)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.2)'); grad.addColorStop(1, 'rgba(0,0,0,0.26)');
    g.fillStyle = grad; g.fillRect(x, 0, 16, h);
  }
  speckle(g, w, h, 240, 0.08);
}, 4, 2);

const plasterTex = (base) => canvasTex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, 0.05); }, 2, 2);
const concreteTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c9ccc9'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, 0.09);
  g.strokeStyle = 'rgba(70,70,70,0.13)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i += 1) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
}, 4, 4);
const grassTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6f9e4c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i += 1) {
    g.fillStyle = ['#5d8a3f', '#7fb058', '#89b863', '#4f7a35'][i % 4];
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
  }
}, 8, 8);
const stoneTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#8d8a80'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) {
    for (let x = (y / 32) % 2 ? -24 : 0; x < w; x += 48) {
      g.fillStyle = ['#a29e92', '#b3aea1', '#969284', '#a8a498'][Math.floor(Math.random() * 4)];
      g.fillRect(x + 2, y + 2, 44, 28);
    }
  }
}, 2, 1);
const solarTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#10234f'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(190,210,255,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  const s = g.createLinearGradient(0, 0, w, h);
  s.addColorStop(0, 'rgba(120,170,255,0.3)'); s.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = s; g.fillRect(0, 0, w, h);
});
const signTex = (text, bg, fg, sub) => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = sub ? 50 : 62;
  do { g.font = `700 ${size}px Sora, Arial, sans-serif`; size -= 2; } while (g.measureText(text).width > w - 28 && size > 16);
  g.fillText(text, w / 2, sub ? 46 : h / 2);
  if (sub) {
    size = 30;
    do { g.font = `500 ${size}px Inter, Arial, sans-serif`; size -= 2; } while (g.measureText(sub).width > w - 28 && size > 12);
    g.fillText(sub, w / 2, 96);
  }
});

/* ---------------- shared materials, made once ---------------- */
let M = null;
function materials() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02, ...o });
  M = {
    roofBlue: std({ map: roofTex('#2f6be7'), roughness: 0.45, metalness: 0.35 }),
    roofRed: std({ map: roofTex('#b5442f'), roughness: 0.5, metalness: 0.3 }),
    roofTin: std({ map: roofTex('#9aa4ad'), roughness: 0.5, metalness: 0.5 }),
    wall: std({ map: plasterTex('#f4f1e8') }),
    wallBlue: std({ map: plasterTex('#dbe7f7') }),
    wallYellow: std({ map: plasterTex('#f2d58a') }),
    wallGreen: std({ map: plasterTex('#cfe5cf') }),
    concrete: std({ map: concreteTex(), roughness: 0.92 }),
    stone: std({ map: stoneTex(), roughness: 0.95 }),
    grass: std({ map: grassTex(), roughness: 1 }),
    soil: std({ color: '#8e7354', roughness: 1 }),
    solar: std({ map: solarTex(), roughness: 0.22, metalness: 0.65 }),
    steel: std({ color: '#b9c2cc', roughness: 0.32, metalness: 0.85 }),
    darkSteel: std({ color: '#4b5462', roughness: 0.45, metalness: 0.7 }),
    pipe: std({ color: '#e8ecf2', roughness: 0.4 }),
    pipeBlue: std({ color: '#2d71d8', roughness: 0.4 }),
    tank: std({ color: '#2f7fe0', roughness: 0.36 }),
    tankWhite: std({ color: '#eef2f6', roughness: 0.4 }),
    wood: std({ color: '#8d6541', roughness: 0.8 }),
    trim: std({ color: '#ffffff', roughness: 0.5 }),
    door: std({ color: '#2a4c86', roughness: 0.5 }),
    glass: std({ color: '#7fb4d8', roughness: 0.12, metalness: 0.75, emissive: '#ffd27a', emissiveIntensity: 0 }),
    rubber: std({ color: '#1d2026', roughness: 0.92 }),
    white: std({ color: '#f7f8fa', roughness: 0.32, metalness: 0.2 }),
    red: std({ color: '#d4322b', roughness: 0.4 }),
    water: std({ color: '#5cb6ee', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.86 }),
    trunk: std({ color: '#7d6246', roughness: 0.95 }),
    palm: std({ color: '#4d9440', roughness: 0.7, side: THREE.DoubleSide }),
    leaf: std({ color: '#3f8a45', roughness: 0.82 }),
    leaf2: std({ color: '#5aa84e', roughness: 0.82 }),
    rock: std({ color: '#7d7c76', roughness: 0.95 }),
    pig: std({ color: '#e6b3a7', roughness: 0.7 }),
  };
  return M;
}

const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cylinder = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Prism roof with overhang, plus fascia boards. */
function roof(parent, w, d, h, y, material, m) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.lineTo(w / 2, -0.08); s.lineTo(0, h - 0.08); s.lineTo(-w / 2, -0.08); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, UVGenerator: undefined });
  g.translate(0, y, -d / 2);
  const r = add(parent, g, material);
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2 + 0.3, 0); tri.lineTo(0, h - 0.1); tri.lineTo(w / 2 - 0.3, 0); tri.closePath();
  const gab = new THREE.ExtrudeGeometry(tri, { depth: d - 0.9, bevelEnabled: false });
  gab.translate(0, y - 0.02, -(d - 0.9) / 2);
  add(parent, gab, m.wall);
  return r;
}

function windowUnit(parent, x, y, z, w, h, rotY, m) {
  const g = new THREE.Group();
  add(g, rbox(w + 0.14, h + 0.14, 0.08, 0.02), m.trim);
  add(g, new THREE.BoxGeometry(w, h, 0.05), m.glass, 0, 0, 0.03);
  add(g, new THREE.BoxGeometry(0.035, h, 0.07), m.trim, 0, 0, 0.04);
  add(g, new THREE.BoxGeometry(w, 0.035, 0.07), m.trim, 0, 0, 0.04);
  add(g, rbox(w + 0.26, 0.05, 0.16, 0.015), m.trim, 0, -h / 2 - 0.07, 0.06);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
}

function door(parent, x, z, rotY, m, h = 2.1) {
  const g = new THREE.Group();
  add(g, rbox(1.1, h + 0.1, 0.08, 0.02), m.trim, 0, h / 2, 0);
  add(g, new THREE.BoxGeometry(0.94, h - 0.06, 0.07), m.door, 0, h / 2, 0.03);
  add(g, new THREE.SphereGeometry(0.04, 10, 8), m.steel, 0.36, 1, 0.09);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
}

/** Walls with windows along the long sides. */
function building(parent, w, d, h, wall, roofMat, m, { x = 0, z = 0, base = 0, winFront = 3, winBack = 3 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, base, z);
  add(g, rbox(w + 0.3, 0.3, d + 0.3, 0.03), m.concrete, 0, 0.15, 0);
  add(g, rbox(w, h, d, 0.04), wall, 0, 0.3 + h / 2, 0);
  add(g, new THREE.BoxGeometry(w + 0.02, 0.1, d + 0.02), m.trim, 0, 0.3 + h - 0.05, 0);
  for (let i = 0; i < winFront; i += 1) windowUnit(g, -w / 2 + (w / (winFront + 1)) * (i + 1), 0.3 + h * 0.56, d / 2 + 0.03, 0.95, 1.05, 0, m);
  for (let i = 0; i < winBack; i += 1) windowUnit(g, -w / 2 + (w / (winBack + 1)) * (i + 1), 0.3 + h * 0.56, -d / 2 - 0.03, 0.95, 1.05, Math.PI, m);
  if (roofMat) roof(g, w + 1, d + 1, Math.min(w, d) * 0.22, 0.3 + h, roofMat, m);
  parent.add(g);
  return g;
}

/** Typical ribbed blue polyethylene water tank. */
function polyTank(parent, r, h, x, y, z, material) {
  const pts = [];
  for (let i = 0; i <= 28; i += 1) {
    const f = i / 28;
    const rib = 1 + 0.018 * Math.sin(f * Math.PI * 12);
    pts.push(new THREE.Vector2(r * rib * (f > 0.86 ? Math.cos(((f - 0.86) / 0.14) * 1.25) : 1), f * h));
  }
  const t = add(parent, new THREE.LatheGeometry(pts, 36), material, x, y, z);
  add(parent, cylinder(r * 0.26, r * 0.28, 0.14), material, x, y + h + 0.05, z);
  return t;
}

function ladder(parent, x, y, z, h, rotY, m) {
  const g = new THREE.Group();
  for (const s of [-0.22, 0.22]) add(g, cylinder(0.022, 0.022, h, 8), m.steel, s, h / 2, 0);
  for (let v = 0.3; v < h; v += 0.32) { const r = add(g, cylinder(0.016, 0.016, 0.44, 6), m.steel, 0, v, 0); r.rotation.z = Math.PI / 2; }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
}

function pipeRun(parent, pts, r, material) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.05);
  return add(parent, new THREE.TubeGeometry(c, 40, r, 10), material);
}

function signBoard(parent, text, sub, x, y, z, w, bg, fg, rotY = 0) {
  const g = new THREE.Group();
  const tex = signTex(text, bg, fg, sub);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  add(g, new THREE.BoxGeometry(w, w / 4, 0.05), mat);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
}

/* ---------------- plants ---------------- */
function coconut(parent, x, z, h = 8, lean = 0.6) {
  const m = materials();
  const g = new THREE.Group();
  const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.1, h * 0.6, 0), new THREE.Vector3(lean, h, 0.2));
  add(g, new THREE.TubeGeometry(c, 14, 0.16, 9), m.trunk);
  const top = new THREE.Vector3(lean, h, 0.2);
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2;
    const len = 3.1 + (i % 3) * 0.4;
    const pos = [];
    const idx = [];
    const steps = 9;
    for (let k = 0; k <= steps; k += 1) {
      const f = k / steps;
      const out = f * len;
      const y = 0.55 * Math.sin(f * 1.5) - 1.5 * f * f;
      const wv = 0.34 * Math.sin(f * Math.PI) + 0.02;
      const [px, pz] = [Math.cos(a) * out, Math.sin(a) * out];
      const [sx, sz] = [-Math.sin(a) * wv, Math.cos(a) * wv];
      pos.push(px + sx, y - 0.05, pz + sz, px, y + 0.06, pz, px - sx, y - 0.05, pz - sz);
      if (k < steps) { const b = k * 3; idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    add(g, fg, m.palm, top.x, top.y, top.z);
  }
  for (let i = 0; i < 3; i += 1) add(g, new THREE.SphereGeometry(0.16, 12, 10), m.trunk, top.x + Math.cos(i * 2) * 0.22, top.y - 0.25, top.z + Math.sin(i * 2) * 0.22);
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

function broadTree(parent, x, z, s = 1) {
  const m = materials();
  const g = new THREE.Group();
  add(g, cylinder(0.14, 0.26, 2.6, 10), m.trunk, 0, 1.3, 0);
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4;
    const r = 0.8 + (i % 3) * 0.32;
    const b = add(g, new THREE.SphereGeometry(1.15 + (i % 2) * 0.35, 18, 14), i % 2 ? m.leaf : m.leaf2, Math.cos(a) * r, 3.1 + (i % 4) * 0.42, Math.sin(a) * r);
    b.scale.y = 0.82;
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  parent.add(g);
}

function rocks(parent, list) {
  const m = materials();
  for (const [x, z, r] of list) { const k = add(parent, new THREE.DodecahedronGeometry(r, 1), m.rock, x, r * 0.45, z); k.rotation.set(x, z, r); k.scale.y = 0.7; }
}

/* ---------------- people ---------------- */
const SKIN = ['#c8905f', '#b77c4c', '#a56a41', '#d4a177', '#bb8152'];
const limbGeo = (len, r) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14); g.translate(0, -len / 2, 0); return g; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...o });

/** A jointed figure about 1.65 m tall. mode: walk, idle, fill, work, play. */
export function person({ shirt = '#3f7fd6', pants = '#2e3a4f', hair = '#1c1612', skin, shorts = false, long = false, hat = null, carry = null, mode = 'idle', scale = 1, path = null, speed = 1.15 } = {}) {
  const sk = std(skin ?? SKIN[Math.floor(Math.random() * SKIN.length)], { roughness: 0.55 });
  const sh = std(shirt);
  const pa = std(pants);
  const ha = std(hair, { roughness: 0.5 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const pelvis = add(body, new THREE.SphereGeometry(0.15, 18, 14), pa, 0, 0.9, 0);
  pelvis.scale.set(1.08, 0.72, 0.8);
  const torso = add(body, new THREE.CapsuleGeometry(0.155, 0.3, 8, 18), sh, 0, 1.17, 0);
  torso.scale.set(1.08, 1, 0.68);
  const collar = add(body, new THREE.TorusGeometry(0.06, 0.018, 8, 16), sh, 0, 1.41, 0);
  collar.rotation.x = Math.PI / 2;
  add(body, cylinder(0.046, 0.054, 0.1, 12), sk, 0, 1.45, 0);

  const head = new THREE.Group();
  head.position.set(0, 1.56, 0.005);
  body.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.1, 24, 20), sk);
  skull.scale.set(0.92, 1.12, 0.98);
  const eye = new THREE.SphereGeometry(0.0135, 10, 8);
  const white = std('#f6f6f2');
  const pupil = std('#20150f');
  for (const s of [-0.036, 0.036]) {
    add(head, eye, white, s, 0.012, 0.09);
    add(head, new THREE.SphereGeometry(0.0078, 8, 6), pupil, s, 0.012, 0.102);
    const brow = add(head, new THREE.CapsuleGeometry(0.0045, 0.024, 3, 6), ha, s, 0.04, 0.094);
    brow.rotation.z = Math.PI / 2;
    add(head, new THREE.SphereGeometry(0.02, 8, 8), sk, s * 2.5, 0, 0);
  }
  const nose = add(head, new THREE.ConeGeometry(0.0145, 0.04, 8), sk, 0, -0.012, 0.102);
  nose.rotation.x = 0.35;
  const mouth = add(head, new THREE.CapsuleGeometry(0.004, 0.03, 3, 6), std('#8c4a3e'), 0, -0.052, 0.09);
  mouth.rotation.z = Math.PI / 2;
  const cap = add(head, new THREE.SphereGeometry(0.106, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), ha, 0, 0.02, -0.006);
  cap.scale.set(0.96, 1.14, 1.02);
  if (long) { const l = add(head, new THREE.CapsuleGeometry(0.08, 0.18, 6, 12), ha, 0, -0.12, -0.05); l.scale.z = 0.62; }
  if (hat === 'hard') {
    const hm = std('#f6c32c', { roughness: 0.3 });
    add(head, new THREE.SphereGeometry(0.114, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.042, 0);
    add(head, cylinder(0.125, 0.125, 0.012, 22), hm, 0, 0.044, 0.012);
  } else if (hat === 'farmer') {
    const hm = std('#d9bd7f');
    add(head, new THREE.ConeGeometry(0.28, 0.12, 24), hm, 0, 0.13, 0);
  } else if (hat === 'cap') {
    const hm = std(shirt);
    add(head, new THREE.SphereGeometry(0.109, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.04, 0);
    const v = add(head, cylinder(0.06, 0.07, 0.012, 16), hm, 0, 0.05, 0.1);
    v.scale.z = 1.3;
  }

  const joints = {};
  const arm = (side) => {
    const sp = new THREE.Group();
    sp.position.set(side * 0.2, 1.36, 0);
    add(sp, new THREE.SphereGeometry(0.058, 14, 12), sh);
    add(sp, limbGeo(0.28, 0.048), shorts ? sk : sh);
    const el = new THREE.Group();
    el.position.y = -0.27;
    add(el, limbGeo(0.25, 0.04), sk);
    const hand = add(el, new THREE.SphereGeometry(0.044, 12, 10), sk, 0, -0.26, 0);
    hand.scale.set(0.8, 1.2, 0.6);
    sp.add(el);
    body.add(sp);
    return { sp, el };
  };
  const leg = (side) => {
    const hp = new THREE.Group();
    hp.position.set(side * 0.09, 0.88, 0);
    add(hp, limbGeo(0.42, 0.072), pa);
    const kn = new THREE.Group();
    kn.position.y = -0.41;
    add(kn, limbGeo(0.41, 0.054), shorts ? sk : pa);
    add(kn, rbox(0.1, 0.06, 0.25, 0.03), std(shorts ? '#3a6bc4' : '#2a2a30'), 0, -0.42, 0.05);
    hp.add(kn);
    body.add(hp);
    return { hp, kn };
  };
  joints.la = arm(-1); joints.ra = arm(1);
  joints.ll = leg(-1); joints.rl = leg(1);

  if (carry === 'can') {
    const c = new THREE.Group();
    const jm = std('#2b6fd0', { roughness: 0.35 });
    add(c, rbox(0.2, 0.3, 0.13, 0.03), jm, 0, -0.18, 0);
    add(c, cylinder(0.03, 0.03, 0.05, 10), std('#f2d24a'), 0.05, -0.01, 0);
    const hdl = add(c, new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), jm, -0.03, -0.03, 0);
    hdl.rotation.z = 0;
    c.position.y = -0.27;
    joints.ra.el.add(c);
  } else if (carry === 'clipboard') {
    const c = add(joints.la.el, rbox(0.2, 0.28, 0.015, 0.006), std('#f7f4ea'), 0.1, -0.2, 0.08);
    c.rotation.x = -0.5;
  } else if (carry === 'pack') {
    add(body, rbox(0.3, 0.42, 0.14, 0.05), std('#c9473a'), 0, 1.16, -0.15);
  }

  const u = g.userData;
  Object.assign(u, { joints, body, head, mode, path, speed, leg: 0, phase: Math.random() * 9, seg: 0, pos: 0 });
  g.scale.setScalar(scale);
  return g;
}

/** Move one figure for this frame. */
export function animatePerson(p, t, dt) {
  const u = p.userData;
  const { la, ra, ll, rl } = u.joints;
  const time = t + u.phase;
  if (u.path) {
    const a = u.path[u.seg];
    const b = u.path[(u.seg + 1) % u.path.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    u.pos += (u.speed * dt) / len;
    if (u.pos >= 1) { u.pos = 0; u.seg = (u.seg + 1) % u.path.length; }
    p.position.x = a[0] + (b[0] - a[0]) * u.pos;
    p.position.z = a[1] + (b[1] - a[1]) * u.pos;
    p.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
  if (u.mode === 'walk' || u.mode === 'play') {
    const w = time * (u.mode === 'play' ? 9.5 : 6.6);
    const s = Math.sin(w);
    const amp = u.mode === 'play' ? 0.78 : 0.52;
    ll.hp.rotation.x = s * amp;
    rl.hp.rotation.x = -s * amp;
    ll.kn.rotation.x = Math.max(0, -Math.cos(w)) * 0.9 + 0.08;
    rl.kn.rotation.x = Math.max(0, Math.cos(w)) * 0.9 + 0.08;
    la.sp.rotation.x = -s * amp * 0.75;
    ra.sp.rotation.x = s * amp * 0.75 * (u.carrying ? 0.15 : 1);
    la.el.rotation.x = -0.32;
    ra.el.rotation.x = -0.32;
    u.body.position.y = Math.abs(Math.cos(w)) * 0.03;
  } else if (u.mode === 'fill') {
    const k = 0.5 + 0.5 * Math.sin(time * 0.8);
    u.body.rotation.x = 0.22 + k * 0.2;
    ra.sp.rotation.x = -0.75 - k * 0.2;
    la.sp.rotation.x = -0.5;
    ra.el.rotation.x = -0.25;
    ll.kn.rotation.x = 0.28; rl.kn.rotation.x = 0.28;
    ll.hp.rotation.x = -0.25; rl.hp.rotation.x = -0.25;
  } else if (u.mode === 'work') {
    const k = Math.sin(time * 2.3);
    ra.sp.rotation.x = -1.15 + k * 0.28;
    ra.el.rotation.x = -0.8 + k * 0.25;
    la.sp.rotation.x = -0.75;
    la.el.rotation.x = -0.65;
    u.head.rotation.x = 0.28;
  } else {
    const k = Math.sin(time * 0.9);
    u.body.position.y = 0.004 * k;
    la.sp.rotation.x = 0.05 * k; ra.sp.rotation.x = -0.05 * k;
    la.sp.rotation.z = -0.06; ra.sp.rotation.z = 0.06;
    la.el.rotation.x = -0.12; ra.el.rotation.x = -0.12;
    u.head.rotation.y = Math.sin(time * 0.33) * 0.42;
  }
}

/* ---------------- facilities ---------------- */
const REST = ['#3f7fd6', '#d9534f', '#3fa676', '#f0b429', '#8a63d2', '#e87ba4', '#f2f2f2', '#2c8a99'];
const pick = (i) => REST[i % REST.length];

function pad(g, r, m) {
  const c = add(g, new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2), m.grass, 0, 0.02, 0);
  return c;
}

function valveWheel(g, x, y, z, m) {
  const mat = new THREE.MeshStandardMaterial({ color: '#22a35a', roughness: 0.35, emissive: '#22a35a', emissiveIntensity: 0.4 });
  add(g, cylinder(0.05, 0.05, 0.45, 12), m.steel, x, y + 0.22, z);
  const w = add(g, new THREE.TorusGeometry(0.2, 0.035, 10, 24), mat, x, y + 0.48, z);
  w.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i += 1) { const s = add(g, cylinder(0.014, 0.014, 0.38, 6), mat, x, y + 0.48, z); s.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 3); }
  return mat;
}

function kiosk(ctx) {
  const { g, m, people } = ctx;
  add(g, new THREE.CircleGeometry(15, 56).rotateX(-Math.PI / 2), m.concrete, 0, 0.03, 2);
  building(g, 9, 5.5, 3, m.wall, m.roofBlue, m, { winFront: 0, winBack: 3 });
  add(g, rbox(3.4, 1.15, 0.1, 0.02), m.glass, -1.8, 2.05, 2.8);
  add(g, rbox(3.7, 0.12, 0.7, 0.03), m.steel, -1.8, 1.4, 3.05);
  door(g, 2.5, 2.79, 0, m);
  signBoard(g, 'BULOS WATER KIOSK', 'Safe water · Barangay Council', 0, 3.62, 3.05, 6.4, '#2f5be7', '#ffffff');
  const awning = add(g, rbox(9.5, 0.08, 2.2, 0.03), m.roofTin, 0, 3.15, 3.9);
  awning.rotation.x = 0.16;
  for (const x of [-4.4, 4.4]) add(g, cylinder(0.06, 0.06, 3, 10), m.steel, x, 1.5, 4.9);
  // Tank on a stand
  for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) add(g, cylinder(0.07, 0.08, 3, 10), m.steel, -8 + x, 1.5, -1 + z);
  add(g, rbox(2.9, 0.16, 2.9, 0.03), m.darkSteel, -8, 3.05, -1);
  for (const s of [-1, 1]) { const b = add(g, cylinder(0.025, 0.025, 3.5, 6), m.steel, -8, 1.5, -1 + s * 1.1); b.rotation.z = 0.68 * s; }
  polyTank(g, 1.25, 2.6, -8, 3.13, -1, m.tank);
  ladder(g, -6.65, 0, -1, 3.1, Math.PI / 2, m);
  pipeRun(g, [[-8, 3.1, -1], [-8, 0.4, 0.5], [-5, 0.4, 2], [0, 0.65, 6.5], [4, 0.65, 6.5]], 0.05, m.pipeBlue);
  // Filter skid
  for (let i = 0; i < 3; i += 1) add(g, cylinder(0.16, 0.16, 1.1, 18), m.tankWhite, -6.4 + i * 0.42, 0.65, 2.6);
  // Tap stand with water running
  add(g, rbox(6, 0.75, 0.5, 0.05), m.concrete, 2, 0.38, 6.5);
  ctx.taps = [];
  for (let i = 0; i < 4; i += 1) {
    const x = -0.2 + i * 1.45;
    add(g, cylinder(0.03, 0.03, 0.34, 8), m.steel, x, 0.92, 6.5);
    const nz = add(g, cylinder(0.022, 0.022, 0.2, 8), m.steel, x, 1.07, 6.61);
    nz.rotation.x = Math.PI / 2;
    const stream = add(g, cylinder(0.018, 0.012, 0.65, 8), m.water, x, 0.72, 6.72);
    ctx.taps.push(stream);
  }
  add(g, rbox(6.4, 0.08, 1.2, 0.02), m.concrete, 2, 0.05, 7.2);
  ctx.valve = valveWheel(g, -4.2, 0.1, 5.2, m);
  sensorNode(ctx, 7.2, 1.2);
  // Bench
  add(g, rbox(2.4, 0.08, 0.5, 0.02), m.wood, 6.2, 0.5, 6.6);
  for (const x of [5.2, 7.2]) add(g, rbox(0.08, 0.46, 0.45, 0.01), m.darkSteel, x, 0.24, 6.6);
  // People: a queue with jerrycans, and two at the taps
  for (let i = 0; i < 6; i += 1) {
    const p = person({ shirt: pick(i), pants: i % 2 ? '#2e3a4f' : '#6a5a48', shorts: i % 3 === 0, long: i % 2 === 1, carry: 'can', hair: i % 4 === 0 ? '#3b2a20' : '#17120f' });
    p.position.set(-0.3 + (i % 2) * 1.5, 0.03, 8.1 + Math.floor(i / 2) * 1);
    p.rotation.y = Math.PI;
    people.push(p); g.add(p);
  }
  const f1 = person({ shirt: '#e87ba4', long: true, carry: 'can', mode: 'fill' });
  f1.position.set(1.25, 0.03, 7.25); f1.rotation.y = Math.PI; people.push(f1); g.add(f1);
  const f2 = person({ shirt: '#3fa676', shorts: true, hat: 'cap', carry: 'can', mode: 'fill' });
  f2.position.set(2.7, 0.03, 7.25); f2.rotation.y = Math.PI; people.push(f2); g.add(f2);
  const w1 = person({ shirt: '#f0b429', carry: 'can', mode: 'walk', path: [[10, 8], [-10, 12], [-14, 3], [10, 8]] });
  const w2 = person({ shirt: '#8a63d2', long: true, carry: 'can', mode: 'walk', path: [[-10, 10], [12, 11], [11, -3], [-10, 10]], speed: 1.0 });
  people.push(w1, w2); g.add(w1, w2);
  const kids = person({ shirt: '#ffffff', shorts: true, scale: 0.72, mode: 'play', path: [[9, 2], [12, 6], [8, 9], [9, 2]], speed: 2 });
  people.push(kids); g.add(kids);
  for (const [x, z, h] of [[-13, -6, 9], [13, -6, 8], [15, 5, 10], [-15, 7, 8.5]]) coconut(g, x, z, h, 0.7);
  broadTree(g, 12, -11, 1.1);
  broadTree(g, -5, -10, 0.9);
}

function springBox(ctx) {
  const { g, m, people } = ctx;
  add(g, rbox(7, 1.9, 5, 0.08), m.stone, 0, 0.95, 0);
  add(g, rbox(7.5, 0.24, 5.5, 0.05), m.concrete, 0, 2, 0);
  add(g, rbox(1.3, 0.14, 1.3, 0.03), m.darkSteel, 1.6, 2.2, -0.6);
  add(g, cylinder(0.1, 0.1, 1, 12), m.pipe, -2.2, 2.5, 1);
  signBoard(g, 'IN-01 SPRING INTAKE', 'Protected source', 0, 1.25, 2.53, 3.4, '#f7f7f2', '#20335e');
  pipeRun(g, [[3.5, 0.6, 1], [7, 0.5, 2], [13, 0.45, 8]], 0.08, m.pipeBlue);
  const pool = add(g, new THREE.CircleGeometry(3, 40).rotateX(-Math.PI / 2), m.water, -5.8, 0.05, 2);
  pool.scale.set(1, 1, 0.7);
  rocks(g, [[-8.6, 1, 1.1], [-8.4, 3.4, 0.8], [-6, -1, 1.2], [-3.4, 3.8, 0.7], [8, -3.2, 1.3], [6.5, 4.6, 0.8], [-9.6, -2.2, 1.5]]);
  sensorNode(ctx, 6.4, -3.4);
  ctx.valve = valveWheel(g, 4.4, 0.04, 2.6, m);
  const t = person({ shirt: '#f28c28', pants: '#37424f', hat: 'hard', mode: 'work' });
  t.position.set(4.3, 0.03, 3.3); t.rotation.y = Math.PI; people.push(t); g.add(t);
  const w = person({ shirt: '#3f7fd6', hat: 'farmer', carry: 'pack', mode: 'walk', path: [[-12, 8], [10, 10], [11, -6], [-12, 8]] });
  people.push(w); g.add(w);
  for (const [x, z, s] of [[-12, -6, 1.3], [-6, -9, 1.1], [3, -10, 1.4], [11, -8, 1.2], [14, 2, 1], [-14, 4, 1.1]]) broadTree(g, x, z, s);
}

/** The sensor bank at a water point: probes in a flow-through tray, with a live screen. */
const PROBES = [['TURB', '#f0872e'], ['pH', '#34b36b'], ['ORP', '#8a63d2'], ['TDS', '#2f7fe0'], ['TEMP', '#d9483b']];

function sensorNode(ctx, x, z, withBio = false) {
  const { g, m } = ctx;
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  s.scale.setScalar(1.7);
  add(s, rbox(3.1, 0.16, 1.9, 0.03), m.concrete, 0, 0.08, 0);
  // Cabinet with a live screen
  add(s, rbox(0.95, 1.45, 0.42, 0.04), m.steel, -0.95, 0.9, -0.5);
  add(s, rbox(0.82, 0.08, 0.5, 0.02), m.darkSteel, -0.95, 1.66, -0.5);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 200;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  add(s, new THREE.PlaneGeometry(0.76, 0.6), new THREE.MeshBasicMaterial({ map: tex }), -0.95, 1.12, -0.285);
  ctx.display = { c, tex };
  for (let i = 0; i < 3; i += 1) add(s, new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: ['#35e06a', '#35e06a', '#ffc533'][i] }), -1.22 + i * 0.07, 0.72, -0.285);
  // Tray with sample water flowing through it
  add(s, rbox(2, 0.2, 0.56, 0.02), m.steel, 0.5, 0.62, 0.3);
  add(s, new THREE.BoxGeometry(1.86, 0.02, 0.42), m.water, 0.5, 0.72, 0.3);
  for (const px of [-0.35, 1.35]) add(s, cylinder(0.03, 0.03, 0.55, 8), m.steel, px, 0.3, 0.3);
  // Rail with one probe per measurement
  const rail = add(s, cylinder(0.022, 0.022, 2.1, 8), m.darkSteel, 0.5, 1.25, 0.3);
  rail.rotation.z = Math.PI / 2;
  for (const px of [-0.5, 1.5]) add(s, cylinder(0.02, 0.02, 0.6, 8), m.darkSteel, px, 0.97, 0.3);
  const list = withBio ? [...PROBES, ['TLF', '#f6c32c']] : PROBES;
  list.forEach(([name, color], i) => {
    const px = -0.3 + (1.6 / (list.length - 1)) * i;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: name === 'TLF' ? 0.6 : 0.15 });
    add(s, cylinder(0.024, 0.024, 0.46, 12), m.steel, px, 0.92, 0.3);
    add(s, cylinder(0.042, 0.042, 0.13, 14), mat, px, 1.19, 0.3);
    add(s, cylinder(0.008, 0.008, 0.34, 6), m.rubber, px, 1.4, 0.2).rotation.x = -0.4;
    const tag = new THREE.MeshBasicMaterial({ map: signTex(name, color, '#ffffff'), transparent: false });
    add(s, new THREE.PlaneGeometry(0.34, 0.085), tag, px, 1.42, 0.34);
  });
  // Pump, sample tube, power and telemetry
  add(s, rbox(0.4, 0.3, 0.3, 0.04), m.pipeBlue, 1.3, 0.3, -0.5);
  pipeRun(s, [[1.3, 0.3, -0.35], [1.5, 0.5, 0.05], [1.2, 0.76, 0.3]], 0.016, m.rubber);
  pipeRun(s, [[1.3, 0.2, -0.65], [2.6, 0.1, -0.9], [5.5, 0.06, -1]], 0.022, m.rubber);
  add(s, cylinder(0.05, 0.06, 3.6, 10), m.steel, -1.45, 1.8, -0.75);
  const panel = add(s, rbox(1.3, 0.04, 0.85, 0.01), m.solar, -1.45, 3.45, -0.5);
  panel.rotation.x = 0.5;
  add(s, cylinder(0.012, 0.012, 1.1, 6), m.darkSteel, -1.2, 4, -0.75);
  add(s, new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b30' }), -1.2, 4.56, -0.75);
  const tech = add(s, rbox(0.5, 0.05, 0.3, 0.01), m.pipeBlue, 0.5, 0.25, -0.5);
  tech.visible = false;
  g.add(s);
  ctx.sensorAt = [x, z];
}

/** Redraw the screen on a sensor bank. */
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

/** A pumping station of the real water district, placed at its mapped location. */
function pumpStation(ctx) {
  const { g, m } = ctx;
  add(g, new THREE.CircleGeometry(9, 40).rotateX(-Math.PI / 2), m.concrete, 0, 0.03, 0);
  building(g, 6, 4.4, 2.8, m.wallBlue, m.roofBlue, m, { winFront: 2, winBack: 1 });
  door(g, 0, 2.23, 0, m);
  polyTank(g, 1.3, 3.1, -5.2, 0.1, -0.5, m.tank);
  add(g, cylinder(0.45, 0.55, 0.5, 18), m.concrete, 4.6, 0.25, 2.2);
  add(g, rbox(1, 0.6, 0.7, 0.05), m.pipeBlue, 4.6, 0.8, 2.2);
  pipeRun(g, [[3.2, 0.5, 1.8], [1.5, 0.5, 2.8], [-4, 0.5, 2], [-5.2, 0.5, 0.6]], 0.08, m.pipeBlue);
  fence(g, [[-8, -5], [8, -5], [8, 6], [-8, 6], [-8, -5]], m);
}

/** An elevated water tower, placed at its mapped location. */
function waterTower(ctx) {
  const { g, m } = ctx;
  add(g, new THREE.CircleGeometry(6, 36).rotateX(-Math.PI / 2), m.concrete, 0, 0.03, 0);
  const H = 12;
  for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) add(g, cylinder(0.12, 0.17, H, 10), m.steel, x, H / 2, z);
  for (const y of [3, 6, 9]) for (const [dx, dz, ry] of [[0, -1.8, 0], [0, 1.8, 0], [-1.8, 0, Math.PI / 2], [1.8, 0, Math.PI / 2]]) {
    const b = add(g, cylinder(0.04, 0.04, 3.6, 8), m.steel, dx, y, dz);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = ry;
  }
  add(g, cylinder(2.7, 2.7, 3.6, 30), m.tankWhite, 0, H + 1.8, 0);
  add(g, new THREE.ConeGeometry(2.8, 0.9, 30), m.tank, 0, H + 4.05, 0);
  add(g, cylinder(0.11, 0.11, H, 10), m.pipeBlue, 0, H / 2, 0);
  ladder(g, 2.1, 0, 0, H + 3.6, Math.PI / 2, m);
}

/** Chain-link fence along a closed list of corner points. */
function fence(g, pts, m) {
  m.chain ??= new THREE.MeshStandardMaterial({
    map: canvasTex(64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#aeb6bf'; c.lineWidth = 2.4;
      for (let i = -64; i < 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 64, 64); c.moveTo(i + 64, 0); c.lineTo(i, 64); c.stroke(); }
    }), alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5,
  });
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [a, b] = [pts[i], pts[i + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const panel = add(g, new THREE.PlaneGeometry(len, 1.8), m.chain.clone(), (a[0] + b[0]) / 2, 0.95, (a[1] + b[1]) / 2);
    panel.material.map = m.chain.map.clone();
    panel.material.map.repeat.set(len / 0.6, 3);
    panel.material.map.needsUpdate = true;
    panel.rotation.y = ang;
    const rail = add(g, cylinder(0.022, 0.022, len, 8), m.steel, (a[0] + b[0]) / 2, 1.86, (a[1] + b[1]) / 2);
    rail.rotation.set(0, ang, Math.PI / 2);
    for (let d = 0; d <= len; d += 2.4) add(g, cylinder(0.03, 0.03, 1.95, 8), m.steel, a[0] + ((b[0] - a[0]) * d) / len, 0.97, a[1] + ((b[1] - a[1]) * d) / len);
  }
}

/** Cup anemometer and wind vane; the cups turn. */
function anemometer(ctx, x, y, z) {
  const { g, m } = ctx;
  add(g, cylinder(0.02, 0.02, 0.5, 8), m.darkSteel, x, y + 0.25, z);
  const head = new THREE.Group();
  head.position.set(x, y + 0.52, z);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const arm = add(head, cylinder(0.008, 0.008, 0.24, 6), m.darkSteel, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
    arm.rotation.set(0, -a, Math.PI / 2);
    add(head, new THREE.SphereGeometry(0.05, 12, 10, 0, Math.PI), m.white, Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24).rotation.y = -a;
  }
  g.add(head);
  ctx.spin.push(head);
}

/** Tipping-bucket rain gauge: funnel on a pedestal. */
function rainGaugeUnit(g, x, z, m) {
  add(g, rbox(0.7, 0.14, 0.7, 0.02), m.concrete, x, 0.1, z);
  add(g, cylinder(0.05, 0.07, 1, 12), m.steel, x, 0.65, z);
  add(g, cylinder(0.14, 0.14, 0.42, 24), m.white, x, 1.35, z);
  const funnel = new THREE.LatheGeometry([new THREE.Vector2(0.03, 0), new THREE.Vector2(0.14, 0.1), new THREE.Vector2(0.15, 0.14)], 24);
  add(g, funnel, m.darkSteel, x, 1.52, z);
}

function dataCabinet(g, x, z, m) {
  add(g, rbox(0.75, 0.16, 0.5, 0.02), m.concrete, x, 0.08, z);
  add(g, rbox(0.62, 1.15, 0.36, 0.04), m.tankWhite, x, 0.74, z);
  add(g, new THREE.BoxGeometry(0.5, 0.95, 0.02), m.wall2 ?? m.tankWhite, x, 0.74, z + 0.19);
  add(g, new THREE.SphereGeometry(0.018, 8, 6), m.steel, x + 0.2, 0.74, z + 0.21);
  ctxLed(g, x - 0.18, 1.14, z + 0.2);
}

function ctxLed(g, x, y, z) {
  add(g, new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: '#35e06a' }), x, y, z);
}

function staffGauge(g, x, z, h, m) {
  m.staff ??= new THREE.MeshStandardMaterial({
    map: canvasTex(64, 512, (c, w, hh) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, hh);
      for (let i = 0; i < 40; i += 1) {
        c.fillStyle = i % 10 === 0 ? '#c0281f' : '#14243f';
        if (i % 2 === 0) c.fillRect(0, i * 12.8, i % 10 === 0 ? w : w * 0.55, 6.4);
      }
    }), roughness: 0.5,
  });
  add(g, new THREE.BoxGeometry(0.2, h, 0.03), m.staff, x, h / 2, z);
  add(g, cylinder(0.04, 0.04, h + 0.5, 8), m.steel, x, h / 2, z - 0.05);
}

/** Hydromet station: the sentinel on the Naga River. */
function sentinel(ctx) {
  const { g, m, people } = ctx;
  add(g, new THREE.CircleGeometry(13, 56).rotateX(-Math.PI / 2), m.concrete, 0, 0.03, 0);
  fence(g, [[-11, -8], [10, -8], [10, 9], [1.2, 9]], m);
  fence(g, [[-1.8, 9], [-11, 9], [-11, -8]], m);
  for (const [x, r] of [[-0.9, 0.35], [0.5, -0.35]]) { const gate = add(g, new THREE.BoxGeometry(1.45, 1.75, 0.04), m.chain ?? m.steel, x - 0.2, 0.95, 9.3); gate.rotation.y = r; }

  building(g, 6, 4, 2.7, m.wallBlue, m.roofTin, m, { x: -4.6, z: -4, winFront: 1, winBack: 1 });
  door(g, -2.9, -1.77, 0, m);
  signBoard(g, 'HYDROMET STATION AG-02', 'River and water quality monitoring', -4.6, 2.72, -1.67, 4.2, '#10325f', '#ffffff');

  // Stilling well: a concrete tower connected to the river, with a shelter for the recorder
  add(g, cylinder(0.85, 0.95, 4.2, 28), m.concrete, 6, 2.1, 5.2);
  add(g, rbox(2.1, 1.3, 2.1, 0.05), m.wallBlue, 6, 4.85, 5.2);
  add(g, rbox(2.5, 0.12, 2.5, 0.03), m.roofTin, 6, 5.56, 5.2);
  ladder(g, 7, 0, 5.2, 4.3, Math.PI / 2, m);
  add(g, rbox(2.6, 0.08, 1, 0.02), m.steel, 7.2, 4.15, 5.2);
  staffGauge(g, 8.6, 7.9, 3.4, m);

  // Telemetry mast
  for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [0, 0.42]]) add(g, cylinder(0.03, 0.06, 11, 8), m.steel, 5.6 + x * 0.55, 5.5, -3.6 + z * 0.55);
  for (let y = 1; y < 11; y += 1) { const r = add(g, new THREE.TorusGeometry(0.34 - y * 0.012, 0.014, 6, 3), m.steel, 5.6, y, -3.6); r.rotation.x = Math.PI / 2; }
  const panel = add(g, new THREE.BoxGeometry(2.1, 0.06, 1.2), m.solar, 5.6, 8.6, -2.6);
  panel.rotation.x = 0.55;
  add(g, cylinder(0.05, 0.05, 1.4, 10), m.darkSteel, 5.6, 11.6, -3.6);
  const dish = add(g, new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), m.white, 5.6, 10.3, -3.1);
  dish.rotation.x = 2.1;
  ctx.beacon = add(g, new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff3b30' }), 5.6, 12.4, -3.6);
  anemometer(ctx, 5.6, 11.8, -3.6);

  // Instruments in the yard
  sensorNode(ctx, -5.6, 3, true);
  rainGaugeUnit(g, -1.6, 3.2, m);
  dataCabinet(g, 1.2, 1.2, m);
  dataCabinet(g, 2.4, 1.2, m);
  pipeRun(g, [[1.2, 0.1, 1.4], [4, 0.1, 3.2], [5.2, 0.1, 4.6]], 0.04, m.rubber);

  // Walkway out to the river, carrying the biological sonde
  add(g, rbox(1.4, 0.1, 9, 0.02), m.wood, -6.2, 0.85, 12.5);
  for (const z of [9, 12, 15]) for (const x of [-6.8, -5.6]) add(g, cylinder(0.05, 0.05, 1.5, 8), m.darkSteel, x, 0.2, z);
  for (const x of [-6.85, -5.55]) { const r = add(g, cylinder(0.018, 0.018, 9, 6), m.steel, x, 1.8, 12.5); r.rotation.x = Math.PI / 2; }
  for (const z of [8.4, 11, 13.6, 16.4]) for (const x of [-6.85, -5.55]) add(g, cylinder(0.018, 0.018, 0.95, 6), m.steel, x, 1.35, z);
  add(g, cylinder(0.014, 0.014, 1.2, 6), m.rubber, -6.2, 0.3, 16.6);
  add(g, rbox(0.3, 0.45, 0.3, 0.05), m.tankWhite, -6.2, 0, 16.6);

  const tech = person({ shirt: '#f28c28', pants: '#37424f', hat: 'hard', carry: 'clipboard', mode: 'work' });
  tech.position.set(-6.2, 0.9, 15.6); people.push(tech); g.add(tech);
  const t2 = person({ shirt: '#ffffff', pants: '#1f3a5f', long: true, carry: 'clipboard', mode: 'walk', path: [[-1, 5], [5, 7], [8, -1], [0, -1], [-1, 5]], speed: 0.9 });
  people.push(t2); g.add(t2);
  const t3 = person({ shirt: '#2c8a99', pants: '#37424f', hat: 'cap', mode: 'work' });
  t3.position.set(1.8, 0.03, 2.3); t3.rotation.y = Math.PI; people.push(t3); g.add(t3);
  for (const [x, z, s] of [[-16, -6, 1.2], [15, 6, 1.1], [14, -11, 1.3], [-15, 9, 1]]) broadTree(g, x, z, s);
  ctx.valve = null;
}

/** Automated rain gauge plot. */
function rainStation(ctx) {
  const { g, m } = ctx;
  add(g, new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), m.concrete, 0, 0.03, 0);
  fence(g, [[-5.5, -5.5], [5.5, -5.5], [5.5, 5.5], [-5.5, 5.5], [-5.5, -5.5]], m);
  rainGaugeUnit(g, -1.8, 1, m);
  rainGaugeUnit(g, 0.2, 2, m);
  dataCabinet(g, 2.4, 0.2, m);
  add(g, cylinder(0.05, 0.07, 6.5, 10), m.steel, 1.2, 3.25, -3);
  const p = add(g, new THREE.BoxGeometry(1.2, 0.05, 0.8), m.solar, 1.2, 5.3, -2.5);
  p.rotation.x = 0.5;
  anemometer(ctx, 1.2, 6.5, -3);
  signBoard(g, 'AUTOMATED RAIN GAUGE', 'Naga City', 0, 1.3, 5.6, 2.4, '#10325f', '#ffffff');
}

/** Break-pressure tank on the gravity line. */
function breakTank(ctx) {
  const { g, m } = ctx;
  add(g, rbox(3.2, 1.5, 2.4, 0.06), m.concrete, 0, 0.75, 0);
  add(g, rbox(0.9, 0.1, 0.9, 0.02), m.darkSteel, 0.5, 1.55, 0);
  add(g, cylinder(0.05, 0.05, 0.7, 10), m.pipe, -0.9, 1.85, 0.5);
  const hood = add(g, new THREE.TorusGeometry(0.1, 0.05, 8, 14, Math.PI), m.pipe, -0.8, 2.2, 0.5);
  hood.rotation.y = 0;
  pipeRun(g, [[-3.5, 0.5, 0], [-1.6, 0.5, 0]], 0.08, m.pipeBlue);
  pipeRun(g, [[1.6, 0.5, 0], [3.5, 0.5, 0]], 0.08, m.pipeBlue);
  signBoard(g, 'BREAK-PRESSURE TANK', '', 0, 1, 1.23, 1.9, '#f7f7f2', '#20335e');
}

/** Valve chamber on a pipeline. */
function valveChamber(ctx) {
  const { g, m } = ctx;
  add(g, rbox(2.2, 0.5, 2.2, 0.05), m.concrete, 0, 0.25, 0);
  add(g, rbox(1.2, 0.07, 1.2, 0.02), m.darkSteel, 0, 0.53, 0);
  add(g, cylinder(0.04, 0.04, 0.6, 8), m.steel, -0.7, 0.8, 0.7);
  const w = add(g, new THREE.TorusGeometry(0.17, 0.03, 8, 20), m.pipeBlue, -0.7, 1.1, 0.7);
  w.rotation.x = Math.PI / 2;
}

function solarWell(ctx) {
  const { g, m, people } = ctx;
  add(g, new THREE.CircleGeometry(13, 56).rotateX(-Math.PI / 2), m.soil, 0, 0.03, 0);
  // Panel rows
  for (let r = 0; r < 2; r += 1) {
    for (let i = 0; i < 5; i += 1) {
      const x = -9.4 + i * 2.05;
      const z = 5 + r * 3.2;
      const p = add(g, rbox(1.95, 0.05, 1.5, 0.012), m.solar, x, 1.45, z);
      p.rotation.x = 0.42;
      add(g, cylinder(0.035, 0.04, 1.2, 8), m.steel, x, 0.65, z + 0.42);
      add(g, cylinder(0.035, 0.04, 1.75, 8), m.steel, x, 0.9, z - 0.42);
    }
  }
  // Elevated tank on a braced tower
  const H = 7;
  for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) add(g, cylinder(0.08, 0.1, H, 10), m.steel, x + 3, H / 2, z - 2);
  for (const y of [2, 4.5]) for (const [dx, dz, ry] of [[0, -1.5, 0], [0, 1.5, 0], [-1.5, 0, Math.PI / 2], [1.5, 0, Math.PI / 2]]) {
    const b = add(g, cylinder(0.035, 0.035, 3, 8), m.steel, 3 + dx, y, -2 + dz);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = ry;
  }
  add(g, rbox(4, 0.2, 4, 0.04), m.darkSteel, 3, H + 0.1, -2);
  polyTank(g, 1.7, 3.2, 3, H + 0.2, -2, m.tankWhite);
  ladder(g, 4.8, 0, -2, H + 3.4, Math.PI / 2, m);
  for (let i = 0; i < 12; i += 1) { const a = (i / 12) * Math.PI * 2; add(g, cylinder(0.018, 0.018, 0.85, 6), m.steel, 3 + Math.cos(a) * 1.95, H + 0.65, -2 + Math.sin(a) * 1.95); }
  pipeRun(g, [[3, H, -2], [3, 0.5, -0.2], [-1, 0.4, -1], [-6, 0.4, -3]], 0.07, m.pipeBlue);
  // Pump house and wellhead
  building(g, 4, 3.2, 2.4, m.wallGreen, m.roofBlue, m, { x: -6.5, z: -3.4, winFront: 1, winBack: 0 });
  add(g, cylinder(0.75, 0.85, 0.7, 20), m.concrete, -2, 0.35, 2.2);
  add(g, cylinder(0.18, 0.18, 1, 12), m.darkSteel, -2, 1.1, 2.2);
  ctx.valve = valveWheel(g, -0.8, 0.04, 2.2, m);
  sensorNode(ctx, 8.2, 4.2);
  signBoard(g, 'MB-04 SOLAR WELL', 'Barangay Water Association', 0.8, 1.6, 3.4, 2.8, '#f7f7f2', '#20335e');
  for (const x of [-1, 2.6]) add(g, cylinder(0.04, 0.04, 1.6, 8), m.wood, x - 0.3, 0.8, 3.4);
  const a = person({ shirt: '#3fa676', pants: '#5b4b3a', hat: 'farmer', mode: 'work' });
  a.position.set(-1.1, 0.03, 3.3); a.rotation.y = Math.PI; people.push(a); g.add(a);
  const b = person({ shirt: '#d9534f', hat: 'farmer', shorts: true, carry: 'can', mode: 'walk', path: [[9, 8], [-11, 11], [-12, -6], [9, 8]] });
  people.push(b); g.add(b);
  for (const [x, z, h] of [[13, -7, 9], [-14, 2, 8], [11, 9, 10]]) coconut(g, x, z, h, 0.5);
  broadTree(g, -9, -10, 1.15);
}

function healthUnit(ctx) {
  const { g, m, people } = ctx;
  add(g, new THREE.CircleGeometry(25, 72).rotateX(-Math.PI / 2), m.concrete, -3, 0.03, 3);
  building(g, 15, 7, 3.2, m.wall, m.roofBlue, m, { z: -3, winFront: 5, winBack: 5 });
  building(g, 7, 9, 3.2, m.wall, m.roofBlue, m, { x: 11, z: 0, winFront: 2, winBack: 2 });
  door(g, 0, 0.84, 0, m, 2.4);
  signBoard(g, 'RURAL HEALTH UNIT', 'Naga City Health Office', 0, 4.15, 1.05, 7, '#ffffff', '#c22a2a');
  add(g, rbox(0.4, 1.3, 0.1, 0.02), m.red, -5.4, 2.35, 0.9);
  add(g, rbox(1.3, 0.4, 0.1, 0.02), m.red, -5.4, 2.35, 0.9);
  add(g, rbox(6, 0.12, 3, 0.03), m.roofTin, 0, 3.05, 2.2);
  for (const x of [-2.8, 2.8]) add(g, cylinder(0.07, 0.07, 3, 10), m.steel, x, 1.5, 3.5);
  // Two-storey school with a yellow front
  const school = new THREE.Group();
  school.position.set(-21, 0, -1);
  building(school, 15, 7, 3, m.wallYellow, null, m, { winFront: 5, winBack: 5 });
  building(school, 15, 7, 3, m.wallYellow, m.roofRed, m, { base: 3.1, winFront: 5, winBack: 5 });
  add(school, rbox(15.4, 0.14, 1.6, 0.02), m.concrete, 0, 3.32, 4.3);
  for (let i = 0; i < 16; i += 1) add(school, cylinder(0.022, 0.022, 1, 6), m.darkSteel, -7.3 + i, 3.9, 5);
  add(school, rbox(15.3, 0.05, 0.05, 0.01), m.darkSteel, 0, 4.4, 5);
  signBoard(school, 'ELEMENTARY SCHOOL', '', 0, 7.1, 3.6, 5.5, '#2f5be7', '#ffffff');
  g.add(school);
  add(g, cylinder(0.05, 0.07, 9, 10), m.steel, -14, 4.5, 9);
  const flag = new THREE.Group();
  add(flag, new THREE.BoxGeometry(1.5, 0.45, 0.02), new THREE.MeshStandardMaterial({ color: '#0038a8', side: THREE.DoubleSide }), 0.78, 0.23, 0);
  add(flag, new THREE.BoxGeometry(1.5, 0.45, 0.02), new THREE.MeshStandardMaterial({ color: '#ce1126', side: THREE.DoubleSide }), 0.78, -0.22, 0);
  flag.position.set(-14, 8.4, 9);
  g.add(flag);
  ctx.flag = flag;
  polyTank(g, 1.2, 2.2, 15.6, 0.1, 6.8, m.tank);
  ctx.valve = valveWheel(g, 13.5, 0.04, 7.8, m);
  sensorNode(ctx, 17, 11);
  const nurse = (x, z, ry, mode, path) => {
    const p = person({ shirt: '#7dd0c3', pants: '#7dd0c3', long: Math.random() > 0.4, carry: 'clipboard', mode, path, speed: 1 });
    p.position.set(x, 0.03, z); p.rotation.y = ry; people.push(p); g.add(p);
  };
  nurse(4.6, 6.9, -0.8, 'idle');
  nurse(0, 0, 0, 'walk', [[-3, 5], [3.5, 5], [3.5, 9], [-3, 9], [-3, 5]]);
  const patient = person({ shirt: '#c7a3e8', long: true });
  patient.position.set(-1.6, 0.33, 2.3); people.push(patient); g.add(patient);
  for (let i = 0; i < 6; i += 1) {
    const p = person({ shirt: '#ffffff', pants: '#23427e', shorts: true, scale: 0.72, carry: i % 2 ? 'pack' : null, mode: 'play', speed: 2.2, path: [[-27 + i, 6 + (i % 3) * 2], [-17, 10 + (i % 2) * 3], [-13 - i, 5], [-27 + i, 6 + (i % 3) * 2]] });
    people.push(p); g.add(p);
  }
  for (const [x, z, h] of [[19, -8, 9], [18, 13, 10], [-30, 11, 9]]) coconut(g, x, z, h, 0.6);
  broadTree(g, -29, -8, 1.2);
  broadTree(g, 21, 3, 1.05);
}

/** The farm where the spill scenario starts. */
function farm(ctx) {
  const { g, m, people } = ctx;
  building(g, 11, 5, 2.1, m.wall, m.roofTin, m, { winFront: 3, winBack: 0 });
  add(g, new THREE.CircleGeometry(9, 56).rotateX(-Math.PI / 2), m.soil, 0, 0.03, 8);
  ctx.lagoon = new THREE.MeshStandardMaterial({ color: '#7fa8a0', roughness: 0.2, metalness: 0.2 });
  const lagoon = add(g, new THREE.CircleGeometry(6.5, 56).rotateX(-Math.PI / 2), ctx.lagoon, -13, 0.06, 4);
  lagoon.scale.x = 1.3;
  const pen = (x, z) => { for (let i = 0; i < 8; i += 1) add(g, rbox(0.1, 0.9, 0.1, 0.02), m.wood, x + (i % 4) * 1.4, 0.45, z + Math.floor(i / 4) * 3); };
  pen(3, 4); pen(-3, 4);
  for (let i = 0; i < 6; i += 1) {
    const p = new THREE.Group();
    const b = add(p, new THREE.CapsuleGeometry(0.28, 0.55, 6, 14), m.pig, 0, 0.42, 0);
    b.rotation.x = Math.PI / 2;
    add(p, new THREE.SphereGeometry(0.2, 14, 12), m.pig, 0, 0.5, 0.52);
    add(p, cylinder(0.08, 0.09, 0.08, 10), m.pig, 0, 0.47, 0.72).rotation.x = Math.PI / 2;
    for (const [x, z] of [[-0.17, 0.26], [0.17, 0.26], [-0.17, -0.26], [0.17, -0.26]]) add(p, cylinder(0.05, 0.05, 0.28, 8), m.pig, x, 0.14, z);
    p.position.set(-2.4 + (i % 3) * 2.1 + (i > 2 ? 6 : 0), 0.03, 5 + (i % 2) * 1.4);
    p.rotation.y = i * 1.3;
    g.add(p);
  }
  const f = person({ shirt: '#b5894d', pants: '#4e4134', hat: 'farmer', mode: 'walk', path: [[-2, 3], [9, 3], [9, 9], [-2, 9], [-2, 3]], speed: 0.9 });
  people.push(f); g.add(f);
  for (const [x, z, h] of [[12, -3, 9], [-8, -6, 8]]) coconut(g, x, z, h, 0.6);
}

export const BUILDERS = { 'IN-01': springBox, 'AG-02': sentinel, 'KS-03': kiosk, 'MB-04': solarWell, 'RH-05': healthUnit, FARM: farm, RAIN: rainStation, BPT: breakTank, CHAMBER: valveChamber, PUMP: pumpStation, TOWER: waterTower };

/** Build a facility. Returns its group and the parts the scene animates. */
export function buildSite(id) {
  const m = materials();
  const g = new THREE.Group();
  const ctx = { g, m, people: [], taps: [], spin: [], valve: null, flag: null, beacon: null, lagoon: null };
  if (!['FARM', 'BPT', 'CHAMBER', 'PUMP', 'TOWER'].includes(id)) pad(g, id === 'RH-05' ? 34 : id === 'RAIN' ? 10 : 19, m);
  (BUILDERS[id] ?? kiosk)(ctx);
  return ctx;
}

export function setNightGlow(k) {
  materials().glass.emissiveIntensity = k * 1.15;
}
