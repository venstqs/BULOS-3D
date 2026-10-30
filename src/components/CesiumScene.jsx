import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { BAND, MAINT, stationStatus } from '../lib/format';

const ESRI_IMAGERY = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_TERRAIN = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN;
const LINE_LIFT_M = 6;          // draw hydro lines slightly above the 90 m DEM surface

/* Single-hue risk ramp (light, transparent -> dark, opaque red). */
function riskRGBA(v) {
  const t = Math.min(1, Math.max(0, v));
  const r = Math.round(250 - 60 * t);
  const g = Math.round(200 - 170 * t);
  const b = Math.round(120 - 90 * t);
  const a = t < 0.04 ? 0 : Math.round(40 + 190 * Math.pow(t, 0.8));
  return [r, g, b, a];
}

/* Turbidity excess (NTU) -> water colour: clear blue to sediment brown. */
function waterColor(excess, orpDeficit) {
  const t = Math.min(1, excess / 60);
  const o = Math.min(1, orpDeficit / 200);
  const r = 0.25 + 0.55 * t + 0.25 * o;
  const g = 0.65 - 0.25 * t - 0.35 * o;
  const b = 0.95 - 0.7 * t - 0.4 * o;
  return new Cesium.Color(Math.min(1, r), Math.max(0, g), Math.max(0, b), 0.95);
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

/* pipe water coloured by the source's contamination risk */
const PIPE_COLOR = {
  LOW: Cesium.Color.fromCssColorString('#ffffff'),
  MODERATE: Cesium.Color.fromCssColorString('#fab219'),
  HIGH: Cesium.Color.fromCssColorString('#ec835a'),
  SEVERE: Cesium.Color.fromCssColorString('#d03b3b'),
};

const STATUS_GLYPH = new Map([[BAND.LOW, '✓'], [BAND.MODERATE, '!'], [BAND.HIGH, '!!'], [BAND.SEVERE, '✕'], [MAINT, '⚙']]);

export default function CesiumScene({ staticData, live, heatmap, selectedId, onSelect, onInspect, layers }) {
  const host = useRef(null);
  const viewerRef = useRef(null);
  const refs = useRef({});
  const [fatal, setFatal] = useState(null);
  if (fatal) throw fatal;                       // hand WebGL failures to the error boundary

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
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.globe.enableLighting = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewerRef.current = viewer;

    if (ION_TOKEN) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN;
      viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
    } else {
      Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ESRI_TERRAIN)
        .then((tp) => { if (!viewer.isDestroyed()) viewer.terrainProvider = tp; })
        .catch((e) => console.warn('terrain unavailable, using ellipsoid', e));
    }

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.properties?.stationId?.getValue?.();
      if (id) refs.current.onSelect?.(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id?.properties?.stationId?.getValue?.();
      if (id) refs.current.onInspect?.(id);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      viewerRef.current = null;
      refs.current = {};                         // drop handles that belong to this viewer
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => { refs.current.onSelect = onSelect; refs.current.onInspect = onInspect; }, [onSelect, onInspect]);

  /* ---------------- static hydro layers (DEM products) ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !staticData) return undefined;
    const { catchment, streams, main_stem: stem, dem } = staticData;

    // Frame the main stem from the outlet side, looking upstream toward the mountain.
    const [hLon, hLat, hZ] = stem[0];
    const [oLon, oLat] = stem.at(-1);
    const mLon = 111_320 * Math.cos(Cesium.Math.toRadians((hLat + oLat) / 2));
    const ex = (hLon - oLon) * mLon;
    const ny = (hLat - oLat) * 111_320;
    const len = Math.hypot(ex, ny);
    const bearing = Math.atan2(ex, ny);
    refs.current.bearing = bearing;
    refs.current.mLon = mLon;
    const cLon = (hLon + oLon) / 2;
    const cLat = (hLat + oLat) / 2;
    const home = {
      destination: Cesium.Cartesian3.fromDegrees(
        cLon - (Math.sin(bearing) * len) / mLon, cLat - (Math.cos(bearing) * len) / 111_320, 0.55 * len + 0.4 * hZ),
      orientation: { heading: bearing, pitch: Cesium.Math.toRadians(-30), roll: 0 },
    };
    viewer.camera.setView(home);
    refs.current.home = () => viewer.camera.flyTo({ ...home, duration: 1.2 });

    const boundary = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(catchment.ring.flat()),
        clampToGround: true, width: 2.5,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.WHITE.withAlpha(0.85), dashLength: 14 }),
      },
    });

    const lines = viewer.scene.primitives.add(new Cesium.PolylineCollection());
    const tribs = streams.filter((s) => s.area_km2 >= 0.35).map((s) => lines.add({
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(s.coords.flatMap(([lo, la, z]) => [lo, la, z + LINE_LIFT_M])),
      width: Math.min(5, 1.2 + Math.sqrt(s.area_km2)),
      material: Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#7fc4ff').withAlpha(0.75) }),
    }));
    const stemSegs = [];
    for (let i = 0; i < stem.length - 1; i += 1) {
      const [lo1, la1, z1] = stem[i];
      const [lo2, la2, z2] = stem[i + 1];
      stemSegs.push(lines.add({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([lo1, la1, z1 + LINE_LIFT_M + 1, lo2, la2, z2 + LINE_LIFT_M + 1]),
        width: 6,
        material: Cesium.Material.fromType('Color', { color: waterColor(0, 0) }),
      }));
    }

    // flow particles: seeded along every drawn channel, advected at simulated velocity
    const pts = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const paths = [{ coords: stem.map(([lo, la, z, s]) => [lo, la, z, s]), main: true }]
      .concat(streams.filter((s) => s.area_km2 >= 0.6).map((s) => ({ coords: s.coords, main: false })));
    // gravity-fed pipelines (buried, drawn just above the terrain)
    const PIPE_LIFT_M = 4;
    for (const pipe of staticData.pipes ?? []) {
      lines.add({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(pipe.coords.flatMap(([lo, la, z]) => [lo, la, z + PIPE_LIFT_M])),
        width: 3,
        material: Cesium.Material.fromType('PolylineDash', { color: Cesium.Color.WHITE.withAlpha(0.9), gapColor: Cesium.Color.fromCssColorString('#2f5be7').withAlpha(0.6), dashLength: 12 }),
      });
      paths.push({ coords: pipe.coords.map(([lo, la, z]) => [lo, la, z - LINE_LIFT_M + PIPE_LIFT_M - 3]), pipe: pipe.id });
    }
    for (const p of paths) {
      if (p.main) continue;
      let acc = 0;
      p.coords = p.coords.map((c, k) => {
        if (k) {
          const [a, b] = [p.coords[k - 1], c];
          acc += Math.hypot((b[0] - a[0]) * 107_700, (b[1] - a[1]) * 111_320);
        }
        return [c[0], c[1], c[2], acc];
      });
    }
    const particles = [];
    for (const p of paths) {
      const len = p.coords.at(-1)[3];
      const n = Math.max(2, Math.round(len / (p.main ? 90 : p.pipe ? 150 : 240)));
      for (let k = 0; k < n; k += 1) {
        particles.push({ path: p, s: (k / n) * len, prim: pts.add({ pixelSize: p.main || p.pipe ? 5 : 3.5, color: Cesium.Color.WHITE }) });
      }
    }

    const gauge = staticData.rain_gauge;
    const gaugeEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(gauge.lon, gauge.lat),
      billboard: {
        image: pinCanvas('#3987e5', '☂', false), scale: 0.45, verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'DOST rain gauge', font: '600 11px system-ui', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, 14),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    Object.assign(refs.current, { boundary, lines, tribs, stemSegs, pts, particles, dem });
    return () => {
      // the viewer's own cleanup may already have destroyed it (it runs first on unmount)
      if (viewer.isDestroyed()) return;
      viewer.entities.remove(boundary);
      viewer.entities.remove(gaugeEntity);
      viewer.scene.primitives.remove(lines);
      viewer.scene.primitives.remove(pts);
      refs.current.particles = null;
      refs.current.stemSegs = null;
    };
  }, [staticData]);

  /* ---------------- particle animation ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return undefined;
    let last = performance.now();
    const onTick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { particles, channel, pipes = {}, speed = 60 } = refs.current;
      if (!particles) return;
      for (const q of particles) {
        const c = q.path.coords;
        const len = c.at(-1)[3];
        let k = 0;
        while (k < c.length - 2 && c[k + 1][3] < q.s) k += 1;
        const pipe = q.path.pipe ? pipes[q.path.pipe] : null;
        const v = pipe ? pipe.velocity_mps                      // telemetry-gated pipe flow (0 when stopped)
          : q.path.main && channel ? channel.velocity_mps[Math.min(k, channel.velocity_mps.length - 1)] : 0.6;
        q.s += v * speed * dt * 0.5;
        if (q.s >= len) q.s -= len;
        const a = c[k];
        const b = c[k + 1];
        const f = Math.min(1, Math.max(0, (q.s - a[3]) / Math.max(1, b[3] - a[3])));
        q.prim.position = Cesium.Cartesian3.fromDegrees(
          a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f + LINE_LIFT_M + 3);
        q.prim.color = pipe ? PIPE_COLOR[pipe.source_band] ?? PIPE_COLOR.LOW
          : q.path.main && channel
            ? waterColor(channel.turb_excess[k], channel.orp_deficit[k]).brighten(0.35, new Cesium.Color())
            : Cesium.Color.fromCssColorString('#d9f0ff');
        q.prim.show = !pipe || pipe.flowing;
      }
    };
    viewer.scene.preUpdate.addEventListener(onTick);
    return () => { if (!viewer.isDestroyed()) viewer.scene.preUpdate.removeEventListener(onTick); };
  }, []);

  /* ---------------- live: plume colouring, speed ---------------- */
  useEffect(() => {
    if (!live) return;
    refs.current.channel = live.channel;
    refs.current.pipes = Object.fromEntries((live.pipes ?? []).map((p) => [p.id, p]));
    refs.current.speed = live.clock.speed;
    const { stemSegs } = refs.current;
    if (!stemSegs) return;
    stemSegs.forEach((seg, i) => {
      seg.material.uniforms.color = waterColor(live.channel.turb_excess[i], live.channel.orp_deficit[i]);
      seg.width = 5 + Math.min(5, live.channel.discharge_m3s[i] / 6);
    });
  }, [live]);

  /* ---------------- station pins ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !live) return;
    const pins = refs.current.pins ?? (refs.current.pins = {});
    for (const st of live.stations) {
      const status = stationStatus(st);
      const key = `${status.label}|${st.id === selectedId}|${st.valve?.open}`;
      let e = pins[st.id];
      if (!e) {
        e = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(st.lon, st.lat),
          properties: { stationId: st.id },
          billboard: {
            verticalOrigin: Cesium.VerticalOrigin.CENTER, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 0.75,
          },
          label: {
            font: '600 12.5px Inter, system-ui', fillColor: Cesium.Color.fromCssColorString('#14212b'),
            style: Cesium.LabelStyle.FILL, pixelOffset: new Cesium.Cartesian2(0, -34),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.92),
          },
        });
        pins[st.id] = e;
      }
      if (e._key !== key) {
        e._key = key;
        e.billboard.image = pinCanvas(status.color, STATUS_GLYPH.get(status) ?? '', st.id === selectedId);
      }
      const valve = st.valve ? (st.valve.open ? ' · valve open' : ' · VALVE CLOSED') : '';
      const fc = live.forecast.stations?.[st.id];
      const eta = fc?.arrival_s > 0 ? ` · plume ETA ${Math.round(fc.arrival_s / 60)} min` : '';
      e.label.text = `${st.id}  ${status.label}${valve}${eta}`;
    }
  }, [live, selectedId]);

  /* ---------------- risk heatmap draped on terrain ---------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !heatmap) return;
    if (!layers.heatmap) {
      if (refs.current.heat) { viewer.imageryLayers.remove(refs.current.heat); refs.current.heat = null; }
      return;
    }
    const { nrows, ncols, data, north, south, west, east } = heatmap;
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = ncols; canvas.height = nrows;
    const g = canvas.getContext('2d');
    const img = g.createImageData(ncols, nrows);
    for (let i = 0; i < bytes.length; i += 1) {
      const rgba = bytes[i] ? riskRGBA((bytes[i] - 1) / 254) : [0, 0, 0, 0];
      img.data.set(rgba, i * 4);
    }
    g.putImageData(img, 0, 0);
    const half = (north - south) / (nrows - 1) / 2;
    const rect = Cesium.Rectangle.fromDegrees(west - half, south - half, east + half, north + half);
    Cesium.SingleTileImageryProvider.fromUrl(canvas.toDataURL(), { rectangle: rect }).then((prov) => {
      if (viewer.isDestroyed()) return;
      const layer = viewer.imageryLayers.addImageryProvider(prov);
      layer.alpha = 0.85;
      if (refs.current.heat) viewer.imageryLayers.remove(refs.current.heat);
      refs.current.heat = layer;
    });
  }, [heatmap, layers.heatmap]);

  /* ---------------- layer toggles ---------------- */
  useEffect(() => {
    const r = refs.current;
    if (r.pts) r.pts.show = layers.particles;
    if (r.tribs) r.tribs.forEach((l) => { l.show = layers.streams; });
    if (r.boundary) r.boundary.show = layers.catchment;
  }, [layers, staticData]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const st = live?.stations.find((s) => s.id === selectedId);
    if (!viewer || !st || refs.current.flownTo === selectedId) return;
    refs.current.flownTo = selectedId;
    if (!refs.current.firstFly) { refs.current.firstFly = true; return; }
    const { bearing = 0, mLon = 108_000 } = refs.current;
    const back = 2200;                                 // metres behind the station, looking upstream
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        st.lon - (Math.sin(bearing) * back) / mLon, st.lat - (Math.cos(bearing) * back) / 111_320, st.elevation_m + 1600),
      orientation: { heading: bearing, pitch: Cesium.Math.toRadians(-38), roll: 0 },
      duration: 1.4,
    });
  }, [selectedId, live]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      <button
        onClick={() => refs.current.home?.()}
        className="absolute right-3 top-3 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-sm hover:text-ink"
      >
        Reset view
      </button>
    </div>
  );
}
