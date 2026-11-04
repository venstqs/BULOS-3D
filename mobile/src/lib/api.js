import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { demoTwin } from './demoEngine';

const KEY = 'bulos.servers';
const TIMEOUT_MS = 3500;

let isStandaloneActive = false;

export function getIsStandalone() {
  return isStandaloneActive;
}

export function setStandalone(val) {
  isStandaloneActive = val;
}

/**
 * Where the data server and the website (for the 3D views) live.
 * Default: the PC running Expo, or fallback to standalone/Vercel.
 */
export function defaultServers() {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0] || '192.168.0.12';
  return {
    api: `http://${host}:8000`,
    web: `http://${host}:5173`,
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
  isStandaloneActive = true;
  if (path.startsWith('/api/health')) return { status: 'ok', mode: 'sim', engine: 'standalone' };
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
  if (method === 'POST') {
    return demoTwin.act(path, body);
  }
  return {};
}

async function request(base, path, init = {}) {
  // If explicitly standalone or base not set, run entirely inside React Native
  if (!base || base === 'standalone' || isStandaloneActive) {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    return routeMock(path, method, body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${clean(base)}${path}`, { ...init, signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    isStandaloneActive = false;
    return json;
  } catch (e) {
    // Graceful fallback to pure React Native in-app simulation
    // so the app never shows empty screens when testing offline or without LAN server
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    return routeMock(path, method, body);
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = (base, path) => request(base, path);

export const apiPost = (base, path, body) =>
  request(base, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
