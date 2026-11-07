import { C } from './theme';

export const BAND = {
  LOW: { color: C.good, ink: '#0a6e0a', label: 'Low', icon: 'checkmark-circle', pill: 'good' },
  MODERATE: { color: C.warning, ink: '#7a5600', label: 'Moderate', icon: 'alert-circle', pill: 'amber' },
  HIGH: { color: C.serious, ink: '#a8461f', label: 'High', icon: 'warning', pill: 'red' },
  SEVERE: { color: C.critical, ink: '#a32626', label: 'Severe', icon: 'close-circle', pill: 'red' },
};
/** The band a risk value falls in: the same limits as the twin. */
export const bandOf = (risk) => (risk >= 0.6 ? 'SEVERE' : risk >= 0.45 ? 'HIGH' : risk >= 0.25 ? 'MODERATE' : 'LOW');

const EVENTS = {
  TASK_DONE: ['Maintenance done', 'checkmark-done', 'aqua'],
  TASK_ADDED: ['Reminder added', 'notifications', 'blue'],
  ADVISORY_SENT: ['Advisory logged', 'chatbubble-ellipses', 'blue'],
  CMD_SHUT: ['Intake closed by operator', 'lock-closed', 'sun'],
  CMD_PREEMPT_SHUT: ['Intake closed ahead of plume', 'lock-closed', 'sun'],
  CMD_REARM: ['Intake reopened', 'lock-open', 'aqua'],
  CMD_FORCE_REARM: ['Intake reopened by override', 'lock-open', 'coral'],
  CMD_CLEANED: ['Probe cleaned', 'sparkles', 'aqua'],
  EDGE_AUTO_TRIP: ['Intake closed automatically', 'lock-closed', 'coral'],
  FORECAST_ADVISORY: ['Contamination forecast', 'time', 'sun'],
  BIOFOULING: ['Dirty sensor detected', 'construct', 'sun'],
  ANOMALY: ['Unusual reading', 'pulse', 'coral'],
  SCENARIO: ['Simulation update', 'flask', 'violet'],
};
const BY_SEVERITY = { danger: ['warning', 'coral'], warning: ['alert-circle', 'sun'] };

/** A label, an icon and a colour for any event, including ones this list has not met before. */
export function eventInfo(e) {
  const known = EVENTS[e.type];
  if (known) return { label: known[0], icon: known[1], tint: known[2] };
  const words = e.type.replaceAll('_', ' ').toLowerCase();
  const [icon, tint] = BY_SEVERITY[e.severity] ?? ['information-circle', 'blue'];
  return { label: words[0].toUpperCase() + words.slice(1), icon, tint };
}

export const MAINT = { color: C.warning, ink: '#7a5600', label: 'Sensor maintenance', icon: 'construct', pill: 'amber' };

/** True when this reading is a placeholder because the node has no such sensor. */
export const notFitted = (st, key) => Boolean(st.estimated?.includes(key));
export const isRealNode = (st) => /real sensor/i.test(st.link?.source ?? '');

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
