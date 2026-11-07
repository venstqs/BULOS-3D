import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as THREE from 'three';
import { applyReading, buildSite, setNightGlow, tickSite, updateDisplay } from '../lib/detailModels';
import { bakeShadow, sky } from '../lib/siteKit';
import { BAND, CLOSED_EARLY, fmt, stationStatus } from '../lib/format';
import { riverAt } from '../lib/twinField';
import { PIPE_FRAG, RIVER_FRAG, paintRiver } from '../lib/waterShaders';
import { waterCss } from '../lib/waterColour';

// The command view: a real 3D map with detailed facilities and people on it.
// Esri is the default photo: Mapbox's has a large cloud and its black shadow over the lower river.
// VITE_MAPBOX_TOKEN adds Mapbox as a choice under Map style.
const MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN;
const IMAGERY = { tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' };
const MAPBOX_IMAGERY = { tiles: [`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX}`], attribution: '© Mapbox © Maxar' };
const TERRAIN = { tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', maxzoom: 13, attribution: 'Terrain: Mapzen/AWS open data' };
const EXAGGERATION = 1.5;
const CLOSE_ZOOM = 20.5;
// Everything is drawn at true size. Models too small to see are skipped, which keeps the map fast.
const MODELS_FROM_ZOOM = 14.8;
const PEOPLE_FROM_ZOOM = 17;
const SCREENS_FROM_ZOOM = 18;
const bandOf = (r) => (r >= 0.6 ? 'SEVERE' : r >= 0.45 ? 'HIGH' : r >= 0.25 ? 'MODERATE' : 'LOW');
const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(([a, b]) => [a, b]) } });
const empty = { type: 'FeatureCollection', features: [] };
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
const PALETTES = {
  hazard: [[255, 224, 90], [250, 150, 40], [224, 52, 44]],
  ocean: [[186, 230, 253], [56, 150, 240], [20, 50, 160]],
  clear: [[253, 231, 37], [33, 145, 140], [68, 1, 84]],
};

/** Colour for a 0-1 value. Stepped reads like a hazard map; smooth suits continuous layers. */
function ramp(palette, stepped, floor) {
  const [a, b, c] = PALETTES[palette] ?? PALETTES.hazard;
  const mix = (p, q, f) => p.map((v, i) => v + (q[i] - v) * f);
  return (t) => {
    if (t < floor) return [0, 0, 0, 0];
    if (stepped) return [...(t < 0.45 ? a : t < 0.6 ? b : c), 165];   // the same limits as Moderate, High and Severe
    return [...(t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2)), 150];
  };
}

/** Ragged edge that lets a site's ground melt into the satellite image. */
let edgeTexture = null;
function softEdge() {
  if (edgeTexture) return edgeTexture;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(20px)';
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i <= 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    const r = 92 + 8 * Math.sin(a * 5) + 5 * Math.sin(a * 11 + 1) + 3 * Math.sin(a * 23);
    g[i ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
  }
  g.fill();
  edgeTexture = new THREE.CanvasTexture(c);
  edgeTexture.channel = 1;
  return edgeTexture;
}

