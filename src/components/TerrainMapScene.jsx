import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { stationStatus } from '../lib/format';
import { riverAt } from '../lib/twinField';

// A 3D terrain map. Free open data by default. Add VITE_MAPBOX_TOKEN and the same view
// switches to Mapbox satellite imagery and terrain tiles.
const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;
const IMAGERY = MAPBOX
  ? { tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=${MAPBOX}`], attribution: '© Mapbox © Maxar © OpenStreetMap' }
  : { tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
const TERRAIN = MAPBOX
  ? { tiles: [`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${MAPBOX}`], encoding: 'mapbox', maxzoom: 14 }
  : { tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', maxzoom: 13, attribution: 'Terrain: Mapzen/AWS open data' };

const bandOf = (r) => (r >= 0.6 ? 'SEVERE' : r >= 0.45 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW');
const line = (coords, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords.map(([lo, la]) => [lo, la]) } });
const collection = (features) => ({ type: 'FeatureCollection', features });
const waterCss = (t, o) => {
  const [a, b] = [Math.min(1, t / 30), Math.min(1, o / 150)];
  return `rgb(${Math.round(Math.min(255, (0.23 + 0.5 * a + 0.34 * b) * 255))},${Math.round(Math.max(0, (0.66 - 0.32 * a - 0.46 * b) * 255))},${Math.round(Math.max(0, (1 - 0.8 * a - 0.68 * b) * 255))})`;
};
const square = (lon, lat, half = 0.0016) => [[[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]];

const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];

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

export default function TerrainMapScene({ staticData, live, heatmap, floodmap, selectedId, onSelect, onInspect, layers, tauStep, atTime, controls, onTour }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const handlers = useRef({});
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState(null);
  if (fatal) throw fatal;

  useEffect(() => { handlers.current = { onSelect, onInspect }; }, [onSelect, onInspect]);

  useEffect(() => {
    if (!staticData) return undefined;
    const stem = staticData.main_stem;
    const [hLon, hLat] = stem[0];
    const [oLon, oLat] = stem.at(-1);
    const center = [hLon * 0.45 + oLon * 0.55, hLat * 0.45 + oLat * 0.55];
    const bearing = (Math.atan2((hLon - oLon) * 0.97, hLat - oLat) * 180) / Math.PI - 90;
    const home = { center, zoom: 10.9, pitch: 62, bearing };
    let map;
    try {
      map = new maplibregl.Map({
        container: host.current, ...home, maxPitch: 78, attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            imagery: { type: 'raster', tileSize: 256, maxzoom: 18, ...IMAGERY },
            dem: { type: 'raster-dem', tileSize: 256, ...TERRAIN },
            river: { type: 'geojson', lineMetrics: true, data: line(stem) },
            streams: { type: 'geojson', data: collection(staticData.streams.filter((s) => s.area_km2 >= 0.35).map((s) => line(s.coords))) },
            pipes: { type: 'geojson', data: collection((staticData.pipes ?? []).map((p) => line(p.coords))) },
            catchment: { type: 'geojson', data: line(staticData.catchment.ring) },
            columns: { type: 'geojson', data: collection([]) },
          },
          layers: [
            { id: 'imagery', type: 'raster', source: 'imagery' },
            { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#0b2030' } },
            { id: 'catchment', type: 'line', source: 'catchment', paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.85 } },
            { id: 'streams', type: 'line', source: 'streams', paint: { 'line-color': '#8fd0ff', 'line-width': 1.6, 'line-opacity': 0.85 } },
            { id: 'pipes', type: 'line', source: 'pipes', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [1, 1.5] } },
            { id: 'river', type: 'line', source: 'river', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 6, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#3aa8ff', 1, '#3aa8ff'] } },
            { id: 'river-flow', type: 'line', source: 'river', paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-opacity': 0.85, 'line-dasharray': DASH[0] } },
            { id: 'columns', type: 'fill-extrusion', source: 'columns', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.85 } },
          ],
          terrain: { source: 'dem', exaggeration: 1.6 },
          sky: { 'sky-color': '#a9c8f5', 'horizon-color': '#dfe8ff', 'fog-color': '#dfe8ff', 'fog-ground-blend': 0.6, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.7, 'atmosphere-blend': 0.6 },
        },
      });
    } catch (e) {
      setFatal(new Error(`Terrain map could not start (${e.message}).`));
      return undefined;
    }
    mapRef.current = map;
    map.on('load', () => setReady(true));

    let dash = 0;
    const timer = setInterval(() => {
      if (!map.getLayer('river-flow') || document.hidden) return;
      dash = (dash + 1) % DASH.length;
      map.setPaintProperty('river-flow', 'line-dasharray', DASH[dash]);
    }, 90);

    let tour = null;
    const stopTour = () => {
      if (!tour) return;
      cancelAnimationFrame(tour.raf);
      tour = null;
      onTour?.(false);
    };
    const startTour = () => {
      if (tour) return;
      const start = performance.now();
      tour = {};
      onTour?.(true);
      const step = () => {
        const f = (performance.now() - start) / 36000;
        if (f >= 1) { stopTour(); map.flyTo({ ...home, duration: 1800 }); return; }
        const i = Math.min(stem.length - 2, Math.floor(f * 0.97 * (stem.length - 1)));
        const a = stem[Math.max(0, i - 8)];
        const b = stem[Math.min(stem.length - 1, i + 8)];
        map.jumpTo({ center: [stem[i][0], stem[i][1]], zoom: 13.1, pitch: 70, bearing: (Math.atan2((b[0] - a[0]) * 0.97, b[1] - a[1]) * 180) / Math.PI });
        tour.raf = requestAnimationFrame(step);
      };
      tour.raf = requestAnimationFrame(step);
    };
    map.on('mousedown', stopTour);
    map.on('touchstart', stopTour);
    controls.current = { home: () => map.flyTo({ ...home, duration: 1200 }), startTour, stopTour };

    const pins = markers.current;
    return () => {
      clearInterval(timer);
      stopTour();
      for (const m of Object.values(pins)) m.remove();
      markers.current = {};
      map.remove();
      mapRef.current = null;
      controls.current = {};
      setReady(false);
    };
  }, [staticData, controls, onTour]);

  /* ---------------- live state ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !live || !atTime) return;
    const f = riverAt(tauStep, live, atTime);
    const n = f.turb.length;
    const stops = [];
    for (let i = 0; i <= 24; i += 1) {
      const k = Math.round((i / 24) * (n - 1));
      stops.push(i / 24, waterCss(f.turb[k] ?? 0, f.orp[k] ?? 0));
    }
    map.setPaintProperty('river', 'line-gradient', ['interpolate', ['linear'], ['line-progress'], ...stops]);

    const features = [];
    for (const st of live.stations) {
      const risk = atTime[st.id]?.risk ?? st.risk;
      const shown = tauStep === 0 ? st : { ...st, risk_band: bandOf(risk), classification: 'NORMAL', edge_state: 'NORMAL' };
      const { color } = stationStatus(shown);
      if (risk >= 0.1) features.push({ type: 'Feature', properties: { color, height: 300 + risk * 3200 }, geometry: { type: 'Polygon', coordinates: square(st.lon, st.lat) } });
      let m = markers.current[st.id];
      if (!m) {
        const el = document.createElement('button');
        el.className = 'flex items-center gap-1 whitespace-nowrap rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-ink shadow-sm';
        el.innerHTML = '<span data-d class="h-2 w-2 rounded-full"></span><span data-t></span>';
        el.addEventListener('click', (e) => { e.stopPropagation(); handlers.current.onSelect?.(st.id); });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); handlers.current.onInspect?.(st.id); });
        m = new maplibregl.Marker({ element: el }).setLngLat([st.lon, st.lat]).addTo(map);
        markers.current[st.id] = m;
      }
      const el = m.getElement();
      const closed = tauStep === 0 && st.valve && !st.valve.open;
      const fc = live.forecast.stations?.[st.id];
      const eta = tauStep === 0 && fc?.arrival_s > 0 ? ` · ETA ${Math.round(fc.arrival_s / 60)} min` : '';
      el.querySelector('[data-t]').textContent = `${st.id}${closed ? ' · closed' : ''}${eta}`;
      el.querySelector('[data-d]').style.background = color;
      el.style.outline = st.id === selectedId ? '2px solid #2f5be7' : 'none';
    }
    map.getSource('columns').setData(collection(layers.columns === false ? [] : features));
  }, [live, atTime, tauStep, selectedId, layers.columns, ready]);

  /* ---------------- layers ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('streams', layers.streams);
    vis('catchment', layers.catchment);
    vis('pipes', layers.pipes !== false);
    vis('river-flow', layers.particles);
  }, [layers, ready]);

  /* ---------------- rasters ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drape = (id, grid, ramp, on, opacity) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      if (!on || !grid) return;
      const key = `${id}Data`;
      if (map[key] === grid.data) return;            // unchanged: nothing to redraw
      map[key] = grid.data;
      const url = rasterUrl(grid, ramp);
      const coordinates = [[grid.west, grid.north], [grid.east, grid.north], [grid.east, grid.south], [grid.west, grid.south]];
      const src = map.getSource(id);
      if (src) { src.updateImage({ url, coordinates }); return; }
      map.addSource(id, { type: 'image', url, coordinates });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity } }, 'catchment');
    };
    drape('heat', heatmap, riskRamp, layers.heatmap && tauStep === 0, 0.85);
    drape('floodmap', floodmap, floodRamp, Boolean(layers.flood), 0.8);
  }, [heatmap, floodmap, layers.heatmap, layers.flood, tauStep, ready]);

  return (
    <div className="absolute inset-0">
      {/* inline style: MapLibre's stylesheet sets position: relative, which would collapse this box */}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
