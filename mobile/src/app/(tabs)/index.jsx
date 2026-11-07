import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AdvisoryBanner, Button, Card, Empty, MyPointStar, NextHours, Pill, PressScale, RiskLevels, Screen, StatusBadge, Tile } from '../../components/ui';
import { DrillArt, RiverArt, SafeArt } from '../../components/Art';
import Logo from '../../components/Logo';
import RiverLine from '../../components/RiverLine';
import WaterDisc from '../../components/WaterDisc';
import { useData } from '../../lib/data';
import { C, FONT, TINT } from '../../lib/theme';
import { MAINT, TASK_PILL, dueIn, eventInfo, fmt, fmtClock, fmtDate, fmtMin, notFitted, stationStatus } from '../../lib/format';
import { riverSummary, waterAt, waterLabel, waterRgb } from '../../lib/water';

const FEATURES = [
  ['Is my water safe?', 'A plain answer for your point', SafeArt, 'blue', '/safe'],
  ['Follow a drop', 'Ride the river to the town', RiverArt, 'aqua', '/journey'],
  ['Run a drill', 'Watch the twin respond', DrillArt, 'violet', '/drill'],
];
const WEATHER_ICON = [[/thunder/i, 'thunderstorm'], [/rain|shower|drizzle/i, 'rainy'], [/cloud|overcast|fog/i, 'cloudy'], [/clear|sun/i, 'sunny']];
const weatherIcon = (text = '') => WEATHER_ICON.find(([re]) => re.test(text))?.[1] ?? 'partly-sunny';

function Header({ place }) {
  const router = useRouter();
  const { unread } = useData();
  return (
    <View style={s.brand}>
      <View style={s.logoRing}><Logo size={36} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.brandName}>Bulos 3D</Text>
        <Text style={s.place} numberOfLines={1}>{place}</Text>
      </View>
      <Pressable onPress={() => router.push('/alerts')} style={s.bell} accessibilityRole="button" accessibilityLabel={unread ? `Alerts, ${unread} new` : 'Alerts'}>
        <Ionicons name="notifications" size={20} color="#fff" />
        {unread > 0 && <View style={s.bellBadge}><Text style={s.bellText}>{unread > 9 ? '9+' : unread}</Text></View>}
      </Pressable>
    </View>
  );
}

function Reading({ label, value, ok }) {
  const note = ok == null ? 'Check sensor' : ok ? 'In range' : 'Out of range';
  return (
    <View style={s.reading}>
      <Text style={s.readingValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[FONT.small, { color: C.ink2 }]} numberOfLines={1}>{label}</Text>
      <Text style={[FONT.small, { fontSize: 11, fontWeight: '600', color: ok == null ? '#7a5600' : ok ? '#157a3e' : '#a32626' }]}>{note}</Text>
    </View>
  );
}

function headline(sum) {
  const n = sum.attention.length;
  if (sum.next && sum.coming.length) return `Polluted water reaches ${sum.next.id} in ${fmtMin(sum.nextEta)}`;
  if (n) return `${n} water point${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} attention`;
  return 'The river is running clear';
}

