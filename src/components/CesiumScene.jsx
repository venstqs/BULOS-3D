import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { Layers, Pause, Play, Plane, RotateCcw, X } from 'lucide-react';
import { get, usePoll } from '../api';
import { BAND, MAINT, stationStatus } from '../lib/format';
import { AHEAD_S, PAST_S, exposure, fmtOffset, riverAt, stationsAt } from '../lib/twinField';

const ESRI_IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TERRAIN = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;

const EXAGGERATION = 1.6;       // terrain relief, so Isarog reads as a mountain from far away
const lift = (z, m) => z * EXAGGERATION + m;
// On-screen flow speed in metres per second. Real river speed (about 1 m/s) would look frozen
// from this height, so the display is sped up. Relative speeds between reaches stay real.
const SHOW_RIVER = 900;
const SHOW_STREAM = 480;
const SHOW_PIPE = 620;
const SLIDER_STEP = 300;
const REPLAY_S = 24;            // one pass of the time slider

/* Single-hue risk ramp (light, transparent -> dark, opaque red). */
function riskRGBA(v) {
  const t = Math.min(1, Math.max(0, v));
  const a = t < 0.04 ? 0 : Math.round(40 + 190 * t ** 0.8);
  return [Math.round(250 - 60 * t), Math.round(200 - 170 * t), Math.round(120 - 90 * t), a];
}

/* Low ground beside the river: pale to deep blue. */
function floodRGBA(v) {
  const t = Math.min(1, Math.max(0, v));
  const a = t < 0.12 ? 0 : Math.round(50 + 170 * t);
  return [Math.round(120 - 95 * t), Math.round(190 - 110 * t), 245, a];
}

/* Turbidity excess (NTU) -> water colour: clear blue to sediment brown. */
function waterColor(excess, orpDeficit, out = new Cesium.Color()) {
  const t = Math.min(1, excess / 30);
  const o = Math.min(1, orpDeficit / 150);
  out.red = Math.min(1, 0.25 + 0.6 * t + 0.3 * o);
  out.green = Math.max(0, 0.72 - 0.3 * t - 0.45 * o);
  out.blue = Math.max(0, 1 - 0.8 * t - 0.5 * o);
  out.alpha = 0.97;
  return out;
}

function pinCanvas(color, label, selected) {
  const c = document.createElement('canvas');
  const s = 64;
  c.width = s; c.height = s + 18;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(s / 2, s / 2, selected ? 22 : 18, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = selected ? 5 : 3;
  g.strokeStyle = selected ? '#0b4f8a' : '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 15px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, s / 2, s / 2 + 1);
  return c;
}

function ringCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.lineWidth = 9;
  g.strokeStyle = '#ffffff';
  g.stroke();
  return c;
}

function barCanvas() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const g = c.getContext('2d');
  const fade = g.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgba(255,255,255,0.6)');
  fade.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 16, 128);
  return c;
}

