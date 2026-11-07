// The hosted website has no Python server. This answers the same API in the browser: readings
// come from the JavaScript twin that the mobile app uses, and terrain, layers and evaluation
// results are files exported from the real model (scripts/export_hosted.py).
// Its events are a simplified script of the river, so it is always labelled as a demo.
import { demoTwin } from '../../mobile/src/lib/demoEngine';

setInterval(() => demoTwin.tick(), 1000);

const files = new Map();
const file = (path) => {
  if (!files.has(path)) {
    files.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }));
  }
  return files.get(path);
};
const hosted = (name) => file(`/hosted/${name}.json`);

const CONDITION = [[0, 'Clear'], [3, 'Cloudy'], [48, 'Fog'], [57, 'Drizzle'], [67, 'Rain'], [77, 'Snow'], [82, 'Rain showers'], [86, 'Snow showers'], [99, 'Thunderstorm']];
let weatherCache = null;

async function weather() {
  if (weatherCache && Date.now() - weatherCache.at < 1800000) return weatherCache.value;
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.62&longitude=123.22&current=temperature_2m,precipitation,wind_speed_10m,weather_code&hourly=precipitation&forecast_days=2&timezone=Asia%2FManila');
    const d = await r.json();
    const cur = d.current;
    const start = Math.max(0, d.hourly.time.findIndex((h) => h >= cur.time.slice(0, 13)));
    const value = {
      available: true, source: 'Open-Meteo', time: cur.time, temp_c: cur.temperature_2m, rain_mm: cur.precipitation, wind_kmh: cur.wind_speed_10m,
      condition: CONDITION.find(([code]) => cur.weather_code <= code)?.[1] ?? 'Unsettled',
      next24_mm: Number(d.hourly.precipitation.slice(start, start + 24).reduce((a, v) => a + (v ?? 0), 0).toFixed(1)),
    };
    weatherCache = { at: Date.now(), value };
    return value;
  } catch {
    return { available: false, source: 'Open-Meteo' };
  }
}

const km = (aLat, aLon, bLat, bLon) => Math.hypot((aLat - bLat) * 111.32, (aLon - bLon) * 111.32 * Math.cos((aLat * Math.PI) / 180));

async function hazard(lat, lon) {
  const [{ naga, bicol }, rain] = await Promise.all([file('/landing/data.json'), weather()]);
  const near = naga.stations.map((s) => [km(lat, lon, s.lat, s.lon), s]).sort((a, b) => a[0] - b[0])[0];
  const riverKm = Math.min(...naga.river.map(([x, y]) => km(lat, lon, y, x)));
  if (riverKm < 3) {
    return { lat, lon, in_catchment: true, nearest_id: near[1].id, nearest_name: near[1].name, nearest_km: Number(near[0].toFixed(1)), river_distance_m: Math.round(riverKm * 1000) };
  }
  const r = Math.floor((bicol.north - lat) / bicol.step);
  const c = Math.floor((lon - bicol.west) / bicol.step);
  const bytes = Uint8Array.from(atob(bicol.wet), (ch) => ch.charCodeAt(0));
  const wet = r >= 0 && c >= 0 && r < bicol.rows && c < bicol.cols ? bytes[r * bicol.cols + c] : 0;
  if (!wet) throw new Error('That spot is outside Bicol.');
  const mm = rain.available ? rain.next24_mm : 0;
  const value = ((wet - 1) / 254) * (0.45 + 0.55 * Math.min(1, mm / 80) ** 0.7);
  const elev = new Int16Array(Uint8Array.from(atob(bicol.elev), (ch) => ch.charCodeAt(0)).buffer);
  return {
    lat, lon, region: true, elevation_m: elev[r * bicol.cols + c], rain_next24_mm: rain.available ? mm : null,
    runoff: Number(value.toFixed(2)), level: value >= 0.55 ? 'Higher' : value >= 0.3 ? 'Medium' : 'Lower',
  };
}

export async function get(path) {
  const [route, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  if (route === '/api/static') return hosted('static');
  if (route === '/api/state') return demoTwin.getState();
  if (route === '/api/forecast') return demoTwin.getForecast();
  if (route === '/api/maintenance') return demoTwin.getMaintenance();
  if (route === '/api/trend') return demoTwin.getTrend();
  if (route === '/api/compliance') return demoTwin.getCompliance();
  if (route === '/api/weather') return weather();
  if (route === '/api/terrain') return hosted('terrain');
  if (route === '/api/evaluation') return hosted('evaluation');
  if (route === '/api/heatmap') return hosted(`heatmap-${q.get('index') ?? 'risk'}`);
  if (route === '/api/hazard') return hazard(Number(q.get('lat')), Number(q.get('lon')));
  if (route.startsWith('/api/layer/')) return hosted(`layer-${route.split('/').pop()}`);
  if (route.startsWith('/api/history/')) return demoTwin.getHistory(route.split('/').pop());
  throw new Error(`The hosted demo does not support ${route}.`);
}

export async function post(path, body) {
  if (path === '/api/spill') {
    demoTwin.act('/api/scenario', { name: 'SEPTIC' });
    return { ok: true, message: 'Spill simulated on the farm stream. The hosted demo runs one scripted spill, wherever you click.' };
  }
  return demoTwin.act(path, body);
}
