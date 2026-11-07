import { StyleSheet, Switch, View } from 'react-native';
import Text from '../../components/Text';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHead, Empty, Fold, Pill, Row, Screen } from '../../components/ui';
import { LineChart, RiverDiagram } from '../../components/charts';
import { useData } from '../../lib/data';
import { C, FONT, STATION_COLOR, TINT } from '../../lib/theme';
import { BAND, fmt, fmtMin } from '../../lib/format';

const SPAN_S = 4 * 3600;

/** When polluted water is due at each intake, on one shared four-hour line. */
function ArrivalRow({ id, name, f, last }) {
  const band = BAND[f.peak_band];
  const from = f.arrival_s == null ? null : Math.min(1, f.arrival_s / SPAN_S);
  const to = f.clear_s == null ? 1 : Math.min(1, f.clear_s / SPAN_S);
  const text = f.arrival_s == null ? 'No arrival' : f.arrival_s === 0 ? 'Here now' : `In ${fmtMin(f.arrival_s)}`;
  return (
    <View style={[s.arrival, last && { marginBottom: 0 }]}>
      <View style={s.arrivalHead}>
        <Text style={[FONT.body, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>{id}, {name}</Text>
        <Text style={[FONT.small, { color: from == null ? C.muted : C.ink, fontWeight: '600' }]}>{text}</Text>
      </View>
      <View style={s.track}>
        {from != null && <View style={[s.span, { left: `${from * 100}%`, width: `${Math.max(3, (to - from) * 100)}%`, backgroundColor: band.color }]} />}
      </View>
    </View>
  );
}

export default function ForecastTab() {
  const { live, forecast, static: st, act, weather } = useData();
  const router = useRouter();
  if (!live) return <Screen dock sky title="Forecast" subtitle="The next 4 hours" />;
  const fc = forecast?.stations;
  const next = fc ? Object.entries(fc).map(([id, f]) => ({ id, ...f })).filter((f) => f.arrival_s > 0)
    .sort((a, b) => a.arrival_s - b.arrival_s)[0] : null;
  const name = (id) => live.stations.find((x) => x.id === id)?.name ?? id;
  const setPreempt = (v) => act('/api/policy', { auto_preempt: v },
    v ? 'Automatic intake closing is on.' : 'Automatic intake closing is off.');

  return (
    <Screen dock sky={(
      <View style={{ gap: 6 }}>
        <Text style={s.kicker}>Next 4 hours, in simulation</Text>
        <Text style={[FONT.hero, { color: '#fff' }]}>{next ? `${next.id} in ${fmtMin(next.arrival_s)}` : 'No polluted water expected'}</Text>
        <Text style={s.lead}>
          {next ? `${name(next.id)}. Peak risk ${fmt(next.peak_risk, 2)}, clears in ${next.clear_s ? fmtMin(next.clear_s) : 'over 4 h'}.`
            : 'Nothing is forecast to reach an intake.'}
        </Text>
      </View>
    )}>

      <Card>
        <View style={s.scale}>
          {['Now', '1 h', '2 h', '3 h', '4 h'].map((t) => <Text key={t} style={FONT.small}>{t}</Text>)}
        </View>
        {fc ? Object.entries(fc).map(([id, x], i, arr) => <ArrivalRow key={id} id={id} name={name(id)} f={x} last={i === arr.length - 1} />)
          : <Empty text="Waiting for the first forecast run…" />}
      </Card>

      {weather?.available && (
        <View style={s.weather}>
          <View style={s.weatherHead}>
            <Text style={FONT.h2}>Weather now</Text>
            <Text style={[FONT.small, { color: C.ink2 }]}>Live from {weather.source}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {[['thermometer', `${fmt(weather.temp_c, 0)}°C`, weather.condition], ['rainy', `${fmt(weather.rain_mm, 1)} mm`, 'Rain now'], ['umbrella', `${fmt(weather.next24_mm, 1)} mm`, 'Next 24 h'], ['flag', `${fmt(weather.wind_kmh, 0)} km/h`, 'Wind']].map(([icon, value, label]) => (
              <View key={icon} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Ionicons name={icon} size={20} color={TINT.blue[1]} />
                <Text style={[FONT.body, { fontWeight: '600' }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                <Text style={[FONT.small, { color: C.ink2 }]} numberOfLines={1}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Card style={{ backgroundColor: TINT.aqua[0] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={FONT.h2}>Close intakes early</Text>
            <Text style={[FONT.small, { marginTop: 2, color: C.ink2 }]}>Up to 30 minutes before contamination arrives</Text>
          </View>
          <Switch value={live.auto_preempt} onValueChange={setPreempt} trackColor={{ true: C.primary }} accessibilityLabel="Close intakes early" />
        </View>
      </Card>

      <Card>
        <CardHead title="Risk forecast at each intake" sub="Updated every 5 minutes" />
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
        <CardHead title="The river now" sub={st?.site?.subtitle} />
        <RiverDiagram live={live} forecast={forecast} onSelect={(id) => router.push(`/point/${id}`)} />
        <Text style={[FONT.small, { marginTop: 6 }]}>Water colour: clear to polluted. Yellow chips: expected arrival. Red square: intake closed.</Text>
      </Card>

      <Fold title="Gravity-fed pipelines" sub="Flow from elevation head. Stops when a source tank runs empty.">
        {(st?.pipes ?? []).map((p, i, arr) => {
          const d = live.pipes?.find((x) => x.id === p.id);
          return (
            <View key={p.id} style={{ paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: C.line, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[FONT.body, { fontWeight: '700' }]}>{p.id}, {p.name}</Text>
                <Pill text={d?.flowing ? 'Flowing' : 'Stopped'} kind={d?.flowing ? 'good' : 'amber'} />
              </View>
              <Text style={FONT.small}>{p.src} → {p.dst}, {(p.length_m / 1000).toFixed(1)} km, {Math.round(p.diameter_m * 1000)} mm {p.material}, {fmt(p.static_head_m, 0)} m head</Text>
              <Text style={[FONT.body, { color: C.ink2 }]}>{d ? `${fmt(d.flow_lps, 1)} L/s at ${fmt(d.velocity_mps, 2)} m/s. ${d.status}.` : '—'}</Text>
            </View>
          );
        })}
      </Fold>

      <Fold title="River travel times" sub="Manning velocity, tuned by measured pulses">
        {live.reaches.map((r, i, arr) => (
          <Row key={r.reach} last={i === arr.length - 1} label={`${r.reach}, ${(r.length_m / 1000).toFixed(1)} km`}
               value={`${fmtMin(r.travel_time_s)}, ${fmt(r.mean_velocity_mps, 2)} m/s${r.velocity_factor !== 1 ? `, ×${fmt(r.velocity_factor, 2)}` : ''}`} />
        ))}
        {live.calibration.length > 0 && (
          <Text style={[FONT.small, { marginTop: 8 }]}>
            Last field measurement: {live.calibration.at(-1).reach} took {fmtMin(live.calibration.at(-1).measured_s)} (model said {fmtMin(live.calibration.at(-1).modelled_s)}).
          </Text>
        )}
      </Fold>
    </Screen>
  );
}

const s = StyleSheet.create({
  kicker: { fontSize: 14, lineHeight: 19, color: '#e3ecff' },
  lead: { fontSize: 14, lineHeight: 20, color: '#fff' },
  weather: { backgroundColor: TINT.blue[0], borderRadius: 26, padding: 18, gap: 12 },
  weatherHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  arrival: { marginBottom: 14, gap: 6 },
  arrivalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 10, borderRadius: 5, backgroundColor: '#fff', overflow: 'hidden' },
  span: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
});
