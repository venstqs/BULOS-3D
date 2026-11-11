import * as THREE from 'three';
import './landing.css';

const $ = (s) => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const backOut = (v) => { v = clamp(v); const c = 1.9; return 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2; };
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtTime = (min) => { const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

/* ---------------- parts of the page that need no 3D ---------------- */
// Phones get the phone app, computers get the full 3D map. The hosted site keeps the map at /twin/.
const HOSTED = import.meta.env.VITE_HOSTED === '1';
const IS_PHONE = /Android.+Mobile|iPhone|iPod/.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
const IS_IPHONE = /iPhone|iPod/.test(navigator.userAgent);
const toApp = HOSTED && IS_PHONE;
document.querySelectorAll('[data-twin]').forEach((a) => {
  a.href = toApp ? '/app/' : import.meta.env.VITE_TWIN_URL ?? '/';
  a.textContent = 'Open Bulos 3D';
});
if (IS_PHONE) document.documentElement.classList.add('phone-user');
if (HOSTED) {
  // On a computer, scan a code. On a phone, tap a button.
  import('qrcode-generator').then(({ default: qrcode }) => {
    const draw = (el, text) => {
      const code = qrcode(0, 'M');
      code.addData(text);
      code.make();
      el.innerHTML = code.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    };
    draw($('#qr-web'), new URL('/app/', window.location.href).href);
    const go = import.meta.env.VITE_EXPO_GO_URL;
    // Expo Go on iPhone only opens projects from the signed-in Expo account, so iPhones use the browser
    if (go && !IS_IPHONE) {
      draw($('#qr-go'), go);
      $('#open-go').href = go;
      $('#open-go').hidden = !IS_PHONE;
      $('#way-go').hidden = false;
    }
    $('#try-phone').hidden = false;
  });
  $('#open-web').href = IS_PHONE ? '/app/' : '/phone.html';
  if (import.meta.env.VITE_APK_URL) { $('#apk').href = import.meta.env.VITE_APK_URL; $('#apk').hidden = false; }
}

const intro = $('#intro');
const introWait = new Promise((done) => { setTimeout(done, calm ? 0 : 1250); });
const liftIntro = () => intro.classList.add('out');
setTimeout(liftIntro, 7000);   // a slow connection never leaves the page behind the logo

const SCREENS = [
  ['Home', 'home-calm', 'The river at a glance', 'The Bulos 3D Home screen'],
  ['3D map', 'map-spill', 'Fly the real watershed', 'The 3D map during a simulated spill'],
  ['Forecast', 'forecast-spill', 'See what arrives, and when', 'The four-hour forecast screen'],
  ['Is it safe?', 'safe-stop', 'A plain answer', 'The water safety answer'],
  ['Warnings', 'home-spill', 'Know before it arrives', 'A warning on the Home screen during a simulated spill'],
  ['Intake', 'point-closed', 'Close it, in simulation', 'A water point with its intake closed'],
];
const dial = $('#dial');
const screen = $('#screen');
SCREENS.forEach(([label, file, note, alt], i) => {
  const a = ((i * 60 - 90) * Math.PI) / 180;
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0);
  b.style.left = `${50 + 39 * Math.cos(a)}%`; b.style.top = `${50 + 39 * Math.sin(a)}%`;
  const pick = () => {
    dial.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b));
    $('#dial-title').textContent = label; $('#dial-note').textContent = note;
    if (screen.src.endsWith(`${file}.jpg`)) return;
    screen.src = `/landing/${file}.jpg`; screen.alt = alt;
    screen.classList.remove('swap'); void screen.offsetWidth; screen.classList.add('swap');
  };
  b.addEventListener('click', pick);
  b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(); });
  dial.append(b);
  new Image().src = `/landing/${file}.jpg`;
});
const phone = $('#phone');
$('#stage').addEventListener('pointermove', (e) => {
  if (calm) return;
  const r = e.currentTarget.getBoundingClientRect();
  phone.style.transform = `rotateY(${((e.clientX - r.left) / r.width - 0.5) * 30}deg) rotateX(${(0.5 - (e.clientY - r.top) / r.height) * 18}deg)`;
});
$('#stage').addEventListener('pointerleave', () => { phone.style.transform = ''; });

