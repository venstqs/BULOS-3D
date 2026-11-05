import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as THREE from 'three';
import { animatePerson, buildSite, crewTruck, setNightGlow } from '../lib/detailModels';
import { stationStatus } from '../lib/format';
import { riverAt } from '../lib/twinField';
import { RIVER_FRAG, paintRiver } from '../lib/waterShaders';

// The command view: a real 3D map with detailed facilities and people on it.
// Free open data by default; VITE_MAPBOX_TOKEN switches the imagery and terrain to Mapbox.
const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;
const IMAGERY = MAPBOX
  ? { tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=${MAPBOX}`], attribution: '© Mapbox © Maxar' }
  : { tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
const TERRAIN = MAPBOX
  ? { tiles: [`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${MAPBOX}`], encoding: 'mapbox', maxzoom: 14 }
  : { tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', maxzoom: 13, attribution: 'Terrain: Mapzen/AWS open data' };
const EXAGGERATION = 1.5;
const CLOSE_ZOOM = 20.5;
const MODEL_FULL_SIZE_ZOOM = 17.8;   // below this zoom models stay readable instead of shrinking to dots
const GROUND_PAD_ZOOM = 16.2;        // the grass and concrete under a site only show close up
const bandOf = (r) => (r >= 0.6 ? 'SEVERE' : r >= 0.45 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW');
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(([a, b]) => [a, b]) } });
const empty = { type: 'FeatureCollection', features: [] };
const waterCss = (t, o) => {
  const [a, b] = [Math.min(1, t / 30), Math.min(1, o / 150)];
  return `rgb(${Math.round(Math.min(255, (0.2 + 0.56 * a + 0.34 * b) * 255))},${Math.round(Math.max(0, (0.66 - 0.32 * a - 0.46 * b) * 255))},${Math.round(Math.max(0, (1 - 0.8 * a - 0.68 * b) * 255))})`;
};

function rasterUrl(grid, ramp) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.ncols; canvas.height = grid.nrows;
  const g = canvas.getContext('2d');
  const img = g.createImageData(grid.ncols, grid.nrows);
  const b = Uint8Array.from(atob(grid.data), (c) => c.charCodeAt(0));
  for (let i = 0; i < b.length; i += 1) img.data.set(b[i] ? ramp((b[i] - 1) / 254) : [0, 0, 0, 0], i * 4);
  g.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
const riskRamp = (t) => [250 - 60 * t, 200 - 170 * t, 120 - 90 * t, t < 0.04 ? 0 : 40 + 190 * t ** 0.8];
const floodRamp = (t) => [120 - 95 * t, 190 - 110 * t, 245, t < 0.12 ? 0 : 50 + 170 * t];

/** Soft dark disc under a model, standing in for a cast shadow. */
function contactShadow(r) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(10,20,30,0.42)'); grad.addColorStop(0.7, 'rgba(10,20,30,0.2)'); grad.addColorStop(1, 'rgba(10,20,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.position.y = 0.01;
  return m;
}

// River ribbon: its centre line follows the terrain, and its width changes with zoom
const RIVER_VERT = `
attribute float aSide; attribute float aS; attribute float aAlong; attribute vec2 aNormal;
uniform float uWidth; uniform float uBase; uniform float uTexScale;
varying vec2 vUv; varying float vS;
void main(){
  float half_w = uWidth * (0.5 + 0.9 * aS);
  vec3 p = position;
  p.xz += aNormal * aSide * half_w;
  p.y -= uBase;
  vUv = vec2(aAlong / uTexScale, aSide * 0.5 + 0.5);
  vS = aS;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

/** Draw over the terrain but under the models, without needing the transparent pass. */
const underModels = (material, order, mesh) => {
  material.depthTest = false;
  material.depthWrite = false;
  mesh.renderOrder = order;
};

/** The chain of open-road points the crew truck drives along, offset from the river. */
function crewRoute(stem) {
  const out = [];
  for (let i = 0; i < stem.length; i += 3) {
    const a = stem[Math.max(0, i - 3)];
    const b = stem[Math.min(stem.length - 1, i + 3)];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const n = Math.hypot(dx, dy) || 1;
    out.push([stem[i][0] + (-dy / n) * 0.0022, stem[i][1] + (dx / n) * 0.0022]);
  }
  return out;
}

export default function TwinMapScene({ staticData, live, heatmap, floodmap, atTime, tauStep, selectedId, onPick, onInspect, crewTask, layers, controls, onTour, onCaption }) {
  const host = useRef(null);
  const rainCanvas = useRef(null);
  const mapRef = useRef(null);
  const world = useRef(null);
  const markers = useRef({});
  const handlers = useRef({});
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState(null);
  if (fatal) throw fatal;
  const first = useRef(live);
  first.current = first.current ?? live;
  const hasData = Boolean(staticData && live);

  useEffect(() => { handlers.current = { onPick, onInspect, onTour, onCaption }; }, [onPick, onInspect, onTour, onCaption]);

  useEffect(() => {
    if (!hasData) return undefined;
    const stem = staticData.main_stem;
    const stations = first.current.stations;
    const [hLon, hLat] = stem[0];
    const [oLon, oLat] = stem.at(-1);
    const center = [hLon * 0.47 + oLon * 0.53, hLat * 0.47 + oLat * 0.53];
    const bearing = (Math.atan2((hLon - oLon) * 0.97, hLat - oLat) * 180) / Math.PI - 90;
    const aspect = host.current.clientWidth / Math.max(1, host.current.clientHeight);
    const home = { center, zoom: 11.95 + Math.min(0, Math.log2(aspect / 1.75)), pitch: 62, bearing };

    let map;
    try {
      map = new maplibregl.Map({
        container: host.current, ...home, centerClampedToGround: false, maxZoom: 21.5, maxPitch: 80, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
        style: {
          version: 8,
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sources: {
            imagery: { type: 'raster', tileSize: 256, maxzoom: MAPBOX ? 20 : 18, ...IMAGERY },
            dem: { type: 'raster-dem', tileSize: 256, ...TERRAIN },
            shade: { type: 'raster-dem', tileSize: 256, ...TERRAIN },
            osm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap contributors, OpenFreeMap' },
            river: { type: 'geojson', lineMetrics: true, data: line(stem) },
            streams: { type: 'geojson', data: { type: 'FeatureCollection', features: staticData.streams.filter((s) => s.area_km2 >= 0.35).map((s) => line(s.coords)) } },
            pipes: { type: 'geojson', data: { type: 'FeatureCollection', features: (staticData.pipes ?? []).map((p) => line(p.coords)) } },
            catchment: { type: 'geojson', data: line(staticData.catchment.ring) },
            plume: { type: 'geojson', data: empty },
          },
          layers: [
            { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': 0.12, 'raster-contrast': 0.06 } },
            { id: 'hillshade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.32, 'hillshade-shadow-color': '#0b2030' } },
            { id: 'catchment', type: 'line', source: 'catchment', paint: { 'line-color': '#ffffff', 'line-width': 1.4, 'line-dasharray': [3, 2], 'line-opacity': 0.75 } },
            { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]], paint: { 'line-color': '#f4f1e4', 'line-opacity': 0.55, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 0.5, 15, 2.2, 19, 16] } },
            { id: 'streams', type: 'line', source: 'streams', paint: { 'line-color': '#7cc9ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 5], 'line-opacity': 0.9 } },
            { id: 'pipes', type: 'line', source: 'pipes', paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-dasharray': [1, 1.4] } },
            { id: 'river-glow', type: 'line', source: 'river', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 11, 16, 44, 20, 190], 'line-blur': 6, 'line-opacity': 0.42, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#46b4ff', 1, '#46b4ff'] } },
            { id: 'buildings', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', minzoom: 12.5, paint: { 'fill-extrusion-color': '#e9e3d6', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } },
            { id: 'places', type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom: 9, filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 11.5] }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,25,50,0.82)', 'text-halo-width': 1.5 } },
          ],
          terrain: { source: 'dem', exaggeration: EXAGGERATION },
          sky: { 'sky-color': '#8db9f2', 'horizon-color': '#dfeaff', 'fog-color': '#e4edff', 'fog-ground-blend': 0.55, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.75, 'atmosphere-blend': 0.55 },
        },
      });
    } catch (e) {
      setFatal(new Error(`3D map could not start (${e.message}).`));
      return undefined;
    }
    mapRef.current = map;

    /* ---------- detailed models, drawn inside the map ---------- */
    const origin = center;
    const sites = {};
    const people = [];
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#ffffff', '#6d7a66', 2.1);
    const sun = new THREE.DirectionalLight('#fff3df', 3);
    sun.position.set(-0.5, 1, 0.65);
    scene.add(hemi, sun);

    const originMerc = maplibregl.MercatorCoordinate.fromLngLat(origin, 0);
    const metre = originMerc.meterInMercatorCoordinateUnits();
    const local = (lon, lat) => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
      return [(c.x - originMerc.x) / metre, (c.y - originMerc.y) / metre];
    };
    const addSite = (id, lon, lat, facing, r) => {
      const ctx = buildSite(id);
      ctx.g.rotation.y = facing;
      const root = new THREE.Group();
      root.add(ctx.g, contactShadow(r));
      ctx.g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.userData.site = id; } });
      const [x, z] = local(lon, lat);
      root.position.set(x, 0, z);
      scene.add(root);
      const pin = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 24), new THREE.MeshStandardMaterial({ color: '#0ca30c', emissive: '#0ca30c', emissiveIntensity: 0.4, roughness: 0.35 }));
      pin.rotation.x = Math.PI;
      pin.frustumCulled = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.06, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d03b3b', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      ring.visible = false;
      ring.position.y = 0.2;
      ring.frustumCulled = false;
      root.add(ring);
      const pads = [root.children[1], ...ctx.g.children.filter((o) => o.geometry?.type === 'CircleGeometry')];
      pads.slice(1).forEach((pad, i) => {
        pad.material = pad.material.clone();
        underModels(pad.material, -6 + i * 0.1, pad);
      });
      sites[id] = { ...ctx, root, ring, pads, lon, lat, r, phase: Math.random() };
      people.push(...ctx.people);
      return sites[id];
    };
    // Each facility stands on the bank, with an intake pipe down to the river
    const degLon = 111320 * Math.cos((center[1] * Math.PI) / 180);
    stations.forEach((st, n) => {
      const r = st.id === 'RH-05' ? 36 : 22;
      let at = 0; let best = 1e12;
      stem.forEach(([a, b], i) => { const e = (a - st.lon) ** 2 + (b - st.lat) ** 2; if (e < best) { best = e; at = i; } });
      const [p0, p1] = [stem[Math.max(0, at - 3)], stem[Math.min(stem.length - 1, at + 3)]];
      const [ex, ny] = [(p1[0] - p0[0]) * degLon, (p1[1] - p0[1]) * 111320];
      const len = Math.hypot(ex, ny) || 1;
      const side = n % 2 ? 1 : -1;
      const gap = r * 1.5;
      const [east, north] = [(-ny / len) * side * gap, (ex / len) * side * gap];
      const site = addSite(st.id, stem[at][0] + east / degLon, stem[at][1] + north / 111320, bearing * (Math.PI / 180) * -1 + 0.5, r);
      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, gap, 12), new THREE.MeshStandardMaterial({ color: '#2d71d8', roughness: 0.4 }));
      intake.rotation.set(Math.PI / 2, 0, 0);
      const holder = new THREE.Group();
      holder.add(intake);
      holder.position.set(-east / 2, 0.4, north / 2);
      holder.rotation.y = Math.atan2(-east, -north * -1);
      holder.traverse((o) => { o.frustumCulled = false; });
      site.root.add(holder);
      site.pipe = holder;
    });
    const agIndex = stem.findIndex((_, i) => (first.current.channel.chainage_m[i] ?? 0) > (stations.find((s) => s.id === 'AG-02')?.chainage_m ?? 0) - 1100);
    const fp = stem[Math.max(0, agIndex)];
    addSite('FARM', fp[0] + 0.0028, fp[1] + 0.0036, 0.4, 24);

    const line3 = new THREE.CatmullRomCurve3(stem.filter((_, i) => i % 3 === 0 || i === stem.length - 1).map(([a, b]) => new THREE.Vector3(a, b, 0)), false, 'centripetal');
    const riverPts = line3.getSpacedPoints(760);
    const rv = riverPts.length;
    const rPos = new Float32Array(rv * 6);
    const rSide = new Float32Array(rv * 2);
    const rS = new Float32Array(rv * 2);
    const rAlong = new Float32Array(rv * 2);
    const rNormal = new Float32Array(rv * 4);
    const rIdx = [];
    const xy = riverPts.map((q) => local(q.x, q.y));
    let along = 0;
    for (let i = 0; i < rv; i += 1) {
      const [a, b] = [xy[Math.max(0, i - 2)], xy[Math.min(rv - 1, i + 2)]];
      const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
      const n = Math.hypot(dx, dz) || 1;
      if (i) along += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
      for (let e = 0; e < 2; e += 1) {
        const k = i * 2 + e;
        rPos.set([xy[i][0], 0, xy[i][1]], k * 3);
        rSide[k] = e ? 1 : -1;
        rS[k] = i / (rv - 1);
        rAlong[k] = along;
        rNormal.set([-dz / n, dx / n], k * 2);
      }
      if (i < rv - 1) { const k = i * 2; rIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    riverGeo.setAttribute('aSide', new THREE.BufferAttribute(rSide, 1));
    riverGeo.setAttribute('aS', new THREE.BufferAttribute(rS, 1));
    riverGeo.setAttribute('aAlong', new THREE.BufferAttribute(rAlong, 1));
    riverGeo.setAttribute('aNormal', new THREE.BufferAttribute(rNormal, 2));
    riverGeo.setIndex(rIdx);
    const field = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
    field.minFilter = THREE.LinearFilter;
    field.magFilter = THREE.LinearFilter;
    const riverUniforms = {
      uTime: { value: 0 }, uFlow: { value: 1.1 }, uField: { value: field }, uTint: { value: new THREE.Color('#3aa8ff') }, uUseField: { value: 1 },
      uWidth: { value: 14 }, uBase: { value: 0 }, uTexScale: { value: 40 },
    };
    const riverMat = new THREE.ShaderMaterial({
      vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, uniforms: riverUniforms, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const riverMesh = new THREE.Mesh(riverGeo, riverMat);
    riverMesh.frustumCulled = false;
    underModels(riverMat, -7, riverMesh);
    scene.add(riverMesh);
    let drapedAt = 0;
    const drapeRiver = (now) => {
      if (now - drapedAt < 2500) return;
      drapedAt = now;
      const P = riverGeo.getAttribute('position');
      for (let i = 0; i < rv; i += 1) {
        const y = map.queryTerrainElevation([riverPts[i].x, riverPts[i].y]) ?? 0;
        P.setY(i * 2, y); P.setY(i * 2 + 1, y);
      }
      P.needsUpdate = true;
    };

    const route = crewRoute(stem);
    const routeXY = route.map(([a, b]) => local(a, b));
    const nearestRoute = (lon, lat) => {
      let best = 0; let d = 1e12;
      route.forEach(([a, b], i) => { const e = (a - lon) ** 2 + (b - lat) ** 2; if (e < d) { d = e; best = i; } });
      return best;
    };
    const crew = crewTruck();
    crew.g.traverse((o) => { o.frustumCulled = false; });
    scene.add(crew.g);
    const crewState = { i: route.length - 2, goal: route.length - 2 };

    const raycaster = new THREE.Raycaster();
    const camera = new THREE.Camera();
    let renderer = null;
    let last = performance.now();
    const elevation = (lon, lat, fallback) => map.queryTerrainElevation([lon, lat]) ?? fallback * EXAGGERATION;
    const rotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const models = {
      id: 'detailed-models', type: 'custom', renderingMode: '3d',
      onAdd(_, gl) {
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      },
      render(_, args) {
        const now = performance.now();
        const dt = Math.min(0.08, (now - last) / 1000);
        last = now;
        const t = now / 1000;
        const zoom = map.getZoom();
        const size = Math.max(1, 2 ** (MODEL_FULL_SIZE_ZOOM - zoom));
        const baseAlt = elevation(origin[0], origin[1], 20);
        drapeRiver(now);
        riverUniforms.uTime.value = t;
        riverUniforms.uBase.value = baseAlt;
        riverUniforms.uWidth.value = 12 * Math.max(1, 2 ** (16.4 - zoom));
        riverUniforms.uTexScale.value = riverUniforms.uWidth.value * 1.7;
        const closeUp = zoom >= GROUND_PAD_ZOOM;
        for (const s of Object.values(sites)) {
          for (const pad of s.pads) pad.visible = closeUp;
          if (s.pipe) s.pipe.visible = closeUp;
          s.root.position.y = elevation(s.lon, s.lat, s.base ?? 20) - baseAlt + 0.3;
          s.root.scale.setScalar(size);
          if (s.ring.visible) {
            const ph = (now / 1500 + s.phase) % 1;
            s.ring.scale.setScalar(0.85 + ph * 0.9);
            s.ring.material.opacity = (1 - ph) * 0.85;
          }
          if (s.flag) s.flag.rotation.y = Math.sin(t * 2.4) * 0.22;
          if (s.beacon) s.beacon.visible = Math.sin(t * 5) > 0;
          for (const tap of s.taps) tap.scale.x = 1 + Math.sin(t * 22 + tap.position.x) * 0.2;
        }
        for (const p of people) animatePerson(p, t, dt);
        if (crewState.goal !== crewState.i) {
          const dir = Math.sign(crewState.goal - crewState.i);
          crewState.i += dir * Math.min(Math.abs(crewState.goal - crewState.i), dt * 0.55);
        }
        const k = Math.floor(crewState.i);
        const f = crewState.i - k;
        const [ax, az] = routeXY[k];
        const [bx, bz] = routeXY[Math.min(routeXY.length - 1, k + 1)];
        const [lo, la] = route[k];
        crew.g.position.set(ax + (bx - ax) * f, elevation(lo, la, 20) - baseAlt + 0.2, az + (bz - az) * f);
        crew.g.rotation.y = Math.atan2(-(bz - az), bx - ax) + (crewState.goal < crewState.i ? Math.PI : 0);
        crew.g.scale.setScalar(size);
        crew.beacon.visible = Math.sin(t * 7) > -0.2;

        const mc = maplibregl.MercatorCoordinate.fromLngLat(origin, baseAlt);
        const s = mc.meterInMercatorCoordinateUnits();
        const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(rotation);
        camera.projectionMatrix = m.multiply(l);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        renderer.render(scene, camera);
        map.triggerRepaint();
      },
    };

    const pickAt = (e) => {
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const ndc = new THREE.Vector2((e.point.x / width) * 2 - 1, -(e.point.y / height) * 2 + 1);
      const near = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
      const far = new THREE.Vector3(ndc.x, ndc.y, 1).unproject(camera);
      raycaster.set(near, far.sub(near).normalize());
      for (const s of Object.values(sites)) s.root.updateMatrixWorld();
      const hit = raycaster.intersectObjects(Object.values(sites).map((s) => s.g), true).find((h) => h.object.userData.site && h.object.userData.site !== 'FARM');
      if (hit) { const id = hit.object.userData.site; handlers.current.onPick?.(id); focus(id); }
    };

    // With terrain the map can keep the ground height from where the flight began, leaving
    // the target off screen. Setting it on arrival keeps the camera aimed at the site.
    const groundAt = ([lon, lat]) => map.queryTerrainElevation([lon, lat]) ?? 0;
    const fly = (options) => {
      map.flyTo({ ...options, essential: true });
      map.once('moveend', () => { map.setCenterElevation(groundAt(options.center)); });
    };

    const focus = (id) => {
      const s = sites[id];
      if (!s) return;
      stopFollow();
      fly({ center: [s.lon, s.lat], zoom: CLOSE_ZOOM, pitch: 70, bearing: map.getBearing(), duration: 2600 });
    };

    let timer = 0;
    let follow = false;
    const stopFollow = () => { follow = false; };
    let touring = false;
    const stopTour = () => { if (!touring) return; touring = false; handlers.current.onTour?.(false); handlers.current.onCaption?.(null); };
    const startTour = async () => {
      if (touring) return;
      touring = true;
      handlers.current.onTour?.(true);
      const order = first.current.stations;
      for (const st of order) {
        if (!touring) return;
        const s = sites[st.id];
        handlers.current.onCaption?.(st.id);
        fly({ center: [s.lon, s.lat], zoom: CLOSE_ZOOM - 0.3, pitch: 72, bearing: map.getBearing() + 42, duration: 4200 });
        await new Promise((ok) => { map.once('moveend', ok); });
        if (!touring) return;
        map.easeTo({ bearing: map.getBearing() + 26, duration: 4200, easing: (x) => x });
        await new Promise((ok) => { setTimeout(ok, 4300); });
      }
      stopTour();
      fly({ ...home, duration: 3000 });
    };

    controls.current = {
      home: () => { stopTour(); stopFollow(); fly({ ...home, duration: 1800 }); },
      focus: (id) => { stopTour(); focus(id); },
      street: (id) => {
        const s = sites[id];
        if (!s) return;
        stopTour(); stopFollow();
        const walker = s.people[0];
        walker.updateWorldMatrix(true, false);
        const v = new THREE.Vector3().setFromMatrixPosition(walker.matrixWorld);
        const c = new maplibregl.MercatorCoordinate(originMerc.x + v.x * metre, originMerc.y + v.z * metre, 0).toLngLat();
        fly({ center: [c.lng, c.lat], zoom: 21.4, pitch: 76, bearing: map.getBearing(), duration: 2400 });
      },
      zoom: (k) => map.easeTo({ zoom: map.getZoom() + k, duration: 350 }),
      tilt: () => map.easeTo({ bearing: map.getBearing() + 40, duration: 900 }),
      startTour, stopTour,
      setFollow: (on) => { stopTour(); follow = on; if (on) map.easeTo({ zoom: 14.2, pitch: 66, duration: 1400 }); },
    };

    map.on('load', () => {
      map.addLayer(models);
      setReady(true);
    });
    map.on('click', pickAt);
    const userMoved = (e) => { if (e.originalEvent) { stopTour(); } };
    map.on('dragstart', userMoved);

    timer = setInterval(() => {
      const w = world.current;
      if (follow && w?.front && !document.hidden) map.easeTo({ center: w.front, duration: 900 });
    }, 1000);

    world.current = { map, sites, crewState, nearestRoute, field, riverUniforms, front: null };
    const pins = markers.current;
    return () => {
      clearInterval(timer);
      stopTour();
      field.dispose();
      for (const m of Object.values(pins)) m.remove();
      markers.current = {};
      scene.traverse((o) => { o.geometry?.dispose?.(); });
      map.remove();
      mapRef.current = null;
      world.current = null;
      controls.current = {};
      setReady(false);
    };
  }, [hasData, staticData, controls]);

  /* ---------------- twin state into the map ---------------- */
  useEffect(() => {
    const w = world.current;
    const map = mapRef.current;
    if (!w || !map || !ready || !live || !atTime) return;
    const f = riverAt(tauStep, live, atTime);
    const n = f.turb.length;
    const stops = [];
    let lastDirty = -1;
    for (let i = 0; i <= 28; i += 1) {
      const k = Math.round((i / 28) * (n - 1));
      stops.push(i / 28, waterCss(f.turb[k] ?? 0, f.orp[k] ?? 0));
    }
    for (let k = 0; k < n; k += 1) if ((f.turb[k] ?? 0) > 3 || (f.orp[k] ?? 0) > 25) lastDirty = k;
    const gradient = ['interpolate', ['linear'], ['line-progress'], ...stops];
    map.setPaintProperty('river-glow', 'line-gradient', gradient);
    paintRiver(w.field.image.data, f);
    w.field.needsUpdate = true;

    const stem = staticData.main_stem;
    const moving = lastDirty >= 0 && lastDirty < n - 6;
    w.front = moving ? [stem[Math.min(stem.length - 1, lastDirty)][0], stem[Math.min(stem.length - 1, lastDirty)][1]] : null;
    let pf = markers.current.front;
    if (moving) {
      if (!pf) {
        const el = document.createElement('div');
        el.className = 'whitespace-nowrap rounded-md bg-[#c43b1f] px-1.5 py-0.5 text-[11px] font-bold text-white shadow';
        el.textContent = 'Plume front';
        pf = new maplibregl.Marker({ element: el }).setLngLat(w.front).addTo(map);
        markers.current.front = pf;
      }
      pf.setLngLat(w.front);
    } else if (pf) { pf.remove(); delete markers.current.front; }

    // Light: the hour on the twin's clock, dimmed further by rain
    const hour = new Date(live.clock.epoch_ms).getHours() + new Date(live.clock.epoch_ms).getMinutes() / 60;
    const night = hour >= 19 || hour < 5 ? 1 : hour >= 17.5 ? (hour - 17.5) / 1.5 : hour < 6.5 ? (6.5 - hour) / 1.5 : 0;
    const rainNow = atTime[live.stations[0].id]?.rain ?? 0;
    const storm = Math.min(1, rainNow / 30);
    w.rain = storm;
    map.setPaintProperty('imagery', 'raster-brightness-max', 1 - 0.32 * night - 0.25 * storm);
    setNightGlow(night);

    const lagoon = w.sites.FARM?.lagoon;
    if (lagoon) lagoon.color.set(rainNow < 1 && (atTime['AG-02']?.risk ?? 0) >= 0.25 ? '#6d4a2a' : '#7fa8a0');

    const flows = (live.pipes ?? []).some((p) => !p.flowing);
    map.setPaintProperty('pipes', 'line-color', flows ? '#ffb4a6' : '#ffffff');

    for (const st of live.stations) {
      const risk = atTime[st.id]?.risk ?? st.risk;
      const shown = tauStep === 0 ? st : { ...st, risk_band: bandOf(risk), classification: 'NORMAL', edge_state: 'NORMAL' };
      const { color } = stationStatus(shown);
      const closed = tauStep === 0 && st.valve && !st.valve.open;
      const s = w.sites[st.id];
      if (s) {
        s.base = st.elevation_m;
        s.ring.material.color.set(color);
        s.ring.visible = risk >= 0.25 || Boolean(closed);
        s.valve?.color.set(closed ? '#d03b3b' : '#22a35a');
        s.valve?.emissive.set(closed ? '#d03b3b' : '#22a35a');
        for (const tap of s.taps) tap.visible = !closed;
      }
      let m = markers.current[st.id];
      if (!m) {
        const el = document.createElement('button');
        el.className = 'flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/95 px-2 py-1 text-[11px] font-semibold text-ink shadow-[0_4px_12px_rgba(20,30,70,0.3)]';
        el.innerHTML = '<span data-d class="h-2 w-2 rounded-full"></span><span data-a></span><span data-b class="font-medium text-muted"></span>';
        el.addEventListener('click', (e) => { e.stopPropagation(); handlers.current.onPick?.(st.id); controls.current.focus?.(st.id); });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); handlers.current.onInspect?.(st.id); });
        const at = w.sites[st.id];
        m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -34], opacityWhenCovered: '1' }).setLngLat([at.lon, at.lat]).addTo(map);
        markers.current[st.id] = m;
      }
      const el = m.getElement();
      const fc = live.forecast.stations?.[st.id];
      const eta = tauStep === 0 && fc?.arrival_s > 0 ? `ETA ${Math.round(fc.arrival_s / 60)} min` : '';
      el.querySelector('[data-a]').textContent = st.id;
      el.querySelector('[data-b]').textContent = closed ? 'Closed' : eta || `WQHI ${st.wqhi.score}`;
      el.querySelector('[data-d]').style.background = color;
      el.style.outline = st.id === selectedId ? '2px solid #2f5be7' : 'none';
    }
  }, [live, atTime, tauStep, selectedId, ready, staticData, controls]);

  /* ---------------- crew ---------------- */
  useEffect(() => {
    const w = world.current;
    if (!w || !ready || !live) return;
    const st = crewTask ? live.stations.find((s) => s.id === crewTask.station) : null;
    w.crewState.goal = st ? w.nearestRoute(st.lon, st.lat) : w.crewState.goal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewTask, ready]);

  /* ---------------- layers ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('buildings', layers.buildings !== false);
    vis('roads', layers.labels !== false);
    vis('places', layers.labels !== false);
    vis('streams', layers.streams !== false);
    vis('catchment', layers.catchment !== false);
    vis('pipes', layers.pipes !== false);
    if (world.current) world.current.riverUniforms.uFlow.value = layers.particles !== false ? 1.1 : 0;
  }, [layers, ready]);

  /* ---------------- rasters ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drape = (id, grid, ramp, on, opacity) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      if (!on || !grid) return;
      const key = `${id}Data`;
      if (map[key] === grid.data) return;
      map[key] = grid.data;
      const url = rasterUrl(grid, ramp);
      const coordinates = [[grid.west, grid.north], [grid.east, grid.north], [grid.east, grid.south], [grid.west, grid.south]];
      const src = map.getSource(id);
      if (src) { src.updateImage({ url, coordinates }); return; }
      map.addSource(id, { type: 'image', url, coordinates });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity } }, 'catchment');
    };
    drape('heat', heatmap, riskRamp, layers.heatmap && tauStep === 0, 0.8);
    drape('floodmap', floodmap, floodRamp, Boolean(layers.flood), 0.8);
  }, [heatmap, floodmap, layers.heatmap, layers.flood, tauStep, ready]);

  /* ---------------- rain ---------------- */
  useEffect(() => {
    const c = rainCanvas.current;
    if (!c) return undefined;
    const g = c.getContext('2d');
    const drops = Array.from({ length: 340 }, () => [Math.random(), Math.random(), 0.7 + Math.random() * 0.6]);
    let raf;
    const step = () => {
      raf = requestAnimationFrame(step);
      const amount = world.current?.rain ?? 0;
      if (c.width !== c.clientWidth) { c.width = c.clientWidth; c.height = c.clientHeight; }
      g.clearRect(0, 0, c.width, c.height);
      if (amount < 0.03) return;
      g.fillStyle = `rgba(30,50,80,${0.2 * amount})`;
      g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = `rgba(215,232,255,${0.5 * amount})`;
      g.lineWidth = 1.1;
      g.beginPath();
      for (const d of drops) {
        d[1] += 0.022 * d[2];
        d[0] -= 0.003 * d[2];
        if (d[1] > 1) { d[1] = 0; d[0] = Math.random() * 1.1; }
        if (d[0] < 0) d[0] = 1;
        const [x, y] = [d[0] * c.width, d[1] * c.height];
        g.moveTo(x, y); g.lineTo(x - 3.5 * d[2], y + 17 * d[2]);
      }
      g.stroke();
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#dfe8ff]">
      {/* inline style: MapLibre's stylesheet sets position: relative, which would collapse this box */}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={rainCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
