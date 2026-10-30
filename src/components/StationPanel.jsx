import { useState } from 'react';
import { Droplets, Lock, LockOpen, Radio, ShieldAlert, Sparkles, Wrench } from 'lucide-react';
import { post } from '../api';
import { BAND, CLASS_LABEL, EDGE_LABEL, fmt, fmtMin, stationStatus } from '../lib/format';

const PARAMS = [
  { key: 'turbidity', label: 'Turbidity', unit: 'NTU', d: 1, limit: (p) => `PNSDW ≤ ${p.turbidity_ntu}` },
  { key: 'orp', label: 'ORP', unit: 'mV', d: 0, limit: () => 'drop = reducing / faecal' },
  { key: 'ph', label: 'pH', unit: '', d: 2, limit: (p) => `PNSDW ${p.ph_min}–${p.ph_max}` },
  { key: 'tds', label: 'TDS', unit: 'mg/L', d: 0, limit: (p) => `PNSDW ≤ ${p.tds_mgL}` },
  { key: 'bio', label: 'Biological', unit: 'ppb TLF', d: 1, limit: () => 'faecal indicator, alert at 10 ppb' },
];

function Spark({ values, color = '#4a5a66' }) {
  if (!values?.length) return <div className="h-6" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = 96;
  const h = 24;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)}`).join('');
  return <svg width={w} height={h}><path d={d} fill="none" stroke={color} strokeWidth={1.5} /></svg>;
}

export function StatusBadge({ status, className = '' }) {
  const { Icon, color, ink, label } = status;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${className}`}
          style={{ background: `${color}26`, color: ink }}>
      <Icon size={13} strokeWidth={2.5} /> {label}
    </span>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[13px] font-semibold text-ink">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function StationPanel({ st, history, forecast, pnsdw, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!st) return null;
  const status = stationStatus(st);
  const series = history?.series ?? [];
  const fc = forecast?.[st.id];

  const act = async (path, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await post(path, body);
      setMsg({ ok: true, text: r.message });
      onChanged?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed text-ink-2">{st.note}</p>
          <StatusBadge status={status} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-xs text-muted">Elevation</dt><dd className="tabular">{fmt(st.elevation_m, 0)} m</dd></div>
          <div><dt className="text-xs text-muted">Drains</dt><dd className="tabular">{fmt(st.catchment_km2, 1)} km²</dd></div>
          <div><dt className="text-xs text-muted">Serves</dt><dd className="tabular">{st.population ? `${st.population.toLocaleString()} people` : 'monitoring only'}</dd></div>
        </dl>
      </div>

      <Section title="Health">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-panel-2 p-3">
            <div className="text-[11px] text-muted">Water Quality Health Index</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold">{st.wqhi.score}</span>
              <span className="text-xs text-ink-2">/ 100 · {st.wqhi.category.toLowerCase()}</span>
            </div>
          </div>
          <div className="rounded-lg bg-panel-2 p-3">
            <div className="text-[11px] text-muted">Contamination risk (surrogate)</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tabular">{fmt(st.risk, 2)}</span>
              <span className="text-xs text-ink-2">{BAND[st.risk_band].label.toLowerCase()}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-2">
          Classification: <span className="font-medium text-ink">{CLASS_LABEL[st.classification]}</span>
        </div>
        {st.classification === 'SENSOR_BIOFOULING' && st.drift && (
          <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] leading-relaxed text-ink-2">
            <Wrench size={12} className="mr-1 inline text-warning" />
            Turbidity creeping {fmt(st.drift.slope_ntu_per_min * 60, 1)} NTU/h, linear (R² {st.drift.r2}), while ORP
            (±{st.drift.orp_dev} mV) and TDS (±{st.drift.tds_dev}) stay flat and the upstream node is quiet.
            Optical film on the probe. The water is not contaminated, so the intake stays open.
          </div>
        )}
      </Section>

      <Section title="Sensor readings">
        <div className="space-y-2">
          {PARAMS.map((p) => {
            const v = st.reading[p.key];
            const b = st.baseline[p.key];
            const part = st.risk_parts[p.key] ?? 0;
            return (
              <div key={p.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="w-20 text-xs text-ink-2">{p.label}</span>
                    <span className="text-base font-semibold tabular">{fmt(v, p.d)}</span>
                    <span className="text-[11px] text-muted">{p.unit}</span>
                    {part > 0.1 && <span className="text-[11px] font-medium" style={{ color: BAND.HIGH.ink }}>▲ evidence {fmt(part, 2)}</span>}
                  </div>
                  <div className="text-[10.5px] text-muted">baseline {fmt(b, p.d)} · {p.limit(pnsdw)}</div>
                </div>
                <Spark values={series.map((h) => h[p.key]).filter((v) => v != null)} />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Forecast for this water point, next 4 hours">
        {fc && fc.arrival_s != null ? (
          <div className="text-xs leading-relaxed text-ink-2">
            {fc.arrival_s === 0 ? 'Contamination present now.' : <>Plume arrives in <b className="text-ink">{fmtMin(fc.arrival_s)}</b>.</>}{' '}
            Peak risk <b className="text-ink">{fmt(fc.peak_risk, 2)}</b>{fc.peak_s != null && <> in {fmtMin(fc.peak_s)}</>}
            {fc.clear_s != null && <>, clears in {fmtMin(fc.clear_s)}</>}.
          </div>
        ) : (
          <div className="text-xs text-ink-2">No contamination forecast in the next 4 h (peak risk {fmt(fc?.peak_risk ?? 0, 2)}).</div>
        )}
      </Section>

      <Section title="Sensor node and intake valve">
        <div className="text-xs text-ink-2">{EDGE_LABEL[st.edge_state] ?? st.edge_state}</div>
        {st.valve ? (
          <>
            <div className="mt-2 flex items-center gap-2 text-sm">
              {st.valve.open
                ? <><LockOpen size={16} className="text-good" /> <span>Valve <b>open</b></span></>
                : <><Lock size={16} className="text-critical" /> <span>Valve <b>closed</b> — serving stored water</span></>}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">{st.valve.model} · {st.valve.relay}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={busy || !st.valve.open}
                      onClick={() => act('/api/valve', { station_id: st.id, action: 'SHUT' })}
                      className="rounded-md bg-critical/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                Close intake
              </button>
              <button disabled={busy || st.valve.open}
                      onClick={() => act('/api/valve', { station_id: st.id, action: 'REARM' },
                        fc?.arrival_s != null && fc.peak_risk >= 0.45
                          ? `The twin forecasts contaminated water here ${fc.arrival_s === 0 ? 'now' : `in ${fmtMin(fc.arrival_s)}`} (peak risk ${fmt(fc.peak_risk, 2)}). Re-arm anyway?`
                          : null)}
                      className="rounded-md bg-good/90 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                Re-arm (interlocked)
              </button>
              <button disabled={busy || st.valve.open}
                      onClick={() => act('/api/valve', { station_id: st.id, action: 'FORCE_REARM', reason: 'Manual override.' },
                        'Force re-arm bypasses the on-site water-quality interlock. Continue?')}
                      className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-ink-2 disabled:opacity-40">
                Force re-arm
              </button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-[11px] text-muted">Monitoring only (no actuator at this site).</div>
        )}
        {(st.classification === 'SENSOR_BIOFOULING' || st.edge_state === 'MAINTENANCE') && (
          <button disabled={busy} onClick={() => act('/api/maintenance/clean', { station_id: st.id })}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning/90 px-3 py-1.5 text-xs font-semibold text-black">
            <Sparkles size={12} /> Log lens cleaned
          </button>
        )}
        {msg && (
          <div className={`mt-2 flex gap-1.5 text-[11px] ${msg.ok ? 'text-good' : 'text-critical'}`}>
            {!msg.ok && <ShieldAlert size={13} className="shrink-0" />} {msg.text}
          </div>
        )}
      </Section>

      {st.tank && (
        <Section title="Stored-water reserve">
          <div className="flex items-center gap-2">
            <Droplets size={16} className="text-accent" />
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${st.tank.pct ?? 0}%` }} />
            </div>
            <span className="w-12 text-right text-xs tabular">{fmt(st.tank.pct, 0)}%</span>
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {(st.tank.capacity_l / 1000).toFixed(st.tank.capacity_l < 10000 ? 1 : 0)} m³ tank · ≈ {fmt(st.tank.reserve_h, 1)} h of supply at current demand
          </div>
        </Section>
      )}

      <Section title="Telemetry link">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <span className="text-muted"><Radio size={11} className="mr-1 inline" />Network</span><span className="text-ink-2">{st.network}</span>
          <span className="text-muted">Gateway</span><span className="text-ink-2">{st.gateway}</span>
          <span className="text-muted">Owner</span><span className="text-ink-2">{st.owner}</span>
          <span className="text-muted">RSSI / SNR</span><span className="text-ink-2 tabular">{st.link.rssi ?? '—'} dBm / {st.link.snr ?? '—'} dB</span>
          <span className="text-muted">Battery</span><span className="text-ink-2 tabular">{fmt(st.link.battery_v, 2)} V</span>
          <span className="text-muted">Source</span><span className="truncate text-ink-2">{st.link.source ?? '—'}</span>
        </div>
      </Section>
    </div>
  );
}
