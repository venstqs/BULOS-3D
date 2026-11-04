import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, CardHead, Dot, Empty, Pill, Screen, StatusBadge, Tile } from '../../components/ui';
import { LineChart, Spark } from '../../components/charts';
import Logo from '../../components/Logo';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { TASK_PILL, dueIn, fmt, fmtClock, fmtDate, quality, stationStatus } from '../../lib/format';

const ACTIVITY = {
  TASK_DONE: ['Maintenance done', 'checkmark-done', 'Completed', 'good'],
  TASK_ADDED: ['Reminder added', 'notifications', 'Scheduled', 'blue'],
  ADVISORY_SENT: ['SMS advisory sent', 'chatbubble-ellipses', 'Sent', 'blue'],
  CMD_SHUT: ['Intake closed by operator', 'lock-closed', 'Closed', 'amber'],
  CMD_PREEMPT_SHUT: ['Intake closed ahead of plume', 'lock-closed', 'Closed', 'amber'],
  CMD_REARM: ['Intake reopened', 'lock-open', 'Reopened', 'good'],
  CMD_FORCE_REARM: ['Intake reopened (override)', 'lock-open', 'Override', 'red'],
  CMD_CLEANED: ['Probe cleaned', 'sparkles', 'Completed', 'good'],
  EDGE_AUTO_TRIP: ['Intake closed automatically', 'lock-closed', 'Closed', 'red'],
  FORECAST_ADVISORY: ['Contamination forecast', 'time', 'Warning', 'amber'],
  BIOFOULING: ['Dirty sensor detected', 'construct', 'Maintenance', 'amber'],
};

