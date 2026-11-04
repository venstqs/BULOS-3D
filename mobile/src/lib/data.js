import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { apiGet, apiPost, loadServers, saveServers, clearServers, defaultServers, getIsStandalone, setStandalone } from './api';
import { demoTwin } from './demoEngine';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

/* One poller per endpoint. Never stacks requests, pauses while the app is in the background. */
function usePoll(base, path, intervalMs, active) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const have = useRef(null);

  const refresh = useCallback(async () => {
    if (!path || busy.current) return;
    busy.current = true;
    try {
      const next = await apiGet(base, path);
      setData(next);
      have.current = base;
      setStatus(getIsStandalone() ? 'standalone' : 'online');
      setError(null);
    } catch (e) {
      // Fallback
      setStatus('standalone');
      setError(null);
    } finally {
      busy.current = false;
    }
  }, [base, path]);

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => { if (intervalMs || have.current !== base) refresh(); };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs || 2500);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh, intervalMs, active, base]);

  return { data, status, error, refresh };
}

export function DataProvider({ children }) {
  const [servers, setServersState] = useState(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [toast, setToast] = useState(null);
  const [heatIndex, setHeatIndex] = useState('risk');
  const [standalone, setStandaloneState] = useState(false);
  const seenDanger = useRef(null);

  useEffect(() => {
    loadServers().then((sv) => {
      setServersState(sv);
      if (sv?.mode === 'standalone') {
        setStandalone(true);
        setStandaloneState(true);
      }
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Tick the in-app twin simulator every second
  useEffect(() => {
    const id = setInterval(() => {
      demoTwin.tick();
      setStandaloneState(getIsStandalone());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const base = standalone ? 'standalone' : servers?.api;
  const staticQ = usePoll(base, '/api/static', 0, active);
  const live = usePoll(base, '/api/state', 1500, active);
  const forecast = usePoll(base, '/api/forecast', 4000, active);
  const maint = usePoll(base, '/api/maintenance', 4000, active);
  const trend = usePoll(base, '/api/trend?hours=12&bucket_min=30', 20000, active);

  // Vibrate phone once when high-risk contamination arrives
  useEffect(() => {
    const top = live.data?.events?.find((e) => e.severity === 'danger');
    if (!top) return;
    const key = `${top.t_ms}-${top.type}-${top.station}`;
    if (seenDanger.current && seenDanger.current !== key) {
      try {
        Vibration.vibrate([0, 250, 120, 250]);
      } catch {
        /* ignore on unsupported platforms */
      }
    }
    seenDanger.current = key;
  }, [live.data]);

  const notify = useCallback((ok, text) => {
    const id = Date.now();
    setToast({ ok, text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5000);
  }, []);

  /** POST an action, show the outcome, refresh. Resolves to true on success. */
  const act = useCallback(async (path, body, success) => {
    try {
      const r = await apiPost(base, path, body);
      notify(true, typeof success === 'function' ? success(r) : success ?? r.message ?? 'Done.');
      live.refresh();
      maint.refresh();
      return true;
    } catch (e) {
      notify(false, e.message);
      return false;
    }
  }, [base, notify, live, maint]);

  const setServers = useCallback(async (next) => {
    await saveServers(next);
    setServersState(next);
    if (next.mode === 'standalone') {
      setStandalone(true);
      setStandaloneState(true);
    } else {
      setStandalone(false);
      setStandaloneState(false);
    }
  }, []);

  const resetServers = useCallback(async () => {
    await clearServers();
    setStandalone(false);
    setStandaloneState(false);
    setServersState(defaultServers());
  }, []);

  const toggleStandalone = useCallback(async () => {
    const nextVal = !standalone;
    setStandalone(nextVal);
    setStandaloneState(nextVal);
    if (servers) {
      await saveServers({ ...servers, mode: nextVal ? 'standalone' : 'auto' });
    }
    notify(true, nextVal ? 'Switched to React Native Standalone Demo Mode.' : 'Switched to Live Data Server Mode.');
    live.refresh();
    staticQ.refresh();
  }, [standalone, servers, notify, live, staticQ]);

  const value = {
    servers, setServers, resetServers, toggleStandalone, isStandalone: standalone,
    static: staticQ.data || demoTwin.getStatic(),
    live: live.data || demoTwin.getState(),
    forecast: forecast.data || demoTwin.getForecast(),
    tasks: maint.data?.tasks || demoTwin.getMaintenance().tasks,
    trend: trend.data?.series || demoTwin.getTrend().series,
    status: live.status, error: live.error, refresh: live.refresh,
    act, notify, toast, dismissToast: () => setToast(null),
    heatIndex, setHeatIndex,
  };
  return createElement(DataContext.Provider, { value }, children);
}
