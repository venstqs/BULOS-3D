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
export function defaultServers() {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || '192.168.0.12';
  return {
    api: process.env.EXPO_PUBLIC_API_URL || `http://${host}:8000`,
    web: process.env.EXPO_PUBLIC_WEB_URL || `http://${host}:5173`,
    mode: 'auto', // 'auto' | 'standalone'
  };
}

export async function loadServers() {
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

function routeMock(path, method = 'GET', body = null) {
  if (method === 'POST') return demoTwin.act(path, body);
  if (path.startsWith('/api/health')) return { status: 'ok', mode: 'sim', engine: 'standalone' };
  if (path.startsWith('/api/weather')) return { available: false };
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