const PIPE_COLOR = {
  LOW: Cesium.Color.fromCssColorString('#ffffff'),
  MODERATE: Cesium.Color.fromCssColorString('#fab219'),
  HIGH: Cesium.Color.fromCssColorString('#ec835a'),
  SEVERE: Cesium.Color.fromCssColorString('#d03b3b'),
};
const STREAM_DOT = Cesium.Color.fromCssColorString('#d9f0ff');
const STATUS_GLYPH = new Map([[BAND.LOW, '✓'], [BAND.MODERATE, '!'], [BAND.HIGH, '!!'], [BAND.SEVERE, '✕'], [MAINT, '⚙']]);
const bandOf = (r) => (r >= 0.6 ? 'SEVERE' : r >= 0.45 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW');

const RAIN_SHADER = `
uniform sampler2D colorTexture;
uniform float amount;
uniform float time;
in vec2 v_textureCoordinates;
float hash(float x) { return fract(sin(x * 133.3) * 13.13); }
void main() {
  vec2 res = czm_viewport.zw;
  vec2 uv = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y);
  float s = sin(0.18), c = cos(0.18);
  uv *= mat2(c, -s, s, c);
  uv *= length(uv + vec2(0.0, 4.9)) * 0.3 + 1.0;
  float v = 1.0 - sin(hash(floor(uv.x * 100.0)) * 2.0);
  float b = clamp(abs(sin(20.0 * time * v + uv.y * (5.0 / (2.0 + v)))) - 0.95, 0.0, 1.0) * 20.0;
  vec4 scene = texture(colorTexture, v_textureCoordinates);
  vec3 storm = scene.rgb * mix(1.0, 0.72, amount);
  out_FragColor = vec4(mix(storm, vec3(0.75, 0.84, 0.95), clamp(v * b * amount * 0.55, 0.0, 1.0)), 1.0);
}`;

/** A path with distances and precomputed positions, for cheap per-frame lookups. */
function makePath(coords, liftM, extra) {
  const dist = new Float64Array(coords.length);
  for (let k = 1; k < coords.length; k += 1) {
    const [a, b] = [coords[k - 1], coords[k]];
    dist[k] = dist[k - 1] + Math.hypot((b[0] - a[0]) * 107_700, (b[1] - a[1]) * 111_320);
  }
  const cart = coords.map(([lo, la, z]) => Cesium.Cartesian3.fromDegrees(lo, la, lift(z, liftM)));
  return { dist, cart, len: dist[dist.length - 1], ...extra };
}

function indexAt(dist, s) {
  let lo = 0;
  let hi = dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= s) lo = mid; else hi = mid;
  }
  return lo;
}

function placeAt(path, s, out) {
  const k = indexAt(path.dist, s);
  const f = (s - path.dist[k]) / Math.max(1, path.dist[k + 1] - path.dist[k]);
  Cesium.Cartesian3.lerp(path.cart[k], path.cart[k + 1], Math.min(1, Math.max(0, f)), out);
  return k;
}

const CATALOGUE = [
  ['Hazard', [['heatmap', 'Contamination risk'], ['flood', 'Flood-prone ground']]],
  ['Water', [['particles', 'River and pipe flow'], ['streams', 'Streams'], ['pipes', 'Gravity pipelines']]],
  ['Context', [['columns', 'Risk columns'], ['catchment', 'Watershed boundary']]],
];

function LayerPanel({ layers, setLayers, onClose }) {
  return (
    <div className="absolute right-2 top-12 z-10 max-h-[calc(100%-132px)] w-[218px] overflow-y-auto rounded-2xl bg-white/95 p-3 text-xs text-ink-2 shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-ink">Layers</span>
        <button onClick={onClose} aria-label="Close layers" className="rounded p-0.5 hover:bg-panel-2"><X size={14} /></button>
      </div>
      {CATALOGUE.map(([group, items]) => (
        <div key={group} className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{group}</div>
          {items.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={Boolean(layers[k])} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className="h-3.5 w-3.5 accent-[#2f5be7]" />
              {label}
            </label>
          ))}
        </div>
      ))}
      <div className="mt-3 border-t border-line pt-2">
        <div className="h-1.5 rounded" style={{ background: 'linear-gradient(90deg, rgb(64,184,255), rgb(150,120,90), rgb(190,30,30))' }} />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted"><span>clean water</span><span>polluted</span></div>
        {layers.flood && (
          <p className="mt-2 text-[10px] leading-snug text-muted">
            Flood-prone ground is our estimate from the 90 m elevation model. It is not an official hazard map.
          </p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-muted">Flow is sped up so it can be seen, and terrain height is exaggerated 1.6×.</p>
      </div>
    </div>
  );
}

