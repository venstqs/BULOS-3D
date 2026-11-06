// Read place names for the pilot area from the OpenFreeMap vector tiles (OpenStreetMap data).
//   node scripts/fetch-places.mjs
import { writeFileSync } from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const [S, W, N, E] = [13.56, 123.16, 13.72, 123.40];
const Z = 14;
const OUT = new URL('../backend/data/places_naga.json', import.meta.url);
const headers = { 'User-Agent': 'Mozilla/5.0 Bulos3D-student-project', Referer: 'https://openfreemap.org/' };
const tileX = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const tileY = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };

const { tiles } = await (await fetch('https://tiles.openfreemap.org/planet', { headers })).json();
const seen = new Map();
for (let x = tileX(W); x <= tileX(E); x += 1) {
  for (let y = tileY(N); y <= tileY(S); y += 1) {
    const res = await fetch(tiles[0].replace('{z}', Z).replace('{x}', x).replace('{y}', y), { headers });
    if (!res.ok) { console.log('tile', x, y, res.status); continue; }
    const layer = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer()))).layers.place;
    for (let i = 0; layer && i < layer.length; i += 1) {
      const f = layer.feature(i);
      const name = f.properties['name:en'] || f.properties.name;
      if (!name || !['city', 'town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood'].includes(f.properties.class)) continue;
      const [lon, lat] = f.toGeoJSON(x, y, Z).geometry.coordinates;
      if (lat >= S && lat <= N && lon >= W && lon <= E) seen.set(name, { name, kind: f.properties.class, lat: +lat.toFixed(6), lon: +lon.toFixed(6), population: null });
    }
  }
}
const places = [...seen.values()];
writeFileSync(OUT, JSON.stringify({ source: 'OpenStreetMap contributors (ODbL), via OpenFreeMap', places }));
console.log(places.length, 'places', places.slice(0, 16).map((p) => p.name).join(', '));
