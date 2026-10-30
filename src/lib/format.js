import { CircleCheck, CircleAlert, TriangleAlert, OctagonAlert, Wrench } from 'lucide-react';

/** Risk bands map onto the reserved status palette; always shown with icon + label. */
export const BAND = {
  LOW: { color: '#0ca30c', ink: '#0a6e0a', label: 'Low', Icon: CircleCheck },
  MODERATE: { color: '#fab219', ink: '#7a5600', label: 'Moderate', Icon: CircleAlert },
  HIGH: { color: '#ec835a', ink: '#a8461f', label: 'High', Icon: TriangleAlert },
  SEVERE: { color: '#d03b3b', ink: '#a32626', label: 'Severe', Icon: OctagonAlert },
};

export const MAINT = { color: '#fab219', ink: '#7a5600', label: 'Sensor maintenance', Icon: Wrench };

/** Station identity colours, upstream -> downstream. */
export const STATION_COLOR = {
  'IN-01': '#2a78d6',
  'AG-02': '#eb6834',
  'KS-03': '#1baf7a',
  'MB-04': '#eda100',
  'RH-05': '#e87ba4',
};

export const EDGE_LABEL = {
  NORMAL: 'Normal, valve open',
  SUSPECT: 'Suspect, verifying for 2 minutes',
  TRIPPED: 'Closed automatically by the edge node',
  MAINTENANCE: 'Sensor maintenance, valve kept open',
  REMOTE_SHUT: 'Closed by operator',
  PREEMPTIVE_SHUT: 'Closed pre-emptively by twin',
};

export const CLASS_LABEL = {
  NORMAL: 'Baseline',
  WATCH: 'Watch',
  ACUTE_EVENT: 'Acute contamination event',
  SENSOR_BIOFOULING: 'Sensor biofouling (not contamination)',
};

export function stationStatus(st) {
  if (st.classification === 'SENSOR_BIOFOULING' || st.edge_state === 'MAINTENANCE') return MAINT;
  return BAND[st.risk_band] ?? BAND.LOW;
}

export const fmtClock = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtMin = (s) => {
  if (s == null) return '—';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

export const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
