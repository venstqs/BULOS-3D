import { C } from './theme';

export const BAND = {
  LOW: { color: C.good, ink: '#0a6e0a', label: 'Low', icon: 'checkmark-circle', pill: 'good' },
  MODERATE: { color: C.warning, ink: '#7a5600', label: 'Moderate', icon: 'alert-circle', pill: 'amber' },
  HIGH: { color: C.serious, ink: '#a8461f', label: 'High', icon: 'warning', pill: 'red' },
  SEVERE: { color: C.critical, ink: '#a32626', label: 'Severe', icon: 'close-circle', pill: 'red' },
};
export const MAINT = { color: C.warning, ink: '#7a5600', label: 'Sensor maintenance', icon: 'construct', pill: 'amber' };

export function stationStatus(st) {
  if (st.classification === 'SENSOR_BIOFOULING' || st.edge_state === 'MAINTENANCE') return MAINT;
  return BAND[st.risk_band] ?? BAND.LOW;
}

export const EDGE_LABEL = {
  NORMAL: 'Normal, valve open',
  SUSPECT: 'Suspect, verifying for 2 minutes',
  TRIPPED: 'Closed automatically by the sensor node',
  MAINTENANCE: 'Sensor maintenance, valve kept open',
  REMOTE_SHUT: 'Closed by operator',
  PREEMPTIVE_SHUT: 'Closed ahead of a forecast plume',
};

export const CLASS_LABEL = {
  NORMAL: 'Baseline',
  WATCH: 'Watch',
  ACUTE_EVENT: 'Contamination event',
  SENSOR_BIOFOULING: 'Dirty sensor, not contamination',
};

export const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

export const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtDate = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });

export const fmtMin = (s) => {
  if (s == null) return '—';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

export function quality(score) {
  if (score >= 85) return ['Excellent', 'good'];
  if (score >= 70) return ['Good', 'good'];
  if (score >= 50) return ['Fair', 'amber'];
  return ['Poor', 'red'];
}

export const TASK_PILL = {
  OVERDUE: ['Overdue', 'red'],
  DUE_TODAY: ['Due today', 'amber'],
  UPCOMING: ['Upcoming', 'blue'],
  COMPLETED: ['Completed', 'good'],
};

export function dueIn(ms, now) {
  const d = Math.round((ms - now) / 86_400_000);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Today';
  return `In ${d} day${d === 1 ? '' : 's'}`;
}

export const KIND_ICON = {
  SPRING_INTAKE: 'leaf',
  EXISTING_GOV_SENSOR: 'speedometer',
  COMMUNAL_KIOSK: 'water',
  SOLAR_PUMP_WELL: 'sunny',
  MUNICIPAL_RESERVOIR: 'cube',
  CRITICAL_ENDPOINT: 'medkit',
};
