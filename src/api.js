import { useCallback, useEffect, useRef, useState } from 'react';

export const API = import.meta.env.VITE_API ?? 'http://127.0.0.1:8000';
const TIMEOUT_MS = 8000;

export async function get(path) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
  return json;
}

/**
 * Poll an endpoint. Never stacks requests: the next poll waits for the
 * previous one, and every request gives up after 8 s.
 * status: 'connecting' | 'online' | 'offline'
 */
export function usePoll(path, intervalMs) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('connecting');
  const busy = useRef(false);
  const have = useRef(false);

  const refresh = useCallback(async () => {
    if (!path || busy.current) return;
    busy.current = true;
    try {
      setData(await get(path));
      have.current = true;
      setStatus('online');
    } catch {
      setStatus('offline');
    } finally {
      busy.current = false;
    }
  }, [path]);

  useEffect(() => {
    refresh();
    // static data is fetched once, but retried until it arrives
    const every = intervalMs || 3000;
    const id = setInterval(() => { if (intervalMs || !have.current) refresh(); }, every);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, online: status === 'online', status, refresh };
}