export default function Home() {
  const { live, static: st, tasks, forecast, myPoint, weather } = useData();
  const router = useRouter();
  const [picked, setPicked] = useState(null);
  if (!live) return <Screen dock sky={<Header place="Naga River" />} />;

  const now = live.clock.epoch_ms;
  const sum = riverSummary(live, forecast, tasks);
  // Stays on one point unless the person moves it: their own point first, then whatever needs attention
  const sel = live.stations.find((x) => x.id === (picked ?? myPoint)) ?? sum.attention[0] ?? live.stations.find((x) => x.id === 'KS-03') ?? live.stations[0];
  const [te, od] = waterAt(live, sel.chainage_m);
  const fc = sum.fc[sel.id];
  const r = sel.reading;
  const limit = st?.pnsdw ?? { ph_min: 6.5, ph_max: 8.5, tds_mgL: 600, turbidity_ntu: 5 };
  const readings = [
    ['turbidity', 'Turbidity', `${fmt(r.turbidity, 1)} NTU`, sel.classification === 'SENSOR_BIOFOULING' ? null : r.turbidity <= limit.turbidity_ntu],
    ['ph', 'pH', fmt(r.ph, 1), r.ph >= limit.ph_min && r.ph <= limit.ph_max],
    ['tds', 'TDS', `${fmt(r.tds, 0)} ppm`, r.tds <= limit.tds_mgL],
    ['orp', 'ORP', `${fmt(r.orp, 0)} mV`, r.orp >= sel.baseline.orp - 100],
    ['bio', 'Biological', `${fmt(r.bio, 1)} ppb`, r.bio < 10],
    ['temp', 'Temperature', `${fmt(r.temp, 1)}°C`, r.temp < 32],
  ].filter(([k]) => !notFitted(sel, k) && !(k === 'bio' && r.bio == null));
  const task = sum.open[0];
  const events = live.events.slice(0, 3);

  return (
    <Screen dock advisory={false} sky={(
      <>
        <Header place={st?.site?.subtitle ?? 'Naga River'} />
        <View style={s.hero}>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={[FONT.hero, { color: '#fff' }]}>{headline(sum)}</Text>
            <View style={s.chips}>
              <View style={s.chip}><Ionicons name="flask" size={12} color="#fff" /><Text style={s.chipText}>Simulated</Text></View>
              {weather?.available && (
                <View style={s.chip}>
                  <Ionicons name={weatherIcon(weather.condition)} size={13} color="#fff" />
                  <Text style={s.chipText}>{Math.round(weather.temp_c)}°C</Text>
                </View>
              )}
            </View>
            <Text style={s.updated}>Updated {fmtClock(now)}</Text>
          </View>
          <WaterDisc size={176} rgb={waterRgb(te, od)} style={s.disc}>
            <View style={s.scoreBox}>
              <Text style={s.score}>{sel.wqhi.score}</Text>
              <Text style={s.scoreLabel} numberOfLines={1}>{sel.id} health</Text>
              <Text style={s.scoreLabel} numberOfLines={1} adjustsFontSizeToFit>{waterLabel(te, od)}</Text>
            </View>
          </WaterDisc>
        </View>
      </>
    )}>
      <AdvisoryBanner />

      <View style={s.river}>
        <View style={s.ends}>
          <Text style={[FONT.small, { color: C.ink2 }]}>Upstream</Text>
          <Text style={[FONT.small, { color: C.ink2 }]}>Downstream</Text>
        </View>
        <RiverLine live={live} selected={sel.id} onSelect={setPicked} mine={myPoint} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 18 }}>
        {FEATURES.map(([title, sub, Art, tint, href]) => (
          <PressScale key={href} onPress={() => router.push(href)} style={[s.feature, { backgroundColor: TINT[tint][0] }]} accessibilityLabel={title}>
            <Text style={s.featureTitle}>{title}</Text>
            <Text style={s.featureSub}>{sub}</Text>
            <View style={s.featureArt}><Art color={TINT[tint][1]} /></View>
          </PressScale>
        ))}
      </ScrollView>

      <Card>
        <PressScale onPress={() => router.push(`/point/${sel.id}`)} style={s.pointHead} accessibilityLabel={`Open ${sel.name}`}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[FONT.h2, { fontSize: 18, lineHeight: 24 }]}>{sel.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <StatusBadge st={sel} />
              {sel.valve && <Pill text={sel.valve.open ? 'Intake open' : 'Intake closed'} kind={sel.valve.open ? 'blue' : 'red'} />}
            </View>
          </View>
          <MyPointStar id={sel.id} />
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </PressScale>

        {stationStatus(sel) !== MAINT && <View style={{ marginTop: 16 }}><RiskLevels band={sel.risk_band} /></View>}

        {fc?.series?.length > 0 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={[FONT.body, { fontWeight: '600' }]}>Next 4 hours</Text>
            <NextHours now={sel.risk} series={fc.series} />
          </View>
        )}

        <View style={s.readings}>
          {readings.map(([k, label, value, ok]) => <Reading key={k} label={label} value={value} ok={ok} />)}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Button title="3D map" kind="ghost" icon="map" onPress={() => router.push('/map')} style={{ flex: 1 }} />
          <Button title="3D site" icon="cube" onPress={() => router.push(`/site/${sel.id}`)} style={{ flex: 1 }} />
        </View>
      </Card>

      <View style={s.quickRow}>
        {[
          ['Water test', 'flask', 'aqua', () => router.push({ pathname: '/water-test', params: { id: sel.id } })],
          ['Reminder', 'notifications', 'sun', () => router.push({ pathname: '/reminder', params: { id: sel.id } })],
          ['Log work', 'clipboard', 'violet', () => router.push('/log')],
          ['Advisory', 'chatbubble-ellipses', 'coral', () => router.push('/advisory')],
        ].map(([label, icon, tint, onPress]) => (
          <PressScale key={label} onPress={onPress} style={s.quick} accessibilityLabel={label}>
            <View style={[s.quickIcon, { backgroundColor: TINT[tint][0] }]}><Ionicons name={icon} size={23} color={TINT[tint][1]} /></View>
            <Text style={s.quickText}>{label}</Text>
          </PressScale>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <View style={s.sectionHead}>
          <Text style={FONT.h2}>Next job</Text>
          <Pressable onPress={() => router.push('/maintenance')} hitSlop={10} accessibilityRole="button"><Text style={s.link}>All tasks</Text></Pressable>
        </View>
        {task ? (
          <Tile style={s.task} onPress={() => router.push({ pathname: '/log', params: { task: String(task.id) } })}>
            <View style={s.date}>
              <Text style={s.dateMon}>{new Date(task.due_ms).toLocaleDateString([], { month: 'short' })}</Text>
              <Text style={s.dateDay}>{new Date(task.due_ms).getDate()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[FONT.body, { fontWeight: '600' }]} numberOfLines={1}>{task.title}</Text>
              <Text style={FONT.small} numberOfLines={1}>{task.station}, {dueIn(task.due_ms, now).toLowerCase()}</Text>
            </View>
            <Pill text={task.urgent ? 'Urgent' : TASK_PILL[task.status][0]} kind={task.urgent ? 'red' : TASK_PILL[task.status][1]} />
          </Tile>
        ) : <Empty text="No open tasks." />}
      </View>

      <View style={{ gap: 2 }}>
        <View style={s.sectionHead}>
          <Text style={FONT.h2}>Latest</Text>
          <Pressable onPress={() => router.push('/alerts')} hitSlop={10} accessibilityRole="button"><Text style={s.link}>All alerts</Text></Pressable>
        </View>
        {events.map((e, i) => {
          const info = eventInfo(e);
          return (
            <View key={`${e.t_ms}-${i}`} style={[s.event, i === events.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[s.eventIcon, { backgroundColor: TINT[info.tint][0] }]}><Ionicons name={info.icon} size={17} color={TINT[info.tint][1]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { fontWeight: '600' }]} numberOfLines={1}>{info.label}{e.station ? `, ${e.station}` : ''}</Text>
                <Text style={FONT.small} numberOfLines={1}>{fmtDate(e.t_ms)}, {fmtClock(e.t_ms)}</Text>
              </View>
            </View>
          );
        })}
        {!events.length && <Empty text="Nothing yet. Alerts and the work you log appear here." />}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoRing: { borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  brandName: { fontSize: 17, fontWeight: '700', color: '#fff' },
  place: { fontSize: 12, lineHeight: 17, color: '#e3ecff' },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: C.advisory, alignItems: 'center', justifyContent: 'center' },
  bellText: { fontSize: 11, fontWeight: '600', color: C.ink },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, minHeight: 176 },
  disc: { marginRight: -48, borderWidth: 4, borderColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  updated: { fontSize: 12, color: '#e3ecff' },
  river: { borderRadius: 26, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, backgroundColor: '#e8effe' },
  feature: { width: 186, height: 150, borderRadius: 24, padding: 15, gap: 3, overflow: 'hidden' },
  featureTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: C.ink },
  featureSub: { fontSize: 12, lineHeight: 16, color: C.ink2, paddingRight: 8 },
  featureArt: { position: 'absolute', right: 8, bottom: 6 },
  eventIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  scoreBox: { alignItems: 'center', width: 112, marginRight: 34 },
  score: { fontSize: 46, lineHeight: 52, fontWeight: '700', color: '#fff' },
  scoreLabel: { fontSize: 12, lineHeight: 16, color: '#fff', textAlign: 'center' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: -6 },
  pointHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readings: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 14 },
  reading: { width: '33.3%', paddingRight: 8 },
  readingValue: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 1 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  quick: { alignItems: 'center', width: '24%', gap: 7 },
  quickIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 12, color: C.ink2, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  link: { color: C.primary, fontWeight: '600', fontSize: 13 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  date: { width: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  dateMon: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '600', width: '100%', textAlign: 'center', paddingVertical: 2 },
  dateDay: { fontSize: 18, fontWeight: '700', color: C.ink, paddingVertical: 2 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
});