// River ribbon: its centre line follows the terrain, and its width changes with zoom
const RIVER_VERT = `
attribute float aSide; attribute float aS; attribute float aAlong; attribute vec2 aNormal;
uniform float uWidth; uniform float uBase; uniform float uTexScale; uniform float uTaper;
varying vec2 vUv; varying float vS;
void main(){
  float half_w = uWidth * mix(1.0, 0.5 + 0.9 * aS, uTaper);
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

export default function TwinMapScene({ staticData, live, hazard, view, atTime, tauStep, selectedId, onPick, onInspect, layers, controls, onTour, onCaption, onProbe, probe, insets, readout, needle }) {
  const host = useRef(null);
  const rainCanvas = useRef(null);
  const mapRef = useRef(null);
  const world = useRef(null);
  const markers = useRef({});
  const handlers = useRef({});
  const panelGap = useRef({ left: 0, right: 0, top: 0, bottom: 0 });
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState(null);
  if (fatal) throw fatal;
  const first = useRef(live);
  first.current = first.current ?? live;
  const hasData = Boolean(staticData && live);

  useEffect(() => { handlers.current = { onPick, onInspect, onTour, onCaption, onProbe }; }, [onPick, onInspect, onTour, onCaption, onProbe]);

  useEffect(() => {
    if (!hasData) return undefined;
    const stem = staticData.main_stem;
    const fine = staticData.main_fine?.length > 1 ? staticData.main_fine : stem;
    const stations = first.current.stations;
    const [hLon, hLat] = stem[0];
    const [oLon, oLat] = stem.at(-1);
    const center = [hLon * 0.47 + oLon * 0.53, hLat * 0.47 + oLat * 0.53];
    const bearing = (Math.atan2((hLon - oLon) * 0.97, hLat - oLat) * 180) / Math.PI - 90;
    const aspect = Math.max(0.5, host.current.clientWidth - (host.current.clientWidth > 1000 ? 430 : 0)) / Math.max(1, host.current.clientHeight);
    const home = { center, zoom: 12.3 + Math.min(0, Math.log2(aspect / 1.75)), pitch: 60, bearing };

    let map;
    try {
      map = new maplibregl.Map({
        container: host.current, attributionControl: false, ...home, centerClampedToGround: false, maxZoom: 22.4, pixelRatio: Math.min(window.devicePixelRatio, 1.25), fadeDuration: 0, refreshExpiredTiles: false, maxPitch: 80, canvasContextAttributes: { antialias: true },
        style: {
          version: 8,
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sources: {
            imagery: { type: 'raster', tileSize: 256, maxzoom: 18, ...IMAGERY },
            ...(MAPBOX ? { 'imagery-mapbox': { type: 'raster', tileSize: 256, maxzoom: 21, ...MAPBOX_IMAGERY } } : {}),
            dem: { type: 'raster-dem', tileSize: 256, ...TERRAIN },
            shade: { type: 'raster-dem', tileSize: 256, ...TERRAIN },
            osm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap contributors, OpenFreeMap' },
            river: { type: 'geojson', lineMetrics: true, data: line(fine) },
            catchment: { type: 'geojson', data: line(staticData.catchment.ring) },
            streams: { type: 'geojson', data: { type: 'FeatureCollection', features: staticData.streams.filter((x) => x.area_km2 < 40).map((x) => line(x.coords)) } },
            pipes: { type: 'geojson', data: { type: 'FeatureCollection', features: (staticData.pipes ?? []).map((p) => line(p.coords)) } },
            network: { type: 'geojson', data: { type: 'FeatureCollection', features: (staticData.network ?? []).map((n) => line(n.coords)) } },
            barangays: { type: 'geojson', data: { type: 'FeatureCollection', features: (staticData.access ?? []).map((a) => ({ type: 'Feature', properties: { name: a.name, km: a.road_km ?? 99 }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } })) } },
            basin: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [staticData.catchment.ring.map(([a, b]) => [a, b])] } } },
            names: { type: 'geojson', data: { type: 'FeatureCollection', features: [
              { type: 'Feature', properties: { name: 'Mt. Isarog' }, geometry: { type: 'Point', coordinates: [stem[0][0] + 0.03, stem[0][1] + 0.012] } },
              { type: 'Feature', properties: { name: 'Naga River watershed' }, geometry: { type: 'Point', coordinates: [stem[Math.floor(stem.length * 0.4)][0], stem[Math.floor(stem.length * 0.4)][1] + 0.016] } },
            ] } },
            plume: { type: 'geojson', data: empty },
            trail: { type: 'geojson', data: empty },
            tags: { type: 'geojson', data: empty },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#101a2e' } },
            { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': -0.1, 'raster-contrast': 0.06, 'raster-brightness-min': 0.03, 'raster-fade-duration': 150 } },
            ...(MAPBOX ? [{ id: 'imagery-mapbox', type: 'raster', source: 'imagery-mapbox', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.1, 'raster-contrast': 0.06, 'raster-brightness-min': 0.03, 'raster-fade-duration': 150 } }] : []),
            // The street base map, in the clean style of a public hazard map
            { id: 'st-land', type: 'fill', source: 'osm', 'source-layer': 'landcover', layout: { visibility: 'none' }, paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#cfe6c4', 'farmland', '#ecf0d6', 'grass', '#dcecc9', 'wetland', '#d3e8e0', '#e6efd8'], 'fill-opacity': 0.9 } },
            { id: 'st-use', type: 'fill', source: 'osm', 'source-layer': 'landuse', layout: { visibility: 'none' }, paint: { 'fill-color': ['match', ['get', 'class'], 'residential', '#eceef2', 'school', '#f4ecd8', 'hospital', '#f7e3e3', 'commercial', '#efe9ee', '#eceef2'], 'fill-opacity': 0.85 } },
            { id: 'st-park', type: 'fill', source: 'osm', 'source-layer': 'park', layout: { visibility: 'none' }, paint: { 'fill-color': '#cfe6c4', 'fill-opacity': 0.7 } },
            { id: 'st-water', type: 'fill', source: 'osm', 'source-layer': 'water', layout: { visibility: 'none' }, paint: { 'fill-color': '#b8daf5' } },
            { id: 'shade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.22, 'hillshade-shadow-color': '#0d2233', 'hillshade-highlight-color': '#ffffff', 'hillshade-illumination-direction': 315 } },
            { id: 'admin', type: 'line', source: 'osm', 'source-layer': 'boundary', minzoom: 10, filter: ['>=', ['get', 'admin_level'], 6], paint: { 'line-color': '#ffffff', 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [4, 3] } },
            { id: 'waterways', type: 'line', source: 'osm', 'source-layer': 'waterway', minzoom: 12, paint: { 'line-color': '#7cc4ff', 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 17, 2.2] } },
            { id: 'basin', type: 'fill', source: 'basin', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.03 } },
            { id: 'catchment-glow', type: 'line', source: 'catchment', paint: { 'line-color': '#7fd0ff', 'line-width': 6, 'line-blur': 5, 'line-opacity': 0.5 } },
            { id: 'catchment', type: 'line', source: 'catchment', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.85 } },
            { id: 'osm-water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': '#2a7fb5', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 0.34] } },
            { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]], paint: { 'line-color': '#f4f1e4', 'line-opacity': 0.55, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 11, 0.5, 15, 2.2, 19, 16] } },
            { id: 'streams', type: 'line', source: 'streams', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#62c0ff', 'line-opacity': 0.9, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 1, 14, 1.3, 20, 80] } },
            { id: 'network', type: 'line', source: 'network', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#35e0c2', 'line-opacity': 0.8, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 0.8, 15, 1.4, 20, 12] } },
            { id: 'pipes', type: 'line', source: 'pipes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 16.5, 0], 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 1.3, 15, 2, 20, 16] } },
            { id: 'river-glow', type: 'line', source: 'river', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 2.6, 13, 3, 16, 7, 20, 64], 'line-blur': 0.6, 'line-opacity': 0.92, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#46b4ff', 1, '#46b4ff'] } },
            { id: 'trail-glow', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 5, 16, 11], 'line-blur': 4, 'line-opacity': 0.5 } },
            { id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 1.5, 16, 3] } },
            { id: 'buildings', type: 'fill-extrusion', source: 'osm', 'source-layer': 'building', minzoom: 13.6, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 5], 3, '#f1f3f6', 12, '#dbe4f0', 30, '#b9cbe6'], 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } },
            { id: 'road-names', type: 'symbol', source: 'osm', 'source-layer': 'transportation_name', minzoom: 14.5, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-max-angle': 30 }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,25,50,0.85)', 'text-halo-width': 1.3 } },
            { id: 'poi-dots', type: 'circle', source: 'osm', 'source-layer': 'poi', minzoom: 15, filter: ['in', ['get', 'class'], ['literal', ['school', 'college', 'hospital', 'town_hall', 'place_of_worship', 'police', 'fire_station']]], paint: { 'circle-radius': 3.5, 'circle-color': ['match', ['get', 'class'], 'hospital', '#d03b3b', 'school', '#e0a800', 'college', '#e0a800', '#2f5be7'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } },
            { id: 'poi-names', type: 'symbol', source: 'osm', 'source-layer': 'poi', minzoom: 15, filter: ['in', ['get', 'class'], ['literal', ['school', 'college', 'hospital', 'town_hall', 'place_of_worship', 'police', 'fire_station']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.5], 'text-max-width': 9, 'text-optional': true }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,25,50,0.85)', 'text-halo-width': 1.3 } },
            { id: 'peaks', type: 'symbol', source: 'osm', 'source-layer': 'mountain_peak', minzoom: 10, layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5 }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,25,50,0.85)', 'text-halo-width': 1.4 } },
            { id: 'names', type: 'symbol', source: 'names', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 15, 'text-letter-spacing': 0.06 }, paint: { 'text-color': '#c9ecff', 'text-halo-color': 'rgba(8,30,60,0.9)', 'text-halo-width': 1.8 } },
            { id: 'barangay-dots', type: 'circle', source: 'barangays', minzoom: 11, paint: { 'circle-radius': 4, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#ffffff', 'circle-color': ['step', ['get', 'km'], '#2eb872', 1.5, '#f2c200', 3, '#ec835a', 6, '#d03b3b'] } },
            { id: 'places', type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom: 9, filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb']]], layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 11.5] }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,25,50,0.82)', 'text-halo-width': 1.5 } },
            { id: 'tag-dot', type: 'circle', source: 'tags', maxzoom: 17.5, filter: ['==', ['get', 'kind'], 'station'], paint: { 'circle-radius': ['case', ['get', 'picked'], 8, 6], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', ['get', 'picked'], 2.5, 1.5], 'circle-pitch-alignment': 'viewport' } },
            { id: 'tag-station', type: 'symbol', source: 'tags', maxzoom: 17.5, filter: ['==', ['get', 'kind'], 'station'], layout: { 'text-field': ['get', 'text'], 'text-font': ['Noto Sans Bold'], 'text-size': 12.5, 'text-anchor': 'bottom', 'text-offset': [0, -0.9], 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b2231', 'text-halo-width': 2 } },
            { id: 'tag-close', type: 'symbol', source: 'tags', minzoom: 17.5, maxzoom: 20, filter: ['==', ['get', 'kind'], 'station'], layout: { 'text-field': ['get', 'detail'], 'text-font': ['Noto Sans Bold'], 'text-size': 12.5, 'text-anchor': 'bottom', 'text-offset': [0, -7], 'text-allow-overlap': true, 'text-line-height': 1.3, 'text-max-width': 34 }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b2231', 'text-halo-width': 1.4 } },
            { id: 'tag-other', type: 'symbol', source: 'tags', minzoom: 12.2, filter: ['!=', ['get', 'kind'], 'station'], layout: { 'text-field': ['get', 'text'], 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-anchor': 'top', 'text-offset': [0, 0.5], 'text-allow-overlap': false }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#0b2231', 'text-halo-width': 1.8 } },
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
    const fitBox = new ResizeObserver(() => map.resize());
    fitBox.observe(host.current);

    /* ---------- detailed models, drawn inside the map ---------- */
    const origin = center;
    const sites = {};
    const people = [];
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#ffffff', '#55604f', 0.35);
    const sun = new THREE.DirectionalLight('#fff3df', 2.6);
    sun.position.set(-0.5, 1, 0.65);
    scene.add(hemi, sun);

    const originMerc = maplibregl.MercatorCoordinate.fromLngLat(origin, 0);
    const metre = originMerc.meterInMercatorCoordinateUnits();
    const local = (lon, lat) => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
      return [(c.x - originMerc.x) / metre, (c.y - originMerc.y) / metre];
    };
    const addSite = (id, lon, lat, facing, r, kind = id) => {
      const ctx = buildSite(kind);
      ctx.g.rotation.y = facing;
      const root = new THREE.Group();
      root.add(ctx.g);
      ctx.g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.userData.site = id; } });
      const [x, z] = local(lon, lat);
      root.position.set(x, 0, z);
      scene.add(root);
      const pin = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 24), new THREE.MeshStandardMaterial({ color: '#0ca30c', emissive: '#0ca30c', emissiveIntensity: 0.4, roughness: 0.35 }));
      pin.rotation.x = Math.PI;
      pin.frustumCulled = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.985, r * 1.015, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d03b3b', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      ring.visible = false;
      ring.position.y = 0.2;
      ring.frustumCulled = false;
      root.add(ring);
      const pads = ctx.ground;
      ctx.ground.forEach((pad, i) => {
        pad.material = pad.material.clone();
        // Sit in with the satellite image around it, rather than glowing on top
        pad.material.color.multiplyScalar(0.46);
        pad.material.opacity = 0.86;
        pad.material.envMapIntensity = 0.25;
        pad.material.alphaMap = softEdge();
        pad.material.blending = THREE.CustomBlending;
        pad.material.blendSrc = THREE.SrcAlphaFactor;
        pad.material.blendDst = THREE.OneMinusSrcAlphaFactor;
        underModels(pad.material, -3 + i * 0.1, pad);
      });
      // Shadows are drawn once per site and laid on the ground like a decal
      const span = ctx.radius * 2.5;
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ opacity: 0.5, depthWrite: false, toneMapped: false, color: '#0a1420', blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
      decal.visible = false;
      decal.frustumCulled = false;
      ctx.g.add(decal);
      underModels(decal.material, -2, decal);
      sites[id] = { ...ctx, root, ring, pads, decal, lon, lat, r, phase: Math.random(), facing };
      people.push(...ctx.people);
      return sites[id];
    };
    // Each facility stands on the bank, with an intake pipe down to the river
    const degLon = 111320 * Math.cos((center[1] * Math.PI) / 180);
    stations.forEach((st) => {
      const r = st.id === 'RH-05' ? 36 : 22;
      let at = 0; let best = 1e12;
      stem.forEach(([a, b], i) => { const e = (a - st.lon) ** 2 + (b - st.lat) ** 2; if (e < best) { best = e; at = i; } });
      const [p0, p1] = [stem[Math.max(0, at - 3)], stem[Math.min(stem.length - 1, at + 3)]];
      const [ex, ny] = [(p1[0] - p0[0]) * degLon, (p1[1] - p0[1]) * 111320];
      const len = Math.hypot(ex, ny) || 1;
      // Stand on whichever bank leaves the most room: on a tight bend one side is nearly all water
      const gap = r + 34;
      const clearance = (sgn) => {
        const [e, nn] = [(-ny / len) * sgn * gap, (ex / len) * sgn * gap];
        const [x, y] = [stem[at][0] + e / degLon, stem[at][1] + nn / 111320];
        return Math.min(...stem.map((q) => Math.hypot((q[0] - x) * degLon, (q[1] - y) * 111320)));
      };
      const side = clearance(1) >= clearance(-1) ? 1 : -1;
      const [east, north] = [(-ny / len) * side * gap, (ex / len) * side * gap];
      const site = addSite(st.id, stem[at][0] + east / degLon, stem[at][1] + north / 111320, bearing * (Math.PI / 180) * -1 + 0.5, r);
      const reach = gap - r * 0.72;
      const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, reach, 12), new THREE.MeshStandardMaterial({ color: '#17191d', roughness: 0.5 }));
      intake.rotation.set(Math.PI / 2, 0, 0);
      const holder = new THREE.Group();
      holder.add(intake);
      const mid = (gap + r * 0.72) / 2 / gap;
      holder.position.set(-east * mid, 0.3, north * mid);
      holder.rotation.y = Math.atan2(-east, -north * -1);
      holder.traverse((o) => { o.frustumCulled = false; });
      site.root.add(holder);
      site.pipe = holder;
    });
    const agIndex = stem.findIndex((_, i) => (first.current.channel.chainage_m[i] ?? 0) > (stations.find((s) => s.id === 'AG-02')?.chainage_m ?? 0) - 1100);
    const fp = stem[Math.max(0, agIndex)];
    addSite('FARM', fp[0] + 0.0028, fp[1] + 0.0036, 0.4, 24);

    const stationIds = new Set(stations.map((x) => x.id));
    const field = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1, THREE.RGBAFormat);
    field.minFilter = THREE.LinearFilter;
    field.magFilter = THREE.LinearFilter;
    const shared = { uTime: { value: 0 }, uBase: { value: 0 } };
    const ribbons = [];
    /** Water drawn on the terrain: a strip that follows the ground and keeps a readable width. */
    const makeRibbon = (coords, { width, ref, tex, order, frag = RIVER_FRAG, taper = 0, points, flow = 1.1, tint = '#3aa8ff', useField = 0, everyPoint = false, exact = false }) => {
      const path = exact ? null : new THREE.CatmullRomCurve3(coords.filter((_, i) => everyPoint || i % 2 === 0 || i === coords.length - 1).map(([a, b]) => new THREE.Vector3(a, b, 0)), false, 'centripetal');
      const pts = exact ? coords.map(([a, b]) => new THREE.Vector3(a, b, 0)) : path.getSpacedPoints(points ?? Math.min(300, Math.max(14, coords.length * 2)));
      const n = pts.length;
      const pos = new Float32Array(n * 6);
      const side = new Float32Array(n * 2);
      const sAlong = new Float32Array(n * 2);
      const dist = new Float32Array(n * 2);
      const normal = new Float32Array(n * 4);
      const idx = [];
      const xy = pts.map((q) => local(q.x, q.y));
      let along = 0;
      for (let i = 0; i < n; i += 1) {
        const [a, b] = [xy[Math.max(0, i - 2)], xy[Math.min(n - 1, i + 2)]];
        const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
        const len = Math.hypot(dx, dz) || 1;
        if (i) along += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
        for (let e = 0; e < 2; e += 1) {
          const k = i * 2 + e;
          pos.set([xy[i][0], 0, xy[i][1]], k * 3);
          side[k] = e ? 1 : -1;
          sAlong[k] = i / (n - 1);
          dist[k] = along;
          normal.set([-dz / len, dx / len], k * 2);
        }
        if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      geo.setAttribute('aS', new THREE.BufferAttribute(sAlong, 1));
      geo.setAttribute('aAlong', new THREE.BufferAttribute(dist, 1));
      geo.setAttribute('aNormal', new THREE.BufferAttribute(normal, 2));
      geo.setIndex(idx);
      const uniforms = {
        ...shared, uFlow: { value: flow }, uField: { value: field }, uTint: { value: new THREE.Color(tint) }, uUseField: { value: useField },
        uWidth: { value: width }, uTexScale: { value: 40 }, uTaper: { value: taper },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: RIVER_VERT, fragmentShader: frag, uniforms, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      underModels(material, order, mesh);
      scene.add(mesh);
      const r = { mesh, uniforms, width, ref, tex, flow, pts, geo };
      ribbons.push(r);
      return r;
    };
    const riverRibbon = makeRibbon(fine, { width: 22, ref: 15.3, tex: 1.7, order: -7, taper: 1, points: 1100, useField: 1, everyPoint: true });
    const pipeRibbons = Object.fromEntries((staticData.pipes ?? []).map((p) => [p.id, makeRibbon(p.coords, { width: 1.1, ref: 15.6, tex: 1.4, order: -5, frag: PIPE_FRAG, flow: 1, tint: '#4fd2ff', exact: true })]));
    let drapeIndex = 0;
    let frame = 0;
    let drapesLeft = 12;                 // the ground only changes when new elevation tiles arrive
    const drapeNext = () => {
      frame += 1;
      if (frame % 8 || !drapesLeft) return;
      drapesLeft -= 1;
      const r = ribbons[drapeIndex];
      drapeIndex = (drapeIndex + 1) % ribbons.length;
      const P = r.geo.getAttribute('position');
      for (let i = 0; i < r.pts.length; i += 1) {
        const y = map.queryTerrainElevation([r.pts[i].x, r.pts[i].y]) ?? 0;
        P.setY(i * 2, y); P.setY(i * 2 + 1, y);
      }
      P.needsUpdate = true;
    };

    // The rain gauge, and the structures along each pipeline
    const gauge = staticData.rain_gauge;
    addSite('RAIN', gauge.lon, gauge.lat, 0.3, 12);
    const assets = (staticData.water_assets ?? []).filter((a) => ['pumping_station', 'water_tower'].includes(a.kind));
    assets.forEach((a, i) => { addSite(`ASSET-${i}`, a.lon, a.lat, 0.4, 10, a.kind === 'water_tower' ? 'TOWER' : 'PUMP').asset = a; });
    for (const p of staticData.pipes ?? []) {
      const c = p.coords;
      const heading = (i) => Math.atan2(-(c[i + 1][1] - c[i][1]) * 111320, (c[i + 1][0] - c[i][0]) * degLon);
      if (p.id === 'GL-1') {
        for (const f of [0.3, 0.62]) { const i = Math.floor(c.length * f); addSite(`BPT-${i}`, c[i][0], c[i][1], heading(i), 6, 'BPT'); }
      } else {
        const i = Math.floor(c.length * 0.5);
        addSite(`VC-${i}`, c[i][0], c[i][1], heading(i), 4, 'CHAMBER');
      }
    }

    const raycaster = new THREE.Raycaster();
    const camera = new THREE.Camera();
    let renderer = null;
    let repaintQueued = false;
    const wake = () => { if (!document.hidden) map.triggerRepaint(); };
    document.addEventListener('visibilitychange', wake);
    let last = performance.now();
    const elevation = (lon, lat, fallback) => map.queryTerrainElevation([lon, lat]) ?? fallback * EXAGGERATION;
    const rotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const models = {
      id: 'detailed-models', type: 'custom', renderingMode: '3d',
      onAdd(_, gl) {
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        sky().then((t) => { scene.environment = t; scene.environmentIntensity = 0.8; map.triggerRepaint(); }).catch(() => {});
      },
      render(gl, args) {
        const now = performance.now();
        const dt = Math.min(0.08, (now - last) / 1000);
        last = now;
        const t = now / 1000;
        const zoom = map.getZoom();
        const baseAlt = elevation(origin[0], origin[1], 20);
        drapeNext();
        shared.uTime.value = t;
        shared.uBase.value = baseAlt;
        for (const r of ribbons) {
          r.uniforms.uWidth.value = r.width;
          r.uniforms.uTexScale.value = Math.max(r.width * r.tex, 2 ** (22 - zoom) * 0.7);
        }
        const look = map.getCenter();
        const within = 600 * 2 ** (20 - zoom);
        const people = zoom >= PEOPLE_FROM_ZOOM;
        for (const s of Object.values(sites)) {
          const metres = Math.hypot((s.lon - look.lng) * 107_900, (s.lat - look.lat) * 110_700);
          const show = zoom >= MODELS_FROM_ZOOM && metres < within && (!s.asset || world.current?.assets !== false);
          s.root.visible = show;
          if (!show) continue;
          if (!s.baked) {
            s.baked = true;
            const local = new THREE.Vector3(-0.5, 1, 0.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), -s.facing);
            const later = window.requestIdleCallback ?? ((f) => setTimeout(f, 120));
            later(() => {
              if (!mapRef.current) return;
              s.decal.material.alphaMap = bakeShadow(s, local);
              s.decal.material.needsUpdate = true;
              s.decal.visible = true;
            });
          }
          // Settle on a height and keep it, or models bob as finer terrain tiles arrive
          if (s.y == null || drapesLeft > 0) s.y = elevation(s.lon, s.lat, s.base ?? 20);
          s.root.position.y = s.y - baseAlt + 0.3;
          if (s.ring.visible) {
            const ph = (now / 1500 + s.phase) % 1;
            s.ring.scale.setScalar(0.85 + ph * 0.9);
            s.ring.material.opacity = (1 - ph) * 0.85;
          }
          tickSite(s, t, dt, { rain: world.current?.rain ?? 0, people });
        }

        const mc = maplibregl.MercatorCoordinate.fromLngLat(origin, baseAlt);
        const s = mc.meterInMercatorCoordinateUnits();
        const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(rotation);
        camera.projectionMatrix = m.multiply(l);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.render(scene, camera);
        // A steady, modest frame rate: water still flows, and the laptop stays cool
        if (!repaintQueued) {
          repaintQueued = true;
          setTimeout(() => { repaintQueued = false; if (!document.hidden && mapRef.current) map.triggerRepaint(); }, zoom >= MODELS_FROM_ZOOM ? 33 : 50);
        }
      },
    };

    const pickAt = (e) => {
      const tagged = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ['tag-dot', 'tag-station'] })[0];
      if (tagged?.properties.id) { handlers.current.onPick?.(tagged.properties.id); focus(tagged.properties.id); return; }
      const { width, height } = map.getCanvas().getBoundingClientRect();
      const ndc = new THREE.Vector2((e.point.x / width) * 2 - 1, -(e.point.y / height) * 2 + 1);
      const near = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
      const far = new THREE.Vector3(ndc.x, ndc.y, 1).unproject(camera);
      raycaster.set(near, far.sub(near).normalize());
      const seen = Object.values(sites).filter((s) => s.root.visible);
      for (const s of seen) s.root.updateMatrixWorld();
      const hit = raycaster.intersectObjects(seen.map((s) => s.g), true).find((h) => stationIds.has(h.object.userData.site));
      if (hit) { const id = hit.object.userData.site; handlers.current.onPick?.(id); focus(id); } else handlers.current.onProbe?.({ lon: e.lngLat.lng, lat: e.lngLat.lat });
    };

    // With terrain the map can keep the ground height from where the flight began, leaving
    // the target off screen. Setting it on arrival keeps the camera aimed at the site.
    const groundAt = ([lon, lat]) => map.queryTerrainElevation([lon, lat]) ?? 0;
    const fly = (options) => {
      map.flyTo({ padding: panelGap.current, ...options, essential: true });
      // Ease to the ground height on arrival: setting it in one step makes the whole view hop
      map.once('moveend', () => {
        const from = map.getCenterElevation();
        const to = groundAt(options.center);
        if (Math.abs(to - from) < 1) return;
        const start = performance.now();
        const step = () => {
          const f = Math.min(1, (performance.now() - start) / 600);
          map.setCenterElevation(from + (to - from) * f * f * (3 - 2 * f));
          if (f < 1 && mapRef.current) requestAnimationFrame(step);
        };
        step();
      });
    };

    const focus = (id, room = {}) => {
      const s = sites[id];
      if (!s) return;
      stopFollow();
      fly({ center: [s.lon, s.lat], zoom: CLOSE_ZOOM, pitch: 70, bearing: map.getBearing(), duration: 2600, padding: { ...panelGap.current, right: 372, ...room } });
    };

    let timer = 0;
    let follow = false;
    const drop = { pin: null, path: [] };
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
      focus: (id, room) => { stopTour(); focus(id, room); },
      sensors: (id) => {
        const s = sites[id];
        if (!s?.sensorAt) return;
        stopTour(); stopFollow();
        s.g.updateWorldMatrix(true, false);
        const v = new THREE.Vector3(s.sensorAt[0], 0, s.sensorAt[1]).applyMatrix4(s.g.matrixWorld);
        const c = new maplibregl.MercatorCoordinate(originMerc.x + v.x * metre, originMerc.y + v.z * metre, 0).toLngLat();
        fly({ center: [c.lng, c.lat], zoom: 22.2, pitch: 68, bearing: -(s.g.rotation.y * 180) / Math.PI, duration: 2400 });
      },
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
      north: () => map.easeTo({ bearing: 0, duration: 700 }),
      tilt3d: (flat) => map.easeTo({ pitch: flat ? 0 : 60, duration: 800 }),
      startTour, stopTour,
      // Follow a drop: a marker and a bright trail travelling down the river, with the camera behind it
      dropStart: (lon, lat, heading) => {
        stopTour(); stopFollow();
        drop.path = [[lon, lat]];
        map.getSource('trail')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
        if (!drop.pin) {
          const el = document.createElement('div');
          el.className = 'drop-pin';
          drop.pin = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
        }
        drop.pin.setLngLat([lon, lat]);
        fly({ center: [lon, lat], zoom: 14.6, pitch: 68, bearing: heading, duration: 2000 });
      },
      dropCamera: (lon, lat, heading) => fly({ center: [lon, lat], zoom: 14.6, pitch: 68, bearing: heading, duration: 1400 }),
      dropAt: (lon, lat, heading, follow = true) => {
        if (!drop.pin) return;
        drop.pin.setLngLat([lon, lat]);
        const [px, py] = drop.path.at(-1);
        if (Math.hypot(px - lon, py - lat) > 0.0004) {
          drop.path.push([lon, lat]);
          map.getSource('trail')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: drop.path } });
        }
        if (!follow || map.isMoving()) return;
        const z = map.queryTerrainElevation([lon, lat]);
        if (z != null) map.setCenterElevation(map.getCenterElevation() + (z - map.getCenterElevation()) * 0.12);
        map.jumpTo({ center: [lon, lat], bearing: heading });
      },
      dropEnd: () => {
        drop.pin?.remove();
        drop.pin = null;
        drop.path = [];
        map.getSource('trail')?.setData(empty);
        fly({ ...home, duration: 1800 });
      },
      setFollow: (on) => { stopTour(); follow = on; if (on) map.easeTo({ zoom: 14.2, pitch: 66, duration: 1400 }); },
    };

    // As soon as the style is ready: waiting for 'load' would hold back the water points until every tile arrives
    map.once('style.load', () => {
      map.addLayer(models, 'places');
      setReady(true);
    });
    map.on('click', pickAt);
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
    map.on('rotate', () => { if (needle?.current) needle.current.style.transform = `rotate(${-map.getBearing()}deg)`; });
    map.on('mousemove', (e) => {
      if (!readout?.current) return;
      const z = map.queryTerrainElevation(e.lngLat);
      const k = map.getTerrain()?.exaggeration || 1;
      readout.current.textContent = `${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}${z == null ? '' : `, ${Math.round(z / k)} m`}`;
    });
    map.on('sourcedata', (e) => { if (e.sourceId === 'dem' && e.tile) drapesLeft = 12; });
    const userMoved = (e) => { if (e.originalEvent) { stopTour(); } };
    map.on('dragstart', userMoved);

    timer = setInterval(() => {
      const w = world.current;
      if (follow && w?.front && !document.hidden) map.easeTo({ center: w.front, duration: 900 });
    }, 1000);

    world.current = { map, sites, field, riverRibbon, pipeRibbons, front: null };
    const pins = markers.current;
    return () => {
      clearInterval(timer);
      fitBox.disconnect();
      document.removeEventListener('visibilitychange', wake);
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
    // Light: the hour on the twin's clock, dimmed further by rain
    const hour = new Date(live.clock.epoch_ms).getHours() + new Date(live.clock.epoch_ms).getMinutes() / 60;
    const night = hour >= 19 || hour < 5 ? 1 : hour >= 17.5 ? (hour - 17.5) / 1.5 : hour < 6.5 ? (6.5 - hour) / 1.5 : 0;
    const rainNow = atTime[live.stations[0].id]?.rain ?? 0;
    const storm = Math.min(1, rainNow / 30);
    w.rain = storm;
    for (const id of ['imagery', 'imagery-mapbox']) if (map.getLayer(id)) map.setPaintProperty(id, 'raster-brightness-max', 1 - 0.32 * night - 0.25 * storm);
    setNightGlow(night);

    const lagoon = w.sites.FARM?.lagoon;
    if (lagoon) lagoon.color.set(rainNow < 1 && (atTime['AG-02']?.risk ?? 0) >= 0.25 ? '#6d4a2a' : '#7fa8a0');

    const tagList = [];
    const tag = (kind, lon, lat, text, color) => ({ type: 'Feature', properties: { kind, text, color, picked: false }, geometry: { type: 'Point', coordinates: [lon, lat] } });
    const BAND_TINT = { LOW: '#4fd2ff', MODERATE: '#ffc533', HIGH: '#ff8b4d', SEVERE: '#ff4436' };
    for (const p of live.pipes ?? []) {
      const r = w.pipeRibbons[p.id];
      if (!r) continue;
      r.uniforms.uFlow.value = p.flowing && layers.particles !== false ? 1 : 0;
      r.uniforms.uTint.value.set(BAND_TINT[p.source_band] ?? BAND_TINT.LOW);
      const mid = r.pts[Math.floor(r.pts.length / 2)];
      tagList.push(tag('pipe', mid.x, mid.y, `${p.id}  ${p.flowing ? `${fmt(p.flow_lps, 1)} L/s` : 'stopped'}`, p.flowing ? '#bfefff' : '#ffb0a5'));
    }
    tagList.push(tag('gauge', staticData.rain_gauge.lon, staticData.rain_gauge.lat, `Rain gauge ${fmt(live.rain_mm_hr, 1)} mm/h`, '#ffffff'));
    if (w.front) tagList.push(tag('front', w.front[0], w.front[1], 'Plume front', '#ff9a8e'));
    if (layers.assets !== false) for (const a of Object.values(w.sites)) if (a.asset) tagList.push(tag('asset', a.lon, a.lat, a.asset.name ?? (a.asset.kind === 'water_tower' ? 'Water tower' : 'Pumping station'), '#9ff0dd'));

    for (const st of live.stations) {
      const risk = atTime[st.id]?.risk ?? st.risk;
      const shown = tauStep === 0 ? st : { ...st, risk_band: bandOf(risk), classification: 'NORMAL', edge_state: 'NORMAL' };
      const { color } = stationStatus(shown);
      const closed = tauStep === 0 && st.valve && !st.valve.open;
      const s = w.sites[st.id];
      if (s) {
        s.base = st.elevation_m;
        if (map.getZoom() >= SCREENS_FROM_ZOOM) updateDisplay(s, st);
        s.ring.material.color.set(color);
        s.ring.visible = risk >= 0.25 || Boolean(closed);
        applyReading(s, st);
      }
      const fc = live.forecast.stations?.[st.id];
      const eta = tauStep === 0 && fc?.arrival_s > 0 ? `ETA ${Math.round(fc.arrival_s / 60)} min` : '';
      const at = w.sites[st.id];
      // Low risk does not mean nothing is happening: closed early and plume on the way each get their own colour
      const calm = tauStep === 0 && stationStatus(st).color === BAND.LOW.color;
      const dot = calm && closed ? CLOSED_EARLY : calm && eta ? BAND.MODERATE.color : color;
      s?.ring.material.color.set(dot);
      tagList.push({ ...tag('station', at.lon, at.lat, `${st.id}  ${closed ? 'closed' : eta || st.wqhi.score}`, dot), id: st.id });
      tagList.at(-1).properties = { ...tagList.at(-1).properties, id: st.id, picked: st.id === selectedId, detail: `${st.name}\nWater health ${st.wqhi.score}/100, turbidity ${fmt(st.reading?.turbidity, 1)} NTU, pH ${fmt(st.reading?.ph, 2)}` };
    }
    map.getSource('tags').setData({ type: 'FeatureCollection', features: tagList });
  }, [live, atTime, tauStep, selectedId, ready, staticData, layers.particles, layers.assets]);

  /* ---------------- layers ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('buildings', layers.buildings !== false);
    for (const id of ['roads', 'places', 'road-names', 'poi-dots', 'poi-names', 'peaks', 'admin']) vis(id, layers.labels !== false);
    for (const id of ['tag-dot', 'tag-station', 'tag-close', 'tag-other']) vis(id, view.mapLabels !== false);
    vis('catchment', layers.catchment !== false);
    vis('streams', layers.streams !== false);
    vis('waterways', layers.streams !== false);
    vis('pipes', layers.pipes !== false);
    const access = view.hazard === 'access';
    vis('network', access || layers.network === true);
    vis('barangay-dots', access || layers.barangays === true);
    if (world.current) world.current.assets = layers.assets !== false;
    vis('catchment-glow', layers.catchment !== false);
    vis('basin', layers.catchment !== false);
    vis('names', layers.catchment !== false);
    const w = world.current;
    if (w) {
      for (const r of Object.values(w.pipeRibbons)) r.mesh.visible = layers.pipes !== false;
      w.riverRibbon.uniforms.uFlow.value = layers.particles !== false ? 1.1 : 0;
    }
  }, [layers, ready, view.mapLabels, view.hazard]);

  /* ---------------- hazard layer ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const on = Boolean(hazard) && view.hazard !== 'none' && tauStep === 0;
    if (map.getLayer('hazard')) map.setLayoutProperty('hazard', 'visibility', on ? 'visible' : 'none');
    if (!on) return;
    const key = `${view.palette}|${hazard.index}|${hazard.data}`;
    if (map.hazardKey !== key) {
      map.hazardKey = key;
      const stepped = hazard.index === 'risk';
      const url = rasterUrl(hazard, ramp(view.palette, stepped, stepped ? 0.25 : hazard.index === 'access' ? 0.02 : 0.06));
      const coordinates = [[hazard.west, hazard.north], [hazard.east, hazard.north], [hazard.east, hazard.south], [hazard.west, hazard.south]];
      const src = map.getSource('hazard');
      if (src) src.updateImage({ url, coordinates });
      else {
        map.addSource('hazard', { type: 'image', url, coordinates });
        map.addLayer({ id: 'hazard', type: 'raster', source: 'hazard', paint: { 'raster-opacity': 0.7 } }, 'catchment');
      }
    }
    // 90 m cells are too coarse to read up close, so colours fade as you zoom in
    map.setPaintProperty('hazard', 'raster-opacity', ['interpolate', ['linear'], ['zoom'], 14, view.opacity, 16.5, 0]);
  }, [hazard, view.hazard, view.palette, view.opacity, tauStep, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const satellite = view.base === 'satellite';
    const light = view.base === 'light';
    map.setLayoutProperty('imagery', 'visibility', satellite ? 'visible' : 'none');
    if (map.getLayer('imagery-mapbox')) map.setLayoutProperty('imagery-mapbox', 'visibility', view.base === 'mapbox' ? 'visible' : 'none');
    map.setPaintProperty('background', 'background-color', light ? '#f3f5f1' : '#101a2e');
    for (const id of ['st-land', 'st-use', 'st-park', 'st-water']) map.setLayoutProperty(id, 'visibility', light ? 'visible' : 'none');
    map.setPaintProperty('shade', 'hillshade-exaggeration', light ? 0.45 : 0.22);
    map.setPaintProperty('roads', 'line-color', light ? '#ffffff' : '#f4f1e4');
    map.setPaintProperty('roads', 'line-opacity', light ? 1 : 0.55);
    map.setPaintProperty('admin', 'line-color', light ? '#8a97ad' : '#ffffff');
    map.setPaintProperty('waterways', 'line-color', light ? '#8cc4ef' : '#7cc4ff');
    for (const id of ['places', 'road-names', 'poi-names', 'peaks', 'tag-station', 'tag-close', 'tag-other', 'names']) {
      map.setPaintProperty(id, 'text-color', light ? '#16204a' : id === 'tag-other' ? ['get', 'color'] : id === 'names' ? '#c9ecff' : '#ffffff');
      map.setPaintProperty(id, 'text-halo-color', light ? 'rgba(255,255,255,0.95)' : 'rgba(10,25,50,0.85)');
    }
    map.setTerrain({ source: 'dem', exaggeration: view.relief });
  }, [view.base, view.relief, ready]);

  /* ---------------- keep the subject clear of the hanging panels ---------------- */
  const insetKey = insets && window.innerWidth >= 1024 ? `${insets.left}|${insets.right}|${insets.bottom}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !insetKey) return;
    const [left, right, bottom] = insetKey.split('|').map(Number);
    panelGap.current = { left, right, top: 16, bottom };
    if (!map.isMoving()) map.easeTo({ padding: panelGap.current, duration: 350 });
  }, [insetKey, ready]);

  /* ---------------- location check ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markers.current.probe?.remove();
    delete markers.current.probe;
    if (!probe) return;
    const el = document.createElement('div');
    el.className = 'h-4 w-4 rounded-full border-[3px] border-white bg-[#2f5be7] shadow-[0_0_0_6px_rgba(47,91,231,0.3)]';
    markers.current.probe = new maplibregl.Marker({ subpixelPositioning: true, element: el, opacityWhenCovered: '1' }).setLngLat([probe.lon, probe.lat]).addTo(map);
  }, [probe, ready]);

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
