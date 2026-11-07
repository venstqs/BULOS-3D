import { useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import Text from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, CardHead, Empty, Meter, MyPointStar, NextHours, Pill, Row, Screen, StatusBadge } from '../../components/ui';
import { Gauge, LineChart } from '../../components/charts';
import WaterDisc from '../../components/WaterDisc';
import { apiGet } from '../../lib/api';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { shareText, waterVerdict } from '../../lib/safety';
import { waterAt, waterLabel, waterRgb } from '../../lib/water';
import { BAND, CLASS_LABEL, EDGE_LABEL, fmt, fmtClock, fmtMin, isRealNode, notFitted } from '../../lib/format';

function gaugeStatus(k, r, b) {
  if (k === 'turbidity') return r.turbidity <= 5 ? 'good' : r.turbidity <= 10 ? 'warning' : 'critical';
  if (k === 'orp') return r.orp >= b.orp - 60 ? 'good' : r.orp >= b.orp - 150 ? 'warning' : 'critical';
  if (k === 'ph') return r.ph >= 6.5 && r.ph <= 8.5 ? 'good' : r.ph >= 6 && r.ph <= 9 ? 'warning' : 'critical';
  if (k === 'tds') return r.tds <= 500 ? 'good' : r.tds <= 600 ? 'warning' : 'critical';
  if (k === 'bio') return r.bio == null ? 'info' : r.bio < 5 ? 'good' : r.bio < 10 ? 'warning' : 'critical';
  return 'info';
}

const PART_LABEL = { turbidity: 'Turbidity', orp: 'ORP', ph: 'pH', tds: 'TDS', bio: 'Biological' };