const numbers = new IntersectionObserver((list) => {
  list.forEach((entry) => {
    if (!entry.isIntersecting) return;
    numbers.unobserve(entry.target);
    const el = entry.target; const end = Number(el.dataset.count); const suffix = el.dataset.suffix; const digits = end % 1 ? 1 : 0;
    if (calm || end === 0) { el.textContent = `${end.toFixed(digits)}${suffix}`; return; }
    const t0 = performance.now();
    const tick = (now) => {
      const f = clamp((now - t0) / 1300);
      el.textContent = `${(end * (1 - (1 - f) ** 4)).toFixed(digits)}${suffix}`;
      if (f < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach((el) => numbers.observe(el));

const streamDrop = $('#stream-drop');
function moveDrop() {
  const stops = ['#spill', '#how', '#bicol', '#app', '#truth'].map((id) => $(id).offsetTop);
  let i = 0;
  while (i < 3 && scrollY >= stops[i + 1]) i += 1;
  const p = (i + clamp((scrollY - stops[i]) / (stops[i + 1] - stops[i]))) / 4;
  const path = $('#stream-path');
  const at = path.getPointAtLength(path.getTotalLength() * p);
  streamDrop.style.top = `${at.y / 6}%`;
  streamDrop.style.left = `${at.x - 8}px`;
  $('.bar').classList.toggle('solid', scrollY > stops[3] - 70);
}
addEventListener('scroll', moveDrop, { passive: true });
addEventListener('resize', moveDrop);
moveDrop();

const touch = !matchMedia('(hover: hover)').matches;
if (touch) $('#lead').textContent = $('#lead').textContent.replace('Click it', 'Tap it');

/* ---------------- the 3D world ---------------- */
const canvas = $('#world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  document.documentElement.classList.add('no3d');
}
if (renderer) start().catch(() => { document.documentElement.classList.add('no3d'); liftIntro(); });
else {
  liftIntro(); $('#try').hidden = true; $('#lead').textContent = 'This is the real Naga River, from Mt. Isarog to Naga City. Open Bulos 3D to explore it.'; }

function relief({ rows, cols, height, inside, sx, sz, base, extra }) {
  const pos = []; const top = []; const more = [];
  const id = new Int32Array(rows * cols).fill(-1);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (!inside(r, c)) continue;
    id[r * cols + c] = pos.length / 3;
    pos.push((c - cols / 2) * sx, height(r, c), (r - rows / 2) * sz);
    if (extra) more.push(extra(r, c));
  }
  const walls = []; const wallIdx = [];
  const wall = (a, b) => {
    const n = walls.length / 3;
    walls.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[a * 3], -base, pos[a * 3 + 2], pos[b * 3], -base, pos[b * 3 + 2]);
    wallIdx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  };
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? -1 : id[r * cols + c]);
  for (let r = 0; r < rows - 1; r += 1) for (let c = 0; c < cols - 1; c += 1) {
    const a = at(r, c); const b = at(r, c + 1); const d = at(r + 1, c); const e = at(r + 1, c + 1);
    if (a < 0 || b < 0 || d < 0 || e < 0) continue;
    top.push(a, d, b, b, d, e);
    if (at(r - 1, c) < 0 || at(r - 1, c + 1) < 0) wall(b, a);
    if (at(r + 2, c) < 0 || at(r + 2, c + 1) < 0) wall(d, e);
    if (at(r, c - 1) < 0 || at(r + 1, c - 1) < 0) wall(a, d);
    if (at(r, c + 2) < 0 || at(r + 1, c + 2) < 0) wall(e, b);
  }
  const land = new THREE.BufferGeometry();
  land.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (extra) land.setAttribute('aWet', new THREE.Float32BufferAttribute(more, 1));
  land.setIndex(top); land.computeVertexNormals();
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
  side.setIndex(wallIdx); side.computeVertexNormals();
  return { land, side };
}

function clay(step, rain) {
  const m = new THREE.MeshStandardMaterial({ color: 0xf1f4fb, roughness: 0.92 });
  // Without this, three.js reuses one compiled shader for both terrains and the rain never shows
  m.customProgramCacheKey = () => (rain ? 'clay-rain' : 'clay');
  m.onBeforeCompile = (s) => {
    s.uniforms.uStep = { value: step };
    if (rain) s.uniforms.uRain = rain;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying float vH;${rain ? 'attribute float aWet; varying float vWet;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvH = position.y;${rain ? 'vWet = aWet;' : ''}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vH; uniform float uStep;${rain ? 'varying float vWet; uniform float uRain;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${rain ? `
        // The same rule as the Bicol runoff risk layer
        float risk = vWet * (0.45 + 0.55 * pow(clamp(uRain / 80.0, 0.0, 1.0), 0.7));
        float u = clamp((risk - 0.2) / 0.36, 0.0, 1.0);
        vec3 heat = u < 0.5 ? mix(vec3(1.0, 0.878, 0.353), vec3(0.98, 0.588, 0.157), u * 2.0) : mix(vec3(0.98, 0.588, 0.157), vec3(0.878, 0.204, 0.173), (u - 0.5) * 2.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, heat, smoothstep(0.15, 0.32, risk));` : ''}
        float q = vH / uStep;
        float d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), 1e-4);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.66, 0.97), (1.0 - min(d, 1.0)) * 0.4 * step(0.02, vH));`);
  };
  return m;
}

async function start() {
  const D = await (await fetch('/landing/data.json')).json();
  const small = innerWidth < 900;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.3 : 1.6));
  renderer.setClearColor(0xffffff, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd5e0f8, 2.3));
  const sun = new THREE.DirectionalLight(0xfff8ee, 2.2);
  sun.position.set(-26, 16, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 500);

  /* the Naga watershed, from real elevation data */
  const n = D.naga;
  const KM = 111.32;
  const lat0 = n.north - (n.rows * n.step) / 2;
  const sx = n.step * KM * Math.cos((lat0 * Math.PI) / 180); const sz = n.step * KM;
  const hAt = (r, c) => n.elev[r * n.cols + c] / 1000 * 1.7;
  const watershed = new THREE.Group(); scene.add(watershed);
  const geo = relief({ rows: n.rows, cols: n.cols, height: hAt, inside: () => true, sx, sz, base: 1.2 });
  const land = new THREE.Mesh(geo.land, clay(0.17));
  land.castShadow = true; land.receiveShadow = true;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2f5be7, roughness: 0.75 });
  watershed.add(land, new THREE.Mesh(geo.side, wallMat));

  const toXYZ = (lon, lat, lift = 0.08) => {
    const c = (lon - n.west) / n.step; const r = (n.north - lat) / n.step;
    return new THREE.Vector3((c - n.cols / 2) * sx, hAt(clamp(Math.round(r), 0, n.rows - 1), clamp(Math.round(c), 0, n.cols - 1)) + lift, (r - n.rows / 2) * sz);
  };
  const raw = n.river.map(([lon, lat]) => toXYZ(lon, lat, 0.12));
  // A 90 m grid puts bumps under the channel. Water runs downhill, so never let it dip into them.
  for (let i = raw.length - 2; i >= 0; i -= 1) raw[i].y = Math.max(raw[i].y, raw[i + 1].y);
  const soften = (pts, w) => pts.map((p, i) => {
    let x = 0; let z = 0; let c = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(pts.length - 1, i + w); k += 1) { x += pts[k].x; z += pts[k].z; c += 1; }
    return new THREE.Vector3(x / c, p.y, z / c);
  });
  const path = soften(soften(raw, 6), 6);
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const SEG = 900; const RAD = 7;
  const tube = (radius, color) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, radius, RAD, false), new THREE.MeshBasicMaterial({ color })); watershed.add(m); return m; };
  const water = tube(0.08, 0x2f8dff);
  const plume = tube(0.105, 0xd93a35);
  const ahead = tube(0.1, 0xf2a71b);
  const range = (mesh, a, b) => { const per = RAD * 6; const s = Math.floor(clamp(a) * SEG) * per; mesh.geometry.setDrawRange(s, Math.max(0, Math.floor(clamp(b) * SEG) * per - s)); };
  range(water, 0, 0); range(plume, 0, 0); range(ahead, 0, 0);
  const samples = curve.getSpacedPoints(800);
  const fractionOf = (p) => { let best = 0; let far = 1e9; samples.forEach((q, i) => { const e = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (e < far) { far = e; best = i; } }); return best / 800; };

  const BLUE = new THREE.Color(0x2f5be7); const RED = new THREE.Color(0xd93a35); const AMBER = new THREE.Color(0xf2a71b); const SHUT = new THREE.Color(0x16204a);
  const tagBox = $('#tags');
  const makeTag = (text, cls = '') => { const el = document.createElement('div'); el.className = `tag ${cls}`; el.textContent = text; tagBox.append(el); return el; };
  const pins = n.stations.map((s) => {
    const base = toXYZ(s.lon, s.lat, 0);
    const g = new THREE.Group(); g.position.copy(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 10), new THREE.MeshBasicMaterial({ color: 0x16204a }));
    stem.position.y = 0.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), new THREE.MeshStandardMaterial({ color: 0x2f5be7, roughness: 0.3 }));
    head.position.y = 1.32;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: 0x2f5be7, transparent: true, opacity: 0 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.14;
    const packet = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2f8dff }));
    packet.visible = false;
    g.add(stem, head, ring, packet); watershed.add(g);
    return { ...s, g, head, ring, packet, frac: fractionOf(base), tag: makeTag(s.id), state: 'calm' };
  }).sort((a, b) => a.frac - b.frac);

  // Minutes of river flow from the first water point, from the model's real reach travel times
  const anchors = [];
  let total = 0;
  pins.forEach((p, i) => { anchors.push([p.frac, total]); if (n.legs[i]) total += n.legs[i] / 60; });
  const minutesAt = (f) => {
    const a = anchors;
    if (f <= a[0][0]) return a[0][1] - (a[0][0] - f) * (a[1][1] - a[0][1]) / (a[1][0] - a[0][0]);
    for (let i = 0; i < a.length - 1; i += 1) if (f <= a[i + 1][0]) return lerp(a[i][1], a[i + 1][1], (f - a[i][0]) / (a[i + 1][0] - a[i][0]));
    const l = a.length - 1;
    return a[l][1] + (f - a[l][0]) * (a[l][1] - a[l - 1][1]) / (a[l][0] - a[l - 1][0]);
  };
  const fracAt = (min) => { let lo = 0; let hi = 1; for (let i = 0; i < 24; i += 1) { const m = (lo + hi) / 2; if (minutesAt(m) < min) lo = m; else hi = m; } return lo; };

  // The base carries the name, like a plaque on a scale model
  const logo = new Image(); logo.src = '/favicon.svg';
  await Promise.all([logo.decode().catch(() => {}), document.fonts.load('700 96px Sora').catch(() => {})]);
  const sign = document.createElement('canvas'); sign.width = 1024; sign.height = 128;
  const pen = sign.getContext('2d');
  pen.drawImage(logo, 8, 8, 112, 112);
  pen.fillStyle = '#fff'; pen.font = '700 88px Sora, Inter, sans-serif'; pen.textBaseline = 'middle';
  pen.fillText('Bulos 3D', 136, 68);
  const map = new THREE.CanvasTexture(sign); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 1.1), new THREE.MeshBasicMaterial({ map, transparent: true }));
  plaque.position.set((-n.cols / 2) * sx - 0.03, -0.58, 2.5); plaque.rotation.y = -Math.PI / 2;
  watershed.add(plaque);

  /* all of Bicol, whose colour follows the rain */
  const b = D.bicol;
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const wet = bytes(b.wet); const elev = new Int16Array(bytes(b.elev).buffer);
  const rain = { value: 20 };
  const bsx = (b.step * KM / 10) * 0.97; const bsz = b.step * KM / 10;
  const bGeo = relief({ rows: b.rows, cols: b.cols, sx: bsx, sz: bsz, base: 0.3, inside: (r, c) => wet[r * b.cols + c] > 0, height: (r, c) => elev[r * b.cols + c] / 1000 * 0.75, extra: (r, c) => (wet[r * b.cols + c] - 1) / 254 });
  const bicol = new THREE.Group(); bicol.visible = false; scene.add(bicol);
  const bLand = new THREE.Mesh(bGeo.land, clay(0.11, rain));
  bLand.castShadow = true; bLand.receiveShadow = true;
  bicol.add(bLand, new THREE.Mesh(bGeo.side, wallMat));
  const CITIES = [['Naga', 123.19, 13.62], ['Legazpi', 123.74, 13.14], ['Sorsogon', 124.0, 12.97], ['Daet', 122.96, 14.11], ['Virac', 124.23, 13.58], ['Masbate', 123.62, 12.37]];
  const cities = CITIES.map(([name, lon, lat]) => ({ el: makeTag(name, 'city'), p: new THREE.Vector3(((lon - b.west) / b.step - b.cols / 2) * bsx, 1.4, ((b.north - lat) / b.step - b.rows / 2) * bsz) }));

  const rainInput = $('#rain'); const rainValue = $('#rain-value');
  const presets = [...document.querySelectorAll('[data-rain]')];
  let rainGoal = null;
  const setRain = (v) => {
    rain.value = v; rainValue.textContent = `${Math.round(v)} mm`;
    presets.forEach((b) => b.setAttribute('aria-pressed', Math.abs(Number(b.dataset.rain) - v) < 1));
  };
  rainInput.addEventListener('input', () => { rainGoal = null; setRain(Number(rainInput.value)); });
  presets.forEach((b) => b.addEventListener('click', () => { rainGoal = Number(b.dataset.rain); if (calm) { rainInput.value = rainGoal; setRain(rainGoal); rainGoal = null; } }));

  // Rain you can see: the more millimetres, the more of these fall
  const DROPS = small ? 500 : 1100;
  const spanX = b.cols * bsx * 0.5; const spanZ = b.rows * bsz * 0.5;
  const dropAt = new Float32Array(DROPS * 6);
  const dropFall = Float32Array.from({ length: DROPS }, () => 16 + Math.random() * 12);
  for (let i = 0; i < DROPS; i += 1) {
    const x = (Math.random() * 2 - 1) * spanX; const y = Math.random() * 15; const z = (Math.random() * 2 - 1) * spanZ;
    dropAt.set([x, y, z, x, y + 0.7, z], i * 6);
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropAt, 3));
  const drops = new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: 0x6f95ee, transparent: true, opacity: 0.6 }));
  drops.frustumCulled = false;
  bicol.add(drops);
  const stepRain = (dt) => {
    const count = Math.round((rain.value / 120) * DROPS);
    dropGeo.setDrawRange(0, count * 2);
    if (calm) return;
    for (let i = 0; i < count; i += 1) {
      let y = dropAt[i * 6 + 1] - dropFall[i] * dt;
      if (y < 0) y = 15;
      dropAt[i * 6 + 1] = y; dropAt[i * 6 + 4] = y + 0.7;
    }
    dropGeo.attributes.position.needsUpdate = true;
  };

  // Point at Bicol to read any place, at the rain on the slider
  const readout = makeTag('', 'read');
  const sea = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
  const seaHit = new THREE.Vector3();
  function readPlace() {
    ray.setFromCamera(mouse, camera);
    if (!overMap || !ray.ray.intersectPlane(sea, seaHit)) return false;
    const c = Math.floor(seaHit.x / bsx + b.cols / 2); const r = Math.floor(seaHit.z / bsz + b.rows / 2);
    if (c < 0 || r < 0 || c >= b.cols || r >= b.rows || !wet[r * b.cols + c]) return false;
    const risk = ((wet[r * b.cols + c] - 1) / 254) * (0.45 + 0.55 * clamp(rain.value / 80) ** 0.7);
    const near = cities.reduce((best, x) => (x.p.distanceToSquared(seaHit) < best.p.distanceToSquared(seaHit) ? x : best));
    readout.textContent = `${risk >= 0.55 ? 'Higher' : risk >= 0.3 ? 'Medium' : 'Lower'} runoff risk near ${near.el.textContent}`;
    readout.style.transform = `translate(${pointerX + 14}px, ${pointerY - 34}px)`;
    return true;
  }
  fetch('https://api.open-meteo.com/v1/forecast?latitude=13.62&longitude=123.19&hourly=precipitation&forecast_days=2&timezone=Asia%2FManila')
    .then((r) => r.json()).then((w) => {
      const now = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 13);
      const i = Math.max(0, w.hourly.time.findIndex((h) => h >= now));
      const mm = w.hourly.precipitation.slice(i, i + 24).reduce((a, v) => a + (v ?? 0), 0);
      const button = $('#live-rain');
      button.hidden = false; button.textContent = `Use the live forecast for Naga: ${mm.toFixed(1)} mm`;
      button.addEventListener('click', () => { rainGoal = null; rainInput.value = mm; setRain(mm); });
    }).catch(() => {});

  /* click the river: a small version of what the twin does */
  const MIN_PER_SECOND = 30;
  const CLOSE_AHEAD = 30;
  let spill = null;
  const headline = $('#headline'); const lead = $('#lead'); const log = $('#log'); const events = $('#events'); const clock = $('#clock');
  const safeN = $('#safe-n'); const hitN = $('#hit-n'); const also = $('#also');
  const original = { head: headline.innerHTML, lead: lead.textContent };

  function note(text, kind = '', when = null) {
    const li = document.createElement('li');
    if (kind) li.className = kind;
    li.textContent = text;
    if (when != null) { const s = document.createElement('small'); s.textContent = ` at +${fmtTime(when)}`; li.append(s); }
    events.append(li);
    while (events.children.length > 5) events.firstChild.remove();
  }
  function reset() {
    spill = null;
    range(plume, 0, 0);
    pins.forEach((p) => { p.state = 'calm'; p.hit = false; p.tag.textContent = p.id; p.tag.className = 'tag'; });
    log.hidden = true; events.textContent = ''; $('#reset').hidden = true; $('#try').hidden = false; also.hidden = false;
    headline.innerHTML = original.head; headline.classList.remove('alarm'); lead.textContent = original.lead;
  }
  function startSpill(frac) {
    reset();
    const start = clamp(frac, 0.02, 0.93);
    const below = pins.filter((p) => p.frac > start);
    spill = { start, t0: performance.now(), startMin: minutesAt(start), below, seen: false, saved: 0, reached: 0, late: null, done: false };
    safeN.textContent = '0'; hitN.textContent = '0';
    headline.innerHTML = 'Would you have known<i class="stop"></i>'; headline.classList.add('alarm');
    lead.textContent = 'Polluted water is moving down the river. The twin only knows what its sensors tell it.';
    log.hidden = false; $('#reset').hidden = false; $('#try').hidden = true; also.hidden = true;
    note('Something enters the river', 'bad', 0);
    if (!below.length) note('No water points lie below this spot.');
  }
  function stepSpill(now) {
    if (!spill) return;
    const s = spill;
    const elapsed = s.done ? s.end : ((now - s.t0) / 1000) * MIN_PER_SECOND;
    const head = fracAt(s.startMin + elapsed);
    range(plume, s.start, Math.max(s.start + 0.004, head));
    clock.textContent = `+${fmtTime(elapsed)}`;
    const eta = (p) => minutesAt(p.frac) - s.startMin;
    const gates = s.below.filter((p) => p.valve);
    if (!s.seen && s.below[0] && elapsed >= eta(s.below[0])) {
      s.seen = true; s.detect = elapsed;
      note(`${s.below[0].id} detects it`, 'bad', elapsed);
      const next = gates.find((p) => eta(p) > elapsed);
      if (next) note(`Forecast: reaches ${next.id} in about ${fmtTime(eta(next) - elapsed)}`);
      headline.innerHTML = 'The twin saw it first<i class="stop"></i>'; headline.classList.remove('alarm');
      lead.textContent = 'It already knows how fast this river moves, so it can warn the people downstream.';
    }
    s.below.forEach((p) => {
      const at = eta(p);
      if (s.seen && p.valve && p.state === 'calm' && elapsed >= at - CLOSE_AHEAD) {
        p.state = 'closed';
        p.tag.textContent = `${p.id} closed`; p.tag.className = 'tag safe';
        const early = at - elapsed;
        if (early > 1) { note(`${p.id} intake closes ${fmtTime(early)} early`, 'good', elapsed); s.saved += p.people; } else { note(`${p.id} intake closes as it arrives`, 'bad', elapsed); s.reached += p.people; s.late = p; }
        safeN.textContent = s.saved.toLocaleString(); hitN.textContent = s.reached.toLocaleString();
      }
      if (elapsed >= at && !p.hit) {
        p.hit = true;
        if (p.state !== 'closed') {
          p.state = 'hit'; p.tag.className = 'tag hit';
          if (p.people) { s.reached += p.people; hitN.textContent = s.reached.toLocaleString(); note(`It reaches ${p.id}`, 'bad', elapsed); }
        }
      }
    });
    if (!s.done && head >= 0.985) {
      s.done = true; s.end = elapsed;
      if (s.saved) {
        headline.innerHTML = 'Know before it reaches the tap<i class="stop"></i>';
        lead.textContent = `In this simulation, ${s.saved.toLocaleString()} people were moved to stored water before the pollution arrived.${s.late ? ` ${s.late.id} got almost no warning, which is why sensors sit upstream.` : ''} The layout is illustrative.`;
      } else {
        headline.innerHTML = 'This spill was too close<i class="stop"></i>';
        lead.textContent = 'A spill right beside an intake gives very little warning. Try one further upstream.';
      }
    }
  }
  $('#try').addEventListener('click', () => startSpill(pins[1].frac - 0.05));
  const SPOTS = { spring: () => pins[0].frac - 0.03, kiosk: () => pins.find((p) => p.id === 'KS-03').frac - 0.012 };
  document.querySelectorAll('[data-spill]').forEach((el) => el.addEventListener('click', () => startSpill(SPOTS[el.dataset.spill]())));
  $('#reset').addEventListener('click', reset);

  const hint = makeTag('', 'cue');
  hint.append(Object.assign(document.createElement('span'), { textContent: touch ? 'Tap the river' : 'Click the river. Drag to turn it.' }));
  const cueAt = samples[Math.round(0.9 * 800)];

  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(9, 9);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd93a35 }));
  marker.visible = false; watershed.add(marker);
  let hover = null; let px = 0; let py = 0; let inHero = true;
  let pointerX = 0; let pointerY = 0; let overMap = false;
  const orbit = { now: 0, goal: 0 };
  let grab = null; let dragged = false; let downAt = null; let readUntil = 0; let drawnNow = 0;
  const follow = (e) => {
    px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5;
    mouse.set(px * 2, -py * 2);
    pointerX = e.clientX; pointerY = e.clientY; overMap = e.target === canvas;
  };
  canvas.addEventListener('pointerdown', (e) => {
    grab = { x: e.clientX, goal: orbit.goal }; dragged = false;
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  addEventListener('pointerdown', follow, { passive: true });
  addEventListener('pointermove', (e) => {
    follow(e);
    if (!grab) return;
    const dx = e.clientX - grab.x;
    if (Math.abs(dx) > 6) dragged = true;
    orbit.goal = clamp(grab.goal - dx * 0.005, -1.25, 1.25);
  }, { passive: true });
  addEventListener('pointerup', (e) => {
    grab = null;
    // On a touch screen the Bicol readout shows for a moment after a tap, then gets out of the way
    if (e.pointerType !== 'mouse' && !dragged && e.target === canvas) readUntil = performance.now() + 2500;
  });
  addEventListener('pointercancel', () => { grab = null; downAt = null; });

  // The river counts only where it is drawn on screen: a press must land within a finger's width of it
  const onScreen = new THREE.Vector3();
  function riverAt(x, y, reach) {
    if (drawnNow < 0.98) return null;
    let best = -1; let far = reach * reach;
    for (let i = 0; i < samples.length; i += 2) {
      onScreen.copy(samples[i]).applyMatrix4(watershed.matrixWorld).project(camera);
      if (onScreen.z > 1) continue;
      const d = (((onScreen.x + 1) / 2) * innerWidth - x) ** 2 + (((1 - onScreen.y) / 2) * innerHeight - y) ** 2;
      if (d < far) { far = d; best = i; }
    }
    return best < 0 ? null : { frac: best / 800, point: samples[best] };
  }
  addEventListener('click', (e) => {
    // Only a deliberate tap or click on the 3D model itself: not on text, not the end of a scroll or a turn
    if (!inHero || e.target !== canvas || dragged || !downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const held = performance.now() - downAt.t;
    downAt = null;
    if (moved > 10 || held > 700) return;
    const at = riverAt(e.clientX, e.clientY, touch ? 34 : 24);
    if (at) startSpill(at.frac);
  });

  /* where the camera wants to be */
  const steps = document.querySelectorAll('.step');
  let step = -1;
  let shownStep = -2;
  const watch = new IntersectionObserver((list) => { list.forEach((en) => { if (en.isIntersecting) step = Number(en.target.dataset.step); }); }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => watch.observe(s));

  const cam = { theta: 3.2, radius: 66, height: 28, x: -1, z: 1, shift: 0.19, lift: 0.14 };
  const SHOTS = [
    { theta: 3.55, radius: 58, height: 20, x: -1, z: 0, shift: 0.17 },
    { theta: 2.9, radius: 54, height: 30, x: -3, z: 0, shift: 0.17 },
    { theta: 3.3, radius: 42, height: 14, x: -4, z: 1, shift: 0.17 },
    { theta: 3.05, radius: 31, height: 13, x: -3.5, z: 2.4, shift: 0.17 },
    { theta: 3.45, radius: 27, height: 11, x: -3.5, z: 2.4, shift: 0.17 },
  ];
  const HERO = { theta: 3.22, radius: 54, height: 23, x: -1, z: 1, shift: 0.19 };
  const KS = pins.find((p) => p.id === 'KS-03');
  const AG = pins.find((p) => p.id === 'AG-02');

  function resize() {
    const w = innerWidth; const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  const tmp = new THREE.Vector3();
  const place = (el, v, on, side = 0) => {
    tmp.copy(v).project(camera);
    const show = on && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
    el.style.display = show ? '' : 'none';
    if (show) el.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) ${side ? (side < 0 ? 'translate(calc(-100% - 15px), -50%)' : 'translate(15px, -50%)') : 'translate(-50%, -160%)'}`;
  };

  const heroEl = $('#spill'); const bicolEl = $('#bicol'); const appEl = $('#app');
  let born = Infinity;
  let last = performance.now();
  let stage = 0;
  introWait.then(() => { liftIntro(); born = performance.now(); });
  function frame(now) {
    requestAnimationFrame(frame);
    const realMs = now - last;
    const dt = Math.min(0.05, realMs / 1000); last = now;
    const vh = innerHeight;
    // The spill clock pauses while you are away from it, so you never come back to a finished spill
    if (spill && !spill.done && (realMs > 100 || heroEl.getBoundingClientRect().bottom <= vh * 0.55)) spill.t0 += realMs;
    const appTop = appEl.getBoundingClientRect().top;
    const visible = appTop > -vh * 0.1;
    canvas.style.opacity = clamp(appTop / (vh * 0.5));
    tagBox.style.opacity = clamp(appTop / (vh * 0.5));
    if (!visible) return;

    const bTop = bicolEl.getBoundingClientRect().top;
    const toBicol = smooth((vh * 0.95 - bTop) / (vh * 0.75));
    inHero = heroEl.getBoundingClientRect().bottom > vh * 0.55;
    const growing = calm ? 1 : smooth((now - born - 150) / 1300);
    const drawn = calm ? 1 : smooth((now - born - 900) / 1900);
    range(water, 0, drawn);
    drawnNow = drawn;
    const howing = !inHero && toBicol < 0.05 ? step : -1;
    // Phones show one step's words at a time (see .step .card.on)
    const shown = innerWidth < 900 && howing >= 0 && bTop > vh * 0.75 ? howing : -1;
    if (shown !== shownStep) {
      shownStep = shown;
      steps.forEach((el, i) => el.firstElementChild.classList.toggle('on', i === shown));
    }
    const nextStage = inHero ? 0 : toBicol > 0.5 ? 2 : 1;
    if (nextStage !== stage) { stage = nextStage; orbit.goal = 0; }
    orbit.now = lerp(orbit.now, orbit.goal, 1 - Math.exp(-dt * 7));

    watershed.visible = toBicol < 0.98;
    watershed.scale.set(1, Math.max(0.002, growing * (1 - toBicol)), 1);
    bicol.visible = toBicol > 0.02;
    bicol.scale.set(1, Math.max(0.002, toBicol), 1);

    const shot = toBicol > 0.5 ? null : inHero ? HERO : SHOTS[clamp(step, 0, 4)];
    const portrait = innerWidth < 900;
    const goal = { ...(shot ?? { theta: Math.PI * 1.5, radius: portrait ? 118 : 48, height: portrait ? 132 : 56, x: 0, z: 0, shift: 0.17 }), lift: portrait ? (shot ? 0.14 : 0.29) : 0 };
    const ease = 1 - Math.exp(-dt * (calm ? 30 : 3.2));
    Object.keys(cam).forEach((k) => { cam[k] = lerp(cam[k], goal[k], ease); });
    const fit = portrait && shot ? 1.45 : 1;
    const wob = calm ? 0 : 0.05;
    const a = cam.theta + orbit.now + px * wob * 2;
    camera.position.set(cam.x + Math.cos(a) * cam.radius * fit, cam.height * (portrait && shot ? 1.35 : 1) - py * 3, cam.z - Math.sin(a) * cam.radius * fit);
    camera.lookAt(cam.x, shot ? 0.6 : -2, cam.z);
    camera.setViewOffset(innerWidth, vh, portrait ? 0 : -innerWidth * cam.shift, -vh * cam.lift, innerWidth, vh);

    if (inHero) stepSpill(now);
    const clock01 = (now % 2200) / 2200;
    // The five steps, each shown on the model itself
    range(ahead, 0, 0);
    if (howing >= 0) {
      range(plume, 0, 0);
      if (howing === 2) { range(plume, AG.frac - 0.05, AG.frac + 0.02); range(ahead, AG.frac + 0.02, AG.frac + 0.02 + 0.5 * smooth(clock01 * 1.3)); }
      if (howing >= 3) { range(plume, AG.frac - 0.05, KS.frac - 0.03); range(ahead, KS.frac - 0.03, KS.frac + 0.02); }
    } else if (!spill) range(plume, 0, 0);
    pins.forEach((p, i) => {
      let color = BLUE; let ring = 0; let scale = 1; let text = p.id; let cls = 'tag';
      if (inHero) {
        if (p.state === 'hit') { color = RED; cls = 'tag hit'; }
        if (p.state === 'closed') { color = SHUT; cls = 'tag safe'; text = `${p.id} closed`; }
        if (p.state !== 'calm') ring = 0.8 * (1 - clock01);
      } else if (howing === 0) { ring = 0.8 * (1 - clock01); scale = 1 + 0.12 * Math.sin(clock01 * Math.PI); }
      p.packet.visible = howing === 1;
      if (howing === 1) p.packet.position.y = 1.6 + clock01 * 6;
      if (p === KS && howing === 3) { color = AMBER; ring = 0.8 * (1 - clock01); text = 'KS-03 risk rising'; }
      if (p === KS && howing === 4) { color = SHUT; ring = 0.8 * (1 - clock01); text = 'KS-03 intake closed'; cls = 'tag safe'; }
      p.head.material.color.copy(color);
      p.ring.material.opacity = ring;
      p.ring.material.color.copy(p.state === 'hit' ? RED : BLUE);
      p.ring.scale.setScalar(1 + clock01 * 2.4);
      p.g.scale.setScalar(Math.max(0.001, backOut((drawn - p.frac * 0.9) / 0.12) * scale));
      if (p.tag.textContent !== text) p.tag.textContent = text;
      if (p.tag.className !== cls) p.tag.className = cls;
      tmp.copy(p.head.position); p.g.localToWorld(tmp);
      place(p.tag, tmp.clone(), drawn > p.frac * 0.9 + 0.1 && toBicol < 0.3, i % 2 ? -1 : 1);
    });
    // On a narrow screen Sorsogon's label would sit on top of Legazpi's
    cities.forEach((c) => place(c.el, c.p, toBicol > 0.85 && !(portrait && c.el.textContent === 'Sorsogon')));
    place(hint, cueAt, inHero && !spill && drawn > 0.98, 1);
    if (bicol.visible) stepRain(dt);
    if (toBicol > 0.85) {
      if (rainGoal != null) {
        const v = lerp(rain.value, rainGoal, 1 - Math.exp(-dt * 5));
        const landed = Math.abs(v - rainGoal) < 0.4;
        setRain(landed ? rainGoal : v); rainInput.value = rain.value;
        if (landed) rainGoal = null;
      }
    }
    readout.style.display = toBicol > 0.85 && (!touch || now < readUntil) && readPlace() ? '' : 'none';

    if (inHero && !spill && matchMedia('(hover: hover)').matches) {
      hover = overMap && !grab ? riverAt(pointerX, pointerY, 24) : null;
      marker.visible = Boolean(hover);
      if (hover) marker.position.copy(hover.point);
      document.body.style.cursor = grab ? 'grabbing' : hover ? 'crosshair' : 'grab';
    } else { marker.visible = false; document.body.style.cursor = ''; }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
