import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { demoTwin } from './demoEngine';

const KEY = 'bulos.servers';
const TIMEOUT_MS = 8000;

export const DEMO_BASE = 'standalone';     // explicit, labelled on-phone demo; never a silent fallback

/**
 * Where the data server and the website (for the 3D views) live.
 * Order: EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WEB_URL (a hosted deployment), then the PC
 * running Expo, whose Wi-Fi address is in hostUri ("192.168.0.12:8081").
 */
const HOSTED = process.env.EXPO_PUBLIC_HOSTED === '1';

export function defaultServers() {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || '192.168.0.12';
  return {
    api: HOSTED ? 'demo' : process.env.EXPO_PUBLIC_API_URL || `http://${host}:8000`,
    web: process.env.EXPO_PUBLIC_WEB_URL || `http://${host}:5173`,
    mode: HOSTED ? 'standalone' : 'auto', // 'auto' | 'standalone'
  };
}

export async function loadServers() {
  if (HOSTED) return defaultServers();
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    return { ...defaultServers(), ...(saved ?? {}) };
  } catch {
    return defaultServers();
  }
}

export async function saveServers(servers) {
  await AsyncStorage.setItem(KEY, JSON.stringify(servers));
}

export async function clearServers() {
  await AsyncStorage.removeItem(KEY);
}

const clean = (u) => (u ? u.replace(/\/+$/, '') : '');

async function hostedWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.62&longitude=123.22&current=temperature_2m,precipitation,wind_speed_10m,weather_code&hourly=precipitation&forecast_days=2&timezone=Asia%2FManila');
    const d = await r.json();
    const c = d.current;
    const start = Math.max(0, d.hourly.time.findIndex((h) => h >= c.time.slice(0, 13)));
    const code = c.weather_code;
    return {
      available: true, source: 'Open-Meteo', time: c.time, temp_c: c.temperature_2m, rain_mm: c.precipitation, wind_kmh: c.wind_speed_10m,
      condition: code <= 0 ? 'Clear' : code <= 3 ? 'Cloudy' : code <= 48 ? 'Fog' : code <= 67 ? 'Rain' : code <= 82 ? 'Rain showers' : 'Thunderstorm',
      next24_mm: Number(d.hourly.precipitation.slice(start, start + 24).reduce((a, v) => a + (v ?? 0), 0).toFixed(1)),
    };
  } catch {
    return { available: false };
  }
}

function routeMock(path, method = 'GET', body = null) {
  if (method === 'POST') return demoTwin.act(path, body);
  if (path.startsWith('/api/health')) return { status: 'ok', mode: 'sim', engine: 'standalone' };
  if (path.startsWith('/api/weather')) return HOSTED ? hostedWeather() : { available: false };
  if (path.startsWith('/api/static')) return demoTwin.getStatic();
  if (path.startsWith('/api/state')) return demoTwin.getState();
  if (path.startsWith('/api/forecast')) return demoTwin.getForecast();
  if (path.startsWith('/api/maintenance')) return demoTwin.getMaintenance();
  if (path.startsWith('/api/trend')) return demoTwin.getTrend();
  if (path.startsWith('/api/compliance')) return demoTwin.getCompliance();
  if (path.startsWith('/api/history/')) {
    const id = path.split('/api/history/')[1]?.split('?')[0];
    return demoTwin.getHistory(id);
  }
  throw new Error(`Demo mode does not support ${path}.`);
}

async function request(base, path, init = {}) {
  if (base === DEMO_BASE) {
    return routeMock(path, init.method || 'GET', init.body ? JSON.parse(init.body) : null);
  }
  if (!base) throw new Error('No data server address set.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${clean(base)}${path}`, { ...init, signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The data server did not answer in time.');
    if (/Network request failed/i.test(e.message)) throw new Error('Cannot reach the data server.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = (base, path) => request(base, path);

export const apiPost = (base, path, body) =>
  request(base, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
