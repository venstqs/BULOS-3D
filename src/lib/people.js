import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { add } from './siteKit';

// People for the site models: jointed figures about 1.65 m tall, with faces, hair, hats and carried items.
const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cylinder = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);

const SKIN = ['#c8905f', '#b77c4c', '#a56a41', '#d4a177', '#bb8152'];
const limbGeo = (len, r) => { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14); g.translate(0, -len / 2, 0); return g; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...o });

let shadowTexture = null;
let shadowMaterial = null;

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

  // A soft patch under the feet, so people stand on the ground
  shadowTexture ??= (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const q = c.getContext('2d');
    const grad = q.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(8,16,24,0.55)'); grad.addColorStop(0.55, 'rgba(8,16,24,0.26)'); grad.addColorStop(1, 'rgba(8,16,24,0)');
    q.fillStyle = grad; q.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  shadowMaterial ??= new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  add(g, new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2), shadowMaterial, 0, 0.015, 0);

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
