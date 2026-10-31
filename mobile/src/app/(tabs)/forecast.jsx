import { Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, CardHead, Dot, Empty, Pill, Row, Screen } from '../../components/ui';
import { LineChart, RiverDiagram } from '../../components/charts';
import { useData } from '../../lib/data';
import { C, FONT, STATION_COLOR } from '../../lib/theme';
import { BAND, fmt, fmtMin } from '../../lib/format';

export default function ForecastTab() {
  const { live, forecast, static: st, act } = useData();
  const router = useRouter();
  if (!live) return <Screen title="Forecast" subtitle="Dispersion and arrival times" />;
  const fc = forecast?.stations;
  const next = fc ? Object.entries(fc).map(([id, f]) => ({ id, ...f })).filter((f) => f.arrival_s > 0)
    .sort((a, b) => a.arrival_s - b.arrival_s)[0] : null;
  const name = (id) => live.stations.find((x) => x.id === id)?.name ?? id;
  const setPreempt = (v) => act('/api/policy', { auto_preempt: v },
    v ? 'Automatic intake closing is on.' : 'Automatic intake closing is off.');

  return (
    <Screen title="Forecast" subtitle="Contaminant dispersion, next 4 hours">
      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ionicons name="time" size={30} color={next ? '#b07800' : C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={FONT.small}>Next contaminated arrival</Text>
            <Text style={[FONT.title, { fontSize: 20 }]}>{next ? `${next.id} in ${fmtMin(next.arrival_s)}` : 'None expected'}</Text>
            <Text style={[FONT.small, { color: C.ink2 }]}>
              {next ? `${name(next.id)}. Peak risk ${fmt(next.peak_risk, 2)}, clears in ${next.clear_s ? fmtMin(next.clear_s) : 'over 4 h'}.`
                : 'No polluted water is forecast at any intake.'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={[FONT.body, { flex: 1, color: C.ink2 }]}>Close intakes automatically up to 30 min before contamination arrives</Text>
          <Switch value={live.auto_preempt} onValueChange={setPreempt} trackColor={{ true: C.primary }} />
        </View>
      </Card>

      <Card>
        <CardHead title="Risk forecast at each intake" sub={`Updated every 5 min · engine: ${live.forecast_engine ?? 'in-process'}`} />
        {fc ? (
          <LineChart
            series={Object.keys(fc).map((id) => ({
              id, label: id, color: STATION_COLOR[id],
              points: [{ x: 0, y: live.stations.find((x) => x.id === id)?.risk ?? 0 }].concat(fc[id].series.map((p) => ({ x: p.tau / 60, y: p.risk }))),
            }))}
            yDomain={[0, 1]} height={180} refLines={[{ y: 0.45, label: 'watch' }, { y: 0.6, label: 'close intake' }]}
            xFormat={(x) => `+${Math.round(x)} min`} yFormat={(y) => y.toFixed(1)}
          />
        ) : <Empty text="Waiting for the first forecast run…" />}
      </Card>

      <Card>
        <CardHead title="Arrival windows" />
        {fc && Object.entries(fc).map(([id, f], i, arr) => {
          const band = BAND[f.peak_band];
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
              <Dot id={id} />
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>{name(id)}</Text>
                <Text style={FONT.small}>
                  {f.arrival_s == null ? 'No arrival in 4 h' : f.arrival_s === 0 ? 'Contaminated now' : `Arrives in ${fmtMin(f.arrival_s)}`}
                  {f.clear_s != null ? ` · clears in ${fmtMin(f.clear_s)}` : ''}
                </Text>
              </View>
              <Pill text={`${fmt(f.peak_risk, 2)} ${band.label.toLowerCase()}`} kind={band.pill} icon={band.icon} />
            </View>
          );
        })}
      </Card>

      <Card>
        <CardHead title="River line diagram" sub={st?.site?.subtitle} />
        <RiverDiagram live={live} forecast={forecast} onSelect={(id) => router.push(`/point/${id}`)} />
        <Text style={[FONT.small, { marginTop: 6 }]}>Water colour: clear to polluted. Yellow chips: expected arrival. Red square: intake closed.</Text>
      </Card>

      <Card>
        <CardHead title="Gravity-fed pipelines" sub="Flow from elevation head; stops when a source tank runs empty" />
        {(st?.pipes ?? []).map((p, i, arr) => {
          const d = live.pipes?.find((x) => x.id === p.id);
          return (
            <View key={p.id} style={{ paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: C.line, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[FONT.body, { fontWeight: '700' }]}>{p.id} · {p.name}</Text>
                <Pill text={d?.flowing ? 'Flowing' : 'Stopped'} kind={d?.flowing ? 'good' : 'amber'} />
              </View>
              <Text style={FONT.small}>{p.src} → {p.dst} · {(p.length_m / 1000).toFixed(1)} km · {Math.round(p.diameter_m * 1000)} mm {p.material} · {fmt(p.static_head_m, 0)} m head</Text>
              <Text style={[FONT.body, { color: C.ink2 }]}>{d ? `${fmt(d.flow_lps, 1)} L/s at ${fmt(d.velocity_mps, 2)} m/s. ${d.status}.` : '—'}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <CardHead title="River travel times" sub="Manning velocity, tuned by measured pulses" />
        {live.reaches.map((r, i, arr) => (
          <Row key={r.reach} last={i === arr.length - 1} label={`${r.reach} · ${(r.length_m / 1000).toFixed(1)} km`}
               value={`${fmtMin(r.travel_time_s)} · ${fmt(r.mean_velocity_mps, 2)} m/s${r.velocity_factor !== 1 ? ` · ×${fmt(r.velocity_factor, 2)}` : ''}`} />
        ))}
        {live.calibration.length > 0 && (
          <Text style={[FONT.small, { marginTop: 8 }]}>
            Last field measurement: {live.calibration.at(-1).reach} took {fmtMin(live.calibration.at(-1).measured_s)} (model said {fmtMin(live.calibration.at(-1).modelled_s)}).
          </Text>
        )}
      </Card>
    </Screen>
  );
}
