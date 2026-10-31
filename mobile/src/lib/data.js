import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { apiGet, apiPost, loadServers, saveServers, clearServers, defaultServers } from './api';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

/* One poller per endpoint. Never stacks requests, pauses while the app is in the background. */
function usePoll(base, path, intervalMs, active) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const have = useRef(null);                 // which server the current data came from

  const refresh = useCallback(async () => {
    if (!base || !path || busy.current) return;
    busy.current = true;
    try {
      const next = await apiGet(base, path);
      setData(next);
      have.current = base;
      setStatus('online');
      setError(null);
    } catch (e) {
      setStatus('offline');
      setError(e.message);
    } finally {
      busy.current = false;
    }
  }, [base, path]);

  useEffect(() => {
    if (!active) return undefined;
    // poll from timer callbacks; one-shot endpoints keep retrying until they have data for this server
    const tick = () => { if (intervalMs || have.current !== base) refresh(); };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs || 4000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [refresh, intervalMs, active, base]);

  return { data, status, error, refresh };
}

export function DataProvider({ children }) {
  const [servers, setServersState] = useState(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [toast, setToast] = useState(null);
  const [heatIndex, setHeatIndex] = useState('risk');
  const seenDanger = useRef(null);

  useEffect(() => { loadServers().then(setServersState); }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const base = servers?.api;
  const staticQ = usePoll(base, '/api/static', 0, active);
  const live = usePoll(base, '/api/state', 2000, active);
  const forecast = usePoll(base, '/api/forecast', 5000, active);
  const maint = usePoll(base, '/api/maintenance', 5000, active);
  const trend = usePoll(base, '/api/trend?hours=12&bucket_min=30', 30000, active);

  // buzz once when a new danger alert arrives
  useEffect(() => {
    const top = live.data?.events?.find((e) => e.severity === 'danger');
    if (!top) return;
    const key = `${top.t_ms}-${top.type}-${top.station}`;
    if (seenDanger.current && seenDanger.current !== key) Vibration.vibrate([0, 250, 120, 250]);
    seenDanger.current = key;
  }, [live.data]);

  const notify = useCallback((ok, text) => {
    const id = Date.now();
    setToast({ ok, text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 5500);
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
  }, []);
  const resetServers = useCallback(async () => {
    await clearServers();
    setServersState(defaultServers());
  }, []);

  const value = {
    servers, setServers, resetServers,
    static: staticQ.data, live: live.data, forecast: forecast.data, tasks: maint.data?.tasks, trend: trend.data?.series,
    status: live.status, error: live.error, refresh: live.refresh,
    act, notify, toast, dismissToast: () => setToast(null),
    heatIndex, setHeatIndex,
  };
  return createElement(DataContext.Provider, { value }, children);
}