export default function CesiumScene({ staticData, live, forecast, heatmap, selectedId, onSelect, onInspect, layers, setLayers }) {
  const host = useRef(null);
  const viewerRef = useRef(null);
  const refs = useRef({});
  const [fatal, setFatal] = useState(null);
  const [tau, setTau] = useState(0);                 // seconds from now on the time slider
  const [playing, setPlaying] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [touring, setTouring] = useState(false);
  const [history, setHistory] = useState(null);
  const { data: floodmap } = usePoll(layers.flood ? '/api/heatmap?index=flood' : null, 15000);
  if (fatal) throw fatal;                            // hand WebGL failures to the error boundary

  /* ---------------- viewer ---------------- */
  useEffect(() => {
    let viewer;
    try {
      viewer = new Cesium.Viewer(host.current, {
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
        sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
        selectionIndicator: false, requestRenderMode: false, showRenderLoopErrors: false,
        baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
          url: ESRI_IMAGERY, maximumLevel: 18, credit: 'Imagery © Esri, Maxar, Earthstar Geographics',
        })),
      });
    } catch (e) {
      setFatal(new Error(`3D map could not start (${e.message}). WebGL may be disabled or the graphics driver crashed.`));
      return undefined;
    }
    viewer.scene.renderError.addEventListener((_scene, err) => setFatal(new Error(`3D map rendering failed: ${err?.message ?? err}`)));
    viewer.targetFrameRate = 30;
    viewer.bottomContainer.style.bottom = '74px';    // keep attribution visible above the time bar
    const { scene } = viewer;
    scene.verticalExaggeration = EXAGGERATION;
    // Overlays come from a 90 m DEM and the imagery terrain differs by metres, so testing them
    // against the terrain would cut the rivers into fragments.
    scene.globe.depthTestAgainstTerrain = false;
    scene.globe.enableLighting = false;
    scene.skyAtmosphere.show = true;
    scene.fog.enabled = true;
    viewerRef.current = viewer;

    const rain = new Cesium.PostProcessStage({
      fragmentShader: RAIN_SHADER,
      uniforms: { amount: () => refs.current.rainAmount ?? 0, time: () => performance.now() / 1000 / 2.4 },
    });
    rain.enabled = false;
    scene.postProcessStages.add(rain);
    refs.current.rain = rain;

    if (ION_TOKEN) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN;
      scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
    } else {
      Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ESRI_TERRAIN)
        .then((tp) => { if (!viewer.isDestroyed()) viewer.terrainProvider = tp; })
        .catch((e) => console.warn('terrain unavailable, using ellipsoid', e));
    }

    const stationAt = (pos) => scene.pick(pos)?.id?.properties?.stationId?.getValue?.();
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e) => {
      const id = stationAt(e.position);
      if (id) refs.current.onSelect?.(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e) => {
      const id = stationAt(e.position);
      if (id) refs.current.onInspect?.(id);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction(() => refs.current.stopTour?.(), Cesium.ScreenSpaceEventType.LEFT_DOWN);
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      viewerRef.current = null;
      refs.current = {};                             // drop handles that belong to this viewer
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => { refs.current.onSelect = onSelect; refs.current.onInspect = onInspect; }, [onSelect, onInspect]);

  /* ---------------- static hydro layers (DEM products) ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !staticData) return undefined;
    const { catchment, streams, main_stem: stem } = staticData;
    const { scene } = viewer;

    // Side-on to the river, so the water points spread across the view instead of stacking
    const [hLon, hLat] = stem[0];
    const [oLon, oLat] = stem.at(-1);
    const mLon = 111_320 * Math.cos(Cesium.Math.toRadians((hLat + oLat) / 2));
    const ex = (hLon - oLon) * mLon;
    const ny = (hLat - oLat) * 111_320;
    const len = Math.hypot(ex, ny);
    const bearing = Math.atan2(ex, ny);
    const side = bearing - Math.PI / 2;
    // Narrow boxes need a longer view for the whole river to fit across them
    const fit = Math.max(1, (1.12 / (scene.canvas.clientWidth / Math.max(1, scene.canvas.clientHeight))) ** 0.8);
    const cLon = hLon * 0.44 + oLon * 0.56;          // nudged toward the outlet so RH-05's label fits
    const cLat = hLat * 0.44 + oLat * 0.56;
    const home = {
      destination: Cesium.Cartesian3.fromDegrees(
        cLon - (Math.sin(side) * len * 0.58 * fit) / mLon, cLat - (Math.cos(side) * len * 0.58 * fit) / 111_320, 0.66 * len * fit),
      orientation: { heading: side, pitch: Cesium.Math.toRadians(-44), roll: 0 },
    };
    viewer.camera.setView(home);
    Object.assign(refs.current, { bearing, mLon, home: () => viewer.camera.flyTo({ ...home, duration: 1.2 }) });

    const boundary = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(catchment.ring.flat()),
        clampToGround: true, width: 2.5,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.WHITE.withAlpha(0.85), dashLength: 14 }),
      },
    });

    const lines = scene.primitives.add(new Cesium.PolylineCollection());
    const heights = (coords, m) => Cesium.Cartesian3.fromDegreesArrayHeights(coords.flatMap(([lo, la, z]) => [lo, la, lift(z, m)]));
    const tribs = streams.filter((s) => s.area_km2 >= 0.35).map((s) => lines.add({
      positions: heights(s.coords, 8),
      width: Math.min(4, 1.2 + Math.sqrt(s.area_km2)),
      material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#8fd0ff').withAlpha(0.7) }),
    }));

    // One material per polyline: a polyline destroys its material, so they cannot be shared
    const glowMaterial = () => Cesium.Material.fromType('PolylineGlow', { color: Cesium.Color.fromCssColorString('#ff5a36'), glowPower: 0.25, taperPower: 1 });
    const glowLines = scene.primitives.add(new Cesium.PolylineCollection());
    const stemSegs = [];
    const glowSegs = [];
    for (let i = 0; i < stem.length - 1; i += 1) {
      const pair = [stem[i], stem[i + 1]];
      stemSegs.push(lines.add({ positions: heights(pair, 10), width: 6, material: Cesium.Material.fromType('Color', { color: waterColor(0, 0) }) }));
      glowSegs.push(glowLines.add({ positions: heights(pair, 11), width: 22, show: false, material: glowMaterial() }));
    }

    const pipeLines = scene.primitives.add(new Cesium.PolylineCollection());
    for (const pipe of staticData.pipes ?? []) {
      pipeLines.add({
        positions: heights(pipe.coords, 6), width: 3,
        material: Cesium.Material.fromType('PolylineDash', { color: Cesium.Color.WHITE.withAlpha(0.9), gapColor: Cesium.Color.fromCssColorString('#2f5be7').withAlpha(0.6), dashLength: 12 }),
      });
    }

    // Comet-tailed flow particles on the river, the larger streams and the pipelines
    const pts = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const main = makePath(stem, 13, { main: true });
    const paths = [main]
      .concat(streams.filter((s) => s.area_km2 >= 1).map((s) => makePath(s.coords, 11, {})))
      .concat((staticData.pipes ?? []).map((p) => makePath(p.coords, 9, { pipe: p.id })));
    const particles = [];
    for (const p of paths) {
      const n = Math.max(2, Math.round(p.len / (p.main ? 260 : p.pipe ? 420 : 620)));
      const head = p.main ? 7 : p.pipe ? 6 : 4;
      for (let k = 0; k < n; k += 1) {
        particles.push({
          path: p, s: (k / n) * p.len,
          prims: [1, 0.55, 0.25].map((a, j) => ({ a, gap: j * (p.main ? 75 : 50), prim: pts.add({ pixelSize: Math.max(2, head - j * 1.5), color: Cesium.Color.WHITE }) })),
        });
      }
    }

    const front = viewer.entities.add({
      show: false,
      position: new Cesium.CallbackPositionProperty(() => refs.current.frontPos, false),
      point: { pixelSize: 13, color: Cesium.Color.fromCssColorString('#ff5a36'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: 'Plume front', font: '700 11px Inter, system-ui', fillColor: Cesium.Color.WHITE, showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#c43b1f').withAlpha(0.92), pixelOffset: new Cesium.Cartesian2(0, 20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    const gauge = staticData.rain_gauge;
    const gaugeEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(gauge.lon, gauge.lat),
      billboard: {
        image: pinCanvas('#3987e5', '☂', false), scale: 0.42, verticalOrigin: Cesium.VerticalOrigin.CENTER,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    Object.assign(refs.current, { boundary, lines, tribs, stemSegs, glowSegs, glowLines, pipeLines, pts, particles, main, front, frontPos: main.cart[0].clone(), frontS: null });
    return () => {
      // the viewer's own cleanup may already have destroyed it (it runs first on unmount)
      if (viewer.isDestroyed()) return;
      viewer.entities.remove(boundary);
      viewer.entities.remove(gaugeEntity);
      viewer.entities.remove(front);
      for (const c of [lines, glowLines, pipeLines, pts]) scene.primitives.remove(c);
      refs.current.particles = null;
      refs.current.stemSegs = null;
    };
  }, [staticData]);

  /* ---------------- per-frame animation ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;
    let last = performance.now();
    const spot = new Cesium.Cartesian3();
    const tint = new Cesium.Color();
    const onTick = () => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const r = refs.current;
      if (!r.particles) return;

      if (r.pts?.show) {
        for (const q of r.particles) {
          const { path } = q;
          const k = indexAt(path.dist, q.s);
          const pipe = path.pipe ? r.pipes?.[path.pipe] : null;
          let show = SHOW_STREAM;
          if (pipe) show = pipe.flowing ? SHOW_PIPE * Math.min(1.4, 0.6 + pipe.velocity_mps) : 0;
          else if (path.main) show = SHOW_RIVER * Math.min(1.6, Math.max(0.5, (r.velocity?.[k] ?? 1)));
          q.s = (q.s + show * dt) % path.len;
          const hidden = (path.pipe && (!pipe?.flowing || r.layerPipes === false)) || (!path.main && !path.pipe && r.layerStreams === false);
          for (const t of q.prims) {
            t.prim.show = !hidden;
            if (hidden) continue;
            const s = (q.s - t.gap + path.len) % path.len;
            const idx = placeAt(path, s, spot);
            t.prim.position = spot;
            if (pipe) Cesium.Color.clone(PIPE_COLOR[pipe.source_band] ?? PIPE_COLOR.LOW, tint);
            else if (path.main && r.field) waterColor(r.field.turb[idx] ?? 0, r.field.orp[idx] ?? 0, tint).brighten(0.3, tint);
            else Cesium.Color.clone(STREAM_DOT, tint);
            tint.alpha = t.a;
            t.prim.color = tint;
          }
        }
      }

      if (r.glowActive) {
        const power = 0.18 + 0.1 * Math.sin(now / 280);
        for (const g of r.glowSegs) if (g.show) g.material.uniforms.glowPower = power;
      }

      if (r.frontTarget != null && r.main) {
        r.frontS = r.frontS == null ? r.frontTarget : r.frontS + (r.frontTarget - r.frontS) * Math.min(1, dt * 2.5);
        placeAt(r.main, r.frontS, r.frontPos);
      }
    };
    viewer.scene.preUpdate.addEventListener(onTick);
    return () => { if (!viewer.isDestroyed()) viewer.scene.preUpdate.removeEventListener(onTick); };
  }, []);

  /* ---------------- time slider ---------------- */
  useEffect(() => {
    if (tau >= 0 || !live) return undefined;         // recorded readings load only when someone looks back
    let alive = true;
    const load = () => Promise.all(live.stations.map((s) => get(`/api/history/${s.id}?minutes=${PAST_S / 60}`).then((h) => [s.id, h.series])))
      .then((rows) => { if (alive) setHistory(Object.fromEntries(rows)); }).catch(() => {});
    if (!history) load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tau < 0, Boolean(live)]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTau((t) => {
        const next = t + (dt / REPLAY_S) * (PAST_S + AHEAD_S);
        if (next >= AHEAD_S) { setPlaying(false); return AHEAD_S; }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const tauStep = Math.round(tau / SLIDER_STEP) * SLIDER_STEP;   // the data has 5-minute resolution
  const atTime = useMemo(() => (live ? stationsAt(tauStep, live, forecast, history) : null), [tauStep, live, forecast, history]);

  /* ---------------- river state ---------------- */
  useEffect(() => {
    if (!live || !atTime) return;
    const r = refs.current;
    r.pipes = Object.fromEntries((live.pipes ?? []).map((p) => [p.id, p]));
    const v = live.channel.velocity_mps;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    r.velocity = v.map((x) => x / mean);
    const field = riverAt(tauStep, live, atTime);
    r.field = field;
    const { stemSegs, glowSegs, main, front } = r;
    if (!stemSegs) return;
    let lastDirty = -1;
    let dirty = false;
    stemSegs.forEach((seg, i) => {
      const t = field.turb[i] ?? 0;
      const o = field.orp[i] ?? 0;
      seg.material.uniforms.color = waterColor(t, o);
      seg.width = 5 + Math.min(5, live.channel.discharge_m3s[i] / 6);
      const bad = t > 3 || o > 25;
      glowSegs[i].show = bad;
      if (bad) { lastDirty = i; dirty = true; }
    });
    r.glowActive = dirty;
    const reachesEnd = lastDirty >= stemSegs.length - 2;
    r.frontTarget = dirty && !reachesEnd ? main.dist[lastDirty] : null;
    if (!r.frontTarget) r.frontS = null;
    front.show = r.frontTarget != null;
    const rainNow = atTime[live.stations[0].id]?.rain ?? 0;
    r.rainAmount = Math.min(1, rainNow / 30);
    r.rain.enabled = rainNow > 0.5;
  }, [live, atTime, tauStep, staticData]);

  /* ---------------- water points: pins, rings, columns ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !live || !atTime) return;
    const r = refs.current;
    const pins = r.pins ?? (r.pins = {});
    const ring = r.ringImage ?? (r.ringImage = ringCanvas());
    const bar = r.barImage ?? (r.barImage = barCanvas());
    for (const st of live.stations) {
      const risk = atTime[st.id]?.risk ?? st.risk;
      const shown = tauStep === 0 ? st : { ...st, risk_band: bandOf(risk), classification: 'NORMAL', edge_state: 'NORMAL' };
      const status = stationStatus(shown);
      const color = Cesium.Color.fromCssColorString(status.color);
      const key = `${status.label}|${st.id === selectedId}`;
      let e = pins[st.id];
      if (!e) {
        const pulse = { color, on: false, phase: Math.random() };
        // A billboard, not 3D geometry: entity geometry rebuilds too slowly to follow live data
        const column = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(st.lon, st.lat),
          billboard: {
            image: bar, width: 12, height: 10, color, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        const halo = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(st.lon, st.lat),
          billboard: {
            image: ring, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: new Cesium.CallbackProperty(() => 0.3 + ((performance.now() / 1500 + pulse.phase) % 1) * 0.75, false),
            color: new Cesium.CallbackProperty(() => pulse.color.withAlpha(1 - ((performance.now() / 1500 + pulse.phase) % 1)), false),
          },
        });
        e = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(st.lon, st.lat),
          properties: { stationId: st.id },
          billboard: {
            verticalOrigin: Cesium.VerticalOrigin.CENTER, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.72,
          },
          label: {
            font: '600 12.5px Inter, system-ui', fillColor: Cesium.Color.fromCssColorString('#14212b'),
            // alternate above and below so neighbouring labels do not collide
            style: Cesium.LabelStyle.FILL, pixelOffset: new Cesium.Cartesian2(0, live.stations.indexOf(st) % 2 ? 30 : -32),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.92),
          },
        });
        Object.assign(e, { _column: column, _halo: halo, _pulse: pulse });
        pins[st.id] = e;
      }
      if (e._key !== key) {
        e._key = key;
        e.billboard.image = pinCanvas(status.color, STATUS_GLYPH.get(status) ?? '', st.id === selectedId);
      }
      const closed = tauStep === 0 && st.valve && !st.valve.open;
      e._pulse.color = color;
      e._halo.show = risk >= 0.25 || Boolean(closed);
      e._column.billboard.height = 14 + risk * 120;
      e._column.billboard.color = color;
      e._column.show = layers.columns !== false && risk >= 0.1;
      const fc = live.forecast.stations?.[st.id];
      const eta = tauStep === 0 && fc?.arrival_s > 0 ? ` · ETA ${Math.round(fc.arrival_s / 60)} min` : '';
      e.label.text = `${st.id}${closed ? ' · closed' : ''}${eta}`;
    }
  }, [live, atTime, tauStep, selectedId, layers.columns]);

  /* ---------------- rasters draped on terrain ---------------- */
  const drape = useCallback((key, grid, ramp, alpha, show) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const r = refs.current;
    const old = r[key];
    if (!show || !grid) {
      if (old) old.show = false;
      if (!grid && old) { viewer.imageryLayers.remove(old); r[key] = null; r[`${key}Data`] = null; }
      return;
    }
    if (r[`${key}Data`] === grid.data) {             // unchanged: no rebuild, no flicker
      if (old) old.show = true;
      return;
    }
    r[`${key}Data`] = grid.data;
    const { nrows, ncols, data, north, south, west, east } = grid;
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = ncols; canvas.height = nrows;
    const g = canvas.getContext('2d');
    const img = g.createImageData(ncols, nrows);
    for (let i = 0; i < bytes.length; i += 1) img.data.set(bytes[i] ? ramp((bytes[i] - 1) / 254) : [0, 0, 0, 0], i * 4);
    g.putImageData(img, 0, 0);
    const half = (north - south) / (nrows - 1) / 2;
    const rectangle = Cesium.Rectangle.fromDegrees(west - half, south - half, east + half, north + half);
    Cesium.SingleTileImageryProvider.fromUrl(canvas.toDataURL(), { rectangle }).then((prov) => {
      if (viewer.isDestroyed()) return;
      const layer = viewer.imageryLayers.addImageryProvider(prov);
      layer.alpha = alpha;
      if (r[key]) viewer.imageryLayers.remove(r[key]);
      r[key] = layer;
    });
  }, []);

  useEffect(() => { drape('heat', heatmap, riskRGBA, 0.85, layers.heatmap && tauStep === 0); }, [drape, heatmap, layers.heatmap, tauStep]);
  useEffect(() => { drape('floodLayer', layers.flood ? floodmap : null, floodRGBA, 0.8, layers.flood); }, [drape, floodmap, layers.flood]);

  /* ---------------- layer toggles ---------------- */
  useEffect(() => {
    const r = refs.current;
    if (r.pts) r.pts.show = layers.particles;
    if (r.tribs) r.tribs.forEach((l) => { l.show = layers.streams; });
    if (r.boundary) r.boundary.show = layers.catchment;
    if (r.pipeLines) r.pipeLines.show = layers.pipes !== false;
    r.layerPipes = layers.pipes !== false;
    r.layerStreams = layers.streams;
  }, [layers, staticData]);

  /* ---------------- fly to a selected point ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    const st = live?.stations.find((s) => s.id === selectedId);
    if (!viewer || !st || refs.current.flownTo === selectedId) return;
    refs.current.flownTo = selectedId;
    if (!refs.current.firstFly) { refs.current.firstFly = true; return; }
    const { bearing = 0, mLon = 108_000 } = refs.current;
    const back = 2600;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        st.lon - (Math.sin(bearing) * back) / mLon, st.lat - (Math.cos(bearing) * back) / 111_320, lift(st.elevation_m, 1900)),
      orientation: { heading: bearing + Math.PI, pitch: Cesium.Math.toRadians(-38), roll: 0 },
      duration: 1.4,
    });
  }, [selectedId, live]);

  /* ---------------- fly down the river ---------------- */
  const stopTour = useCallback(() => {
    const r = refs.current;
    if (!r.tourOff) return;
    r.tourOff();
    r.tourOff = null;
    setTouring(false);
  }, []);
  useEffect(() => { refs.current.stopTour = stopTour; }, [stopTour]);

  const startTour = useCallback(() => {
    const viewer = viewerRef.current;
    const stem = staticData?.main_stem;
    if (!viewer || !stem || refs.current.tourOff) return;
    const { main } = refs.current;
    const t0 = performance.now();
    const seconds = 34;
    const coordAt = (s) => stem[indexAt(main.dist, Math.min(main.len - 1, Math.max(0, s)))];
    const step = () => {
      const f = (performance.now() - t0) / 1000 / seconds;
      if (f >= 1) { stopTour(); refs.current.home?.(); return; }
      const s = f * main.len * 0.97;
      const [lo, la, z] = coordAt(s);
      const [lo2, la2] = coordAt(s + 2600);
      const [lo0, la0] = coordAt(s - 2600);
      const heading = Math.atan2((lo2 - lo0) * 107_700, (la2 - la0) * 111_320);
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lo - (Math.sin(heading) * 2400) / 107_700, la - (Math.cos(heading) * 2400) / 111_320, lift(z, 1250)),
        orientation: { heading, pitch: Cesium.Math.toRadians(-27), roll: 0 },
      });
    };
    refs.current.tourOff = viewer.scene.preRender.addEventListener(step);
    setTouring(true);
  }, [staticData, stopTour]);

  const live0 = tauStep === 0;
  const danger = live ? exposure(live) : null;
  const syncedS = live ? Math.max(0, Math.round((live.clock.t - Math.max(...live.stations.map((s) => s.link?.last_seen_t ?? 0))) / Math.max(1, live.clock.speed))) : null;
  const source = live?.live_nodes?.length ? 'real node + virtual field' : live?.clock.mode === 'sim' ? 'virtual field' : 'field sensors';
  const iconBtn = 'flex h-8 items-center gap-1.5 rounded-xl bg-white/95 px-2.5 text-xs font-medium text-ink-2 shadow-sm backdrop-blur hover:text-civic';

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />

      <div className="pointer-events-none absolute left-2 top-2 z-10 grid max-w-[58%] justify-items-start gap-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm ${live0 ? 'bg-[#0b7a43]' : tauStep > 0 ? 'bg-[#2f5be7]' : 'bg-[#4a5a6a]'}`}>
          <span className={`h-1.5 w-1.5 rounded-full bg-white ${live0 ? 'animate-pulse' : ''}`} />
          {live0 ? 'LIVE' : tauStep > 0 ? `FORECAST ${fmtOffset(tauStep)}` : `REPLAY ${fmtOffset(tauStep)}`}
        </span>
        {live0 && live && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-ink-2 shadow-sm">Synced {syncedS} s ago · {source}</span>}
        {live0 && danger?.points > 0 && (
          <span className="rounded-xl bg-[#a32626]/95 px-2.5 py-1 text-[11px] font-semibold leading-tight text-white shadow-sm">
            {danger.people.toLocaleString()} people in the path
            {danger.next && <span className="block font-normal">Next: {danger.next.id} in {Math.round(danger.next.s / 60)} min</span>}
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        {setLayers && <button onClick={() => setShowLayers((v) => !v)} className={iconBtn} aria-label="Layers"><Layers size={14} /> Layers</button>}
        <button onClick={touring ? stopTour : startTour} className={iconBtn} aria-label="Fly the river"><Plane size={14} /> {touring ? 'Stop' : 'Fly'}</button>
        <button onClick={() => { stopTour(); refs.current.home?.(); }} className={iconBtn} aria-label="Reset view"><RotateCcw size={14} /></button>
      </div>
      {showLayers && setLayers && <LayerPanel layers={layers} setLayers={setLayers} onClose={() => setShowLayers(false)} />}

      <div className="absolute inset-x-2 bottom-2 z-10 rounded-2xl bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (!playing && tau >= AHEAD_S - SLIDER_STEP) setTau(-PAST_S); else if (!playing && tau === 0) setTau(-PAST_S); setPlaying((p) => !p); }}
            aria-label={playing ? 'Pause' : 'Play the last 6 hours and next 4 hours'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2f5be7] text-white"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <input
            type="range" min={-PAST_S} max={AHEAD_S} step={SLIDER_STEP} value={tauStep} aria-label="Time"
            onChange={(e) => { setPlaying(false); setTau(Number(e.target.value)); }}
            className="min-w-0 flex-1 accent-[#2f5be7]"
          />
          <button
            onClick={() => { setPlaying(false); setTau(0); }} disabled={live0}
            className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2 disabled:opacity-40"
          >
            Now
          </button>
        </div>
        <div className="relative mt-0.5 h-3 pl-9 pr-11 text-[10px] text-muted">
          <div className="relative h-full">
            <span className="absolute left-0">−6 h recorded</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${(PAST_S / (PAST_S + AHEAD_S)) * 100}%` }}>now</span>
            <span className="absolute right-0">+4 h forecast</span>
          </div>
        </div>
      </div>
    </div>
  );
}