export default function Home() {
  const { live, static: st, trend, tasks, forecast, isStandalone } = useData();
  const router = useRouter();
  const [selId, setSelId] = useState('KS-03');
  if (!live) return <Screen title="Bulos 3D" subtitle="Water quality digital twin" />;

  const now = live.clock.epoch_ms;
  const sel = live.stations.find((x) => x.id === selId) ?? live.stations[0];
  const avg = Math.round(live.stations.reduce((a, x) => a + x.wqhi.score, 0) / live.stations.length);
  const [qLabel, qPill] = quality(avg);
  const attention = live.stations.filter((x) => stationStatus(x).label !== 'Low').length;
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const fc = forecast?.stations?.[sel.id];
  const r = sel.reading;
  const pnsdw = st?.pnsdw ?? { ph_min: 6.5, ph_max: 8.5, tds_mgL: 600, turbidity_ntu: 5 };
  const tiles = [
    ['Temperature', `${fmt(r.temp, 1)}°C`, 'thermometer', r.temp < 32],
    ['pH level', fmt(r.ph, 1), 'water', r.ph >= pnsdw.ph_min && r.ph <= pnsdw.ph_max],
    ['TDS', `${fmt(r.tds, 0)} ppm`, 'analytics', r.tds <= pnsdw.tds_mgL],
    ['Turbidity', `${fmt(r.turbidity, 1)} NTU`, 'eye', sel.classification === 'SENSOR_BIOFOULING' ? null : r.turbidity <= pnsdw.turbidity_ntu],
    ['ORP', `${fmt(r.orp, 0)} mV`, 'flash', r.orp >= sel.baseline.orp - 100],
    ['Biological', r.bio == null ? 'no sensor' : `${fmt(r.bio, 1)} ppb`, 'beaker', r.bio == null ? null : r.bio < 10],
  ];

  return (
    <Screen
      subtitle={`${greet}, operator 👋`}
      title="Keep every water point safe"
      right={<Logo size={42} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -8 }}>
        <Text style={FONT.small}>{st?.site?.subtitle ?? 'Naga City'} · updated {fmtClock(now)}</Text>
        {isStandalone && (
          <Pressable onPress={() => router.push('/settings')}>
            <Pill text="Standalone Demo" kind="amber" />
          </Pressable>
        )}
      </View>

      <Card>
        <CardHead icon="water" title="Water quality" sub={attention ? `${attention} water point${attention > 1 ? 's' : ''} need attention` : 'All water points good'} />
        <Tile style={s.score}>
          <View>
            <Text style={s.big}>{avg}<Text style={{ fontSize: 20 }}>%</Text></Text>
            <Pill text={qLabel} kind={qPill} />
          </View>
          <Spark values={(trend ?? []).map((p) => p.avg)} />
        </Tile>
      </Card>

      <Card>
        <CardHead title="Water point" sub="Tap to switch" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {live.stations.map((x) => (
            <Pressable key={x.id} onPress={() => setSelId(x.id)} style={[s.chip, x.id === sel.id && s.chipOn]}>
              <Dot id={x.id} size={8} />
              <Text style={[s.chipText, x.id === sel.id && { color: C.primary }]}>{x.id}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <Tile style={s.wq}><Text style={s.wqNum}>{sel.wqhi.score}</Text><Text style={FONT.small}>WQHI</Text></Tile>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={FONT.h2} numberOfLines={2}>{sel.name}</Text>
            <StatusBadge st={sel} />
            <Text style={FONT.small} numberOfLines={1}>
              {sel.valve ? (sel.valve.open ? 'Intake open' : 'Intake closed, using stored water') : 'Monitoring point'}
              {fc?.arrival_s > 0 ? ` · plume in ${Math.round(fc.arrival_s / 60)} min` : ''}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Button title="Details" kind="ghost" icon="list" onPress={() => router.push(`/point/${sel.id}`)} style={{ flex: 1 }} />
          <Button title="3D site" icon="cube" onPress={() => router.push(`/site/${sel.id}`)} style={{ flex: 1 }} />
        </View>
      </Card>

      <Card>
        <CardHead title="Today's overview" sub={sel.name} action="3D map" onAction={() => router.push('/map')} />
        <View style={s.grid}>
          {tiles.map(([label, value, icon, ok]) => (
            <Tile key={label} style={s.tile3}>
              <Ionicons name={icon} size={18} color={C.primary} />
              <Text style={s.tileVal} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
              <Text style={FONT.small}>{label}</Text>
              <Text style={[s.tileOk, { color: ok == null ? '#7a5600' : ok ? C.good : '#a32626' }]}>
                {ok == null ? (label === 'Biological' ? 'Not fitted' : 'Check sensor') : ok ? 'Good' : 'Out of range'}
              </Text>
            </Tile>
          ))}
        </View>
      </Card>

      <Card>
        <CardHead title="Quick actions" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            ['Water test', 'flask', () => router.push({ pathname: '/water-test', params: { id: sel.id } })],
            ['Add reminder', 'notifications', () => router.push({ pathname: '/reminder', params: { id: sel.id } })],
            ['Log maintenance', 'clipboard', () => router.push('/log')],
            ['Send advisory', 'chatbubble-ellipses', () => router.push('/advisory')],
          ].map(([label, icon, onPress]) => (
            <Pressable key={label} onPress={onPress} style={s.quick} accessibilityRole="button">
              <View style={s.quickIcon}><Ionicons name={icon} size={22} color={C.primary} /></View>
              <Text style={s.quickText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <CardHead title="Maintenance schedule" action="See all" onAction={() => router.push('/maintenance')} />
        <View style={{ gap: 8 }}>
          {open.slice(0, 3).map((t) => {
            const [label, kind] = TASK_PILL[t.status];
            return (
              <Tile key={t.id} style={s.task} onPress={() => router.push({ pathname: '/log', params: { task: String(t.id) } })}>
                <View style={s.date}>
                  <Text style={s.dateMon}>{new Date(t.due_ms).toLocaleDateString([], { month: 'short' })}</Text>
                  <Text style={s.dateDay}>{new Date(t.due_ms).getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={FONT.small} numberOfLines={1}>{t.station} · {dueIn(t.due_ms, now)}</Text>
                </View>
                <Pill text={t.urgent ? 'Urgent' : label} kind={t.urgent ? 'red' : kind} />
              </Tile>
            );
          })}
          {!open.length && <Empty text="No open tasks." />}
        </View>
      </Card>

      <Card>
        <CardHead title="Water quality trend" sub="Network average, last 12 hours" />
        {trend?.length > 1 ? (
          <LineChart series={[{ id: 'wq', label: 'WQHI', color: C.primary, area: true, points: trend.map((p) => ({ x: p.t_ms, y: p.avg })) }]}
                     yDomain={[0, 100]} xFormat={fmtClock} yFormat={(y) => y.toFixed(0)} />
        ) : <Empty text="Collecting history…" />}
      </Card>

      <Card>
        <CardHead title="Recent activities" action="Reports" onAction={() => router.push('/reports')} />
        {live.events.filter((e) => ACTIVITY[e.type]).slice(0, 5).map((e, i) => {
          const [label, icon, pillText, kind] = ACTIVITY[e.type];
          return (
            <View key={`${e.t_ms}-${i}`} style={s.act}>
              <View style={s.actIcon}><Ionicons name={icon} size={17} color={C.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>{label}{e.station ? `, ${e.station}` : ''}</Text>
                <Text style={FONT.small} numberOfLines={1}>{fmtDate(e.t_ms)} {fmtClock(e.t_ms)} · {e.message}</Text>
              </View>
              <Pill text={pillText} kind={kind} />
            </View>
          );
        })}
        {!live.events.some((e) => ACTIVITY[e.type]) && <Empty text="No activity yet. Actions you take and alerts from the twin appear here." />}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  score: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 16 },
  big: { fontSize: 40, fontWeight: '700', color: C.primary, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  chipOn: { borderColor: C.primary, backgroundColor: '#e7edff' },
  chipText: { fontWeight: '700', color: C.ink2, fontSize: 13 },
  wq: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  wqNum: { fontSize: 24, fontWeight: '700', color: C.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile3: { width: '31.5%', padding: 10, gap: 2 },
  tileVal: { fontSize: 16, fontWeight: '700', color: C.ink, marginTop: 6 },
  tileOk: { fontSize: 11, fontWeight: '700' },
  quick: { alignItems: 'center', width: '24%', gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  quickText: { fontSize: 11, color: C.ink2, textAlign: 'center' },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  date: { width: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  dateMon: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '700', width: '100%', textAlign: 'center', paddingVertical: 2 },
  dateDay: { fontSize: 18, fontWeight: '700', color: C.ink, paddingVertical: 2 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  actIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
});

