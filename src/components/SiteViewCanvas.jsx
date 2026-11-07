import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyReading, buildSite, tickSite, updateDisplay } from '../lib/detailModels';
import { boxUV, coconut, kit, mergeStatic, reseed, rnd, sky, tree } from '../lib/siteKit';

const SUN = new THREE.Vector3(-0.62, 1, 0.5).normalize();

/** Where the camera goes for each part of a site. */
export function viewsOf(ctx) {
  const r = ctx.radius;
  const v = { site: { label: 'Whole site', eye: [r * 0.82, r * 0.52, r * 1.02], at: [0, 1.6, 0] } };
  if (ctx.sensorAt) {
    const [x, z] = ctx.sensorAt;
    const a = ctx.sensorRy ?? 0;
    v.sensors = { label: 'Sensors', eye: [x + Math.sin(a) * 2.9 + Math.cos(a) * 0.5, 1.75, z + Math.cos(a) * 2.9 - Math.sin(a) * 0.5], at: [x, 1.15, z] };
  }
  if (ctx.valveAt) { const [x, y, z] = ctx.valveAt; v.valve = { label: 'Valve', eye: [x + 2.1, y + 1.3, z + 2.6], at: [x, y, z] }; }
  if (ctx.tankAt) {
    const [x, y, z] = ctx.tankAt;
    const label = ctx.id === 'AG-02' ? 'Stilling well' : ctx.id === 'IN-01' ? 'Spring box' : 'Storage';
    v.storage = { label, eye: [x + 6.5, y + 2.5, z + 8], at: [x, y, z] };
  }
  return v;
}

/** A close view of one site: its model, real shadows and the sky that lights it. */
export default function SiteViewCanvas({ st, view = 'site', onReady }) {
  const host = useRef(null);
  const world = useRef(null);

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dbe9f7');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 900);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 1.2;

    const sun = new THREE.DirectionalLight('#fff1dc', 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    // Grass out to the horizon, fading into the sky
    const far = new THREE.CircleGeometry(3000, 96).rotateX(-Math.PI / 2).toNonIndexed();
    boxUV(far);
    const land = new THREE.Mesh(far, kit().grass);
    land.receiveShadow = true;
    land.position.y = -0.01;
    scene.add(land);
    scene.fog = new THREE.Fog('#dfeaf6', 70, 620);

    // A line of trees all round, so the site sits in a landscape
    const belt = { g: new THREE.Group(), live: [], ground: [] };
    reseed(77);
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2 + rnd(-0.04, 0.04);
      const r = rnd(72, 150);
      if (i % 3 === 0) coconut(belt.g, Math.cos(a) * r, Math.sin(a) * r, rnd(10, 13), 0.8);
      else tree(belt.g, Math.cos(a) * r, Math.sin(a) * r, rnd(1.6, 2.6));
    }
    mergeStatic(belt);
    belt.g.traverse((o) => { o.castShadow = false; });
    scene.add(belt.g);

    const w = { renderer, scene, camera, controls, sun, site: null, flight: null };
    world.current = w;
    sky().then((t) => {
      if (world.current !== w) return;
      scene.environment = t;
      scene.environmentIntensity = 0.75;
      scene.background = t;
      scene.backgroundIntensity = 0.95;
    }).catch(() => {});

    const fit = () => {
      const { clientWidth, clientHeight } = el;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const watcher = new ResizeObserver(fit);
    watcher.observe(el);
    fit();

    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      if (w.flight) {
        const f = w.flight;
        f.t = Math.min(1, f.t + dt / 1.5);
        const k = f.t * f.t * (3 - 2 * f.t);
        camera.position.lerpVectors(f.fromEye, f.toEye, k);
        controls.target.lerpVectors(f.fromAt, f.toAt, k);
        if (f.t >= 1) w.flight = null;
      }
      controls.update();
      if (w.site) tickSite(w.site, now / 1000, dt);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      watcher.disconnect();
      controls.dispose();
      world.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      el.replaceChildren();
    };
  }, []);

  // Swap in the model for this site
  const id = st?.id;
  useEffect(() => {
    const w = world.current;
    if (!w || !id) return undefined;
    const ctx = buildSite(id);
    // The site's own disc gives way to the wider ground
    ctx.ground[0].visible = false;
    w.scene.add(ctx.g);
    w.site = ctx;
    const r = ctx.radius;
    const s = w.sun.shadow.camera;
    Object.assign(s, { left: -r * 1.5, right: r * 1.5, top: r * 1.5, bottom: -r * 1.5, near: 1, far: r * 6 });
    s.updateProjectionMatrix();
    w.sun.position.copy(SUN).multiplyScalar(r * 3);
    w.controls.maxDistance = r * 3.2;
    const v = viewsOf(ctx).site;
    w.camera.position.set(...v.eye);
    w.controls.target.set(...v.at);
    w.flight = null;
    onReady?.(ctx);
    return () => {
      w.scene.remove(ctx.g);
      w.site = null;
      ctx.g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to the chosen part
  useEffect(() => {
    const w = world.current;
    if (!w?.site) return;
    const v = viewsOf(w.site)[view];
    if (!v) return;
    w.flight = { t: 0, fromEye: w.camera.position.clone(), fromAt: w.controls.target.clone(), toEye: new THREE.Vector3(...v.eye), toAt: new THREE.Vector3(...v.at) };
  }, [view, id]);

  // Keep the model in step with the latest reading
  useEffect(() => {
    const w = world.current;
    if (!w?.site || !st) return;
    applyReading(w.site, st);
    updateDisplay(w.site, st);
  }, [st]);

  return <div ref={host} className="absolute inset-0" />;
}
