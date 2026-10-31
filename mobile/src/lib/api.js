import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY = 'bulos.servers';
const TIMEOUT_MS = 8000;

/**
 * Where the data server and the website (for the 3D views) live.
 * Default: the PC that is running Expo (`npm start` in /mobile) — Expo Go loaded
 * this app from that machine, so its Wi-Fi address is in hostUri ("192.168.0.12:8081").
 * The data server must be started with `npm run start:lan` in the project root.
 */
export function defaultServers() {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || '192.168.0.12';
  return { api: `http://${host}:8000`, web: `http://${host}:5173` };
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

const clean = (u) => u.replace(/\/+$/, '');

async function request(base, path, init = {}) {
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