export default function PointDetail() {
  const { id } = useLocalSearchParams();
  const { live, forecast, apiBase, act } = useData();
  const router = useRouter();
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!apiBase) return undefined;
    let alive = true;
    const load = () => apiGet(apiBase, `/api/history/${id}?minutes=360`).then((h) => alive && setHistory(h.series)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [apiBase, id]);

  const st = live?.stations.find((x) => x.id === id);
  if (!st) return <Screen edges={[]}><Stack.Screen options={{ title: id }} /><Empty text="Loading…" /></Screen>;
  const r = st.reading;
  const b = st.baseline;
  const f = forecast?.stations?.[st.id];

  const valve = async (action, confirm) => {
    const run = async () => {
      setBusy(action);
      await act('/api/valve', { station_id: st.id, action, operator: 'Mobile operator' }, (res) => res.message);
      setBusy(null);
    };
    if (confirm) Alert.alert(confirm[0], confirm[1], [{ text: 'Cancel', style: 'cancel' }, { text: confirm[2], style: 'destructive', onPress: run }]);
    else run();
  };
  const plumeComing = f?.arrival_s != null && f.peak_risk >= 0.45;

  return (
    <Screen edges={[]} advisory={false}>
      <Stack.Screen options={{ title: st.id }} />

      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <WaterDisc size={92} rgb={waterRgb(...waterAt(live, st.chainage_m))}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>{st.wqhi.score}</Text>
          </WaterDisc>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={[FONT.h2, { flex: 1 }]}>{st.name}</Text>
              <MyPointStar id={st.id} />
            </View>
            <StatusBadge st={st} />
            {isRealNode(st) && <Pill text="Real sensor" kind="good" icon="radio" />}
            <Text style={FONT.small}>{waterLabel(...waterAt(live, st.chainage_m))}, {CLASS_LABEL[st.classification].toLowerCase()}, risk {fmt(st.risk, 2)}</Text>
          </View>
        </View>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 10 }]}>{st.note}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button title="3D site view" icon="cube" onPress={() => router.push(`/site/${st.id}`)} style={{ flex: 1 }} />
          <Button title="Is it safe?" kind="ghost" icon="shield-checkmark" onPress={() => router.push({ pathname: '/safe', params: { id: st.id } })} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Water test" kind="ghost" icon="flask" onPress={() => router.push({ pathname: '/water-test', params: { id: st.id } })} style={{ flex: 1 }} />
          <Button title="Share" kind="ghost" icon="share-outline" style={{ flex: 1 }}
                  onPress={() => Share.share({ message: shareText(st, waterVerdict(st, live, forecast?.stations ?? {})) }).catch(() => {})} />
        </View>
      </Card>

      {st.classification === 'SENSOR_BIOFOULING' && st.drift && (
        <Card style={{ backgroundColor: '#fff8e1', borderColor: '#f4dd8a' }}>
          <CardHead icon="construct" title="Dirty sensor, not contamination" />
          <Text style={[FONT.body, { color: C.ink2 }]}>
            Turbidity is creeping up {fmt(st.drift.slope_ntu_per_min * 60, 1)} NTU/h in a straight line while ORP (±{st.drift.orp_dev} mV) and TDS stay flat
            and the upstream node is quiet. That is biofilm on the probe, so the intake stays open.
          </Text>
          <Button title="Log probe cleaning" icon="sparkles" style={{ marginTop: 12 }}
                  onPress={() => act('/api/maintenance/clean', { station_id: st.id, technician: 'Mobile technician' }, 'Probe cleaning logged; drift check reset.')} />
        </Card>
      )}

      <Card>
        <CardHead title="Live telemetry" sub={`Baseline ORP ${fmt(b.orp, 0)} mV, updated ${fmtClock(live.clock.epoch_ms)}`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Gauge label="Turbidity" unit="NTU" value={r.turbidity} min={0} max={50} status={gaugeStatus('turbidity', r, b)} />
          {!notFitted(st, 'ph') && <Gauge label="pH" unit="" value={r.ph} min={4} max={10} digits={2} status={gaugeStatus('ph', r, b)} />}
          {!notFitted(st, 'tds') && <Gauge label="TDS" unit="mg/L" value={r.tds} min={0} max={1000} digits={0} status={gaugeStatus('tds', r, b)} />}
          {!notFitted(st, 'orp') && <Gauge label="ORP" unit="mV" value={r.orp} min={0} max={600} digits={0} status={gaugeStatus('orp', r, b)} />}
          <Gauge label="Biological" unit="ppb" value={r.bio} min={0} max={40} status={gaugeStatus('bio', r, b)} />
          <Gauge label="Temperature" unit="°C" value={r.temp} min={15} max={40} />
        </View>
      </Card>

      <Card>
        <CardHead title="Health index breakdown" />
        {Object.entries(st.wqhi.parts).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Text style={[FONT.small, { width: 74, color: C.ink2 }]}>{PART_LABEL[k] ?? k}</Text>
            <View style={{ flex: 1 }}><Meter pct={v} height={7} /></View>
            <Text style={[FONT.small, { width: 28, textAlign: 'right', color: C.ink }]}>{v}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <CardHead title="Forecast, next 4 hours" />
        <Text style={[FONT.body, { color: C.ink2 }]}>
          {f?.arrival_s == null ? `No contamination expected (peak risk ${fmt(f?.peak_risk ?? 0, 2)}).`
            : f.arrival_s === 0 ? `Contaminated now. Peak risk ${fmt(f.peak_risk, 2)}${f.clear_s ? `, clears in ${fmtMin(f.clear_s)}` : ''}.`
              : `Polluted water arrives in ${fmtMin(f.arrival_s)}. Peak risk ${fmt(f.peak_risk, 2)}${f.clear_s ? `, clears in ${fmtMin(f.clear_s)}` : ''}.`}
        </Text>
        {f?.series?.length > 0 && <View style={{ marginTop: 12 }}><NextHours now={st.risk} series={f.series} /></View>}
        {st.aquifer && <Text style={[FONT.small, { marginTop: 6 }]}>Shallow well: groundwater follows the river later and weaker (riverbank filtration).</Text>}
      </Card>

      <Card>
        <CardHead title="Sensor node and intake" sub={EDGE_LABEL[st.edge_state]} />
        {st.valve ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name={st.valve.open ? 'lock-open' : 'lock-closed'} size={18} color={st.valve.open ? C.good : C.critical} />
              <Text style={[FONT.body, { fontWeight: '700' }]}>{st.valve.open ? 'Valve open' : 'Valve closed, serving stored water'}</Text>
            </View>
            <Text style={FONT.small}>{st.valve.model}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button title="Close intake" kind="danger" icon="lock-closed" disabled={!st.valve.open} busy={busy === 'SHUT'}
                      onPress={() => valve('SHUT', ['Close this intake?', `${st.name} will switch to stored water.`, 'Close'])} />
              <Button title="Re-arm" icon="lock-open" disabled={st.valve.open} busy={busy === 'REARM'}
                      onPress={() => valve('REARM', plumeComing ? ['Contamination forecast', `The twin expects polluted water here ${f.arrival_s === 0 ? 'now' : `in ${fmtMin(f.arrival_s)}`}. Re-arm anyway?`, 'Re-arm'] : null)} />
              <Button title="Force re-arm" kind="ghost" disabled={st.valve.open} busy={busy === 'FORCE_REARM'}
                      onPress={() => valve('FORCE_REARM', ['Bypass the safety interlock?', 'Force re-arm opens the intake even if the water on site is still contaminated.', 'Force re-arm'])} />
            </View>
            <Text style={[FONT.small, { marginTop: 8 }]}>Re-arm is refused on site while the water is still contaminated.</Text>
          </>
        ) : <Text style={FONT.small}>Monitoring only, no valve at this site.</Text>}
      </Card>

      {st.tank && (
        <Card>
          <CardHead title="Stored-water reserve" />
          <Meter pct={st.tank.pct ?? 0} height={10} />
          <Text style={[FONT.small, { marginTop: 6 }]}>{fmt(st.tank.pct, 0)}% of {(st.tank.capacity_l / 1000).toFixed(1)} m³, about {fmt(st.tank.reserve_h, 1)} h of supply</Text>
        </Card>
      )}

      <Card>
        <CardHead title="Last 6 hours" />
        {history?.length > 1 ? (
          <View style={{ gap: 14 }}>
            {[['turbidity', 'Turbidity (NTU)', 0], ['orp', 'ORP (mV)', 0], ['bio', 'Biological (ppb TLF)', 1], ['risk', 'Contamination risk', 2]].map(([k, label, d]) => (
              <View key={k}>
                <Text style={[FONT.small, { marginBottom: 2 }]}>{label}</Text>
                <LineChart height={110} series={[{ id: k, label, color: C.primary, points: history.map((h) => ({ x: h.t_ms, y: h[k] })) }]}
                           xFormat={fmtClock} yFormat={(y) => y.toFixed(d)} yDomain={k === 'risk' ? [0, 1] : undefined} />
              </View>
            ))}
          </View>
        ) : <Empty text="Loading history…" />}
      </Card>

      <Card>
        <CardHead title="Telemetry link" />
        <Row label="Network" value={st.network} />
        <Row label="Gateway" value={st.gateway} />
        <Row label="Signal" value={`${st.link.rssi ?? '—'} dBm, SNR ${st.link.snr ?? '—'} dB`} />
        <Row label="Battery" value={`${fmt(st.link.battery_v, 2)} V`} />
        <Row label="Elevation" value={`${fmt(st.elevation_m, 0)} m`} />
        <Row label="Contact" value={st.sms ?? 'none'} last />
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pill text={BAND[st.risk_band].label} kind={BAND[st.risk_band].pill} icon={BAND[st.risk_band].icon} />
        <Button title="Add reminder for this point" kind="ghost" icon="notifications" style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/reminder', params: { id: st.id } })} />
      </View>
    </Screen>
  );
}
