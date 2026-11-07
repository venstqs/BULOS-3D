import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Dot, Meter, Pill, PressScale, Reveal, StatusBadge, Toast } from '../../components/ui';
import Logo from '../../components/Logo';
import Web3D from '../../components/Web3D';
import { useData } from '../../lib/data';
import { fmt, fmtMin, stationStatus } from '../../lib/format';
import { C, FONT, shadow } from '../../lib/theme';

const LAYERS = { risk: 'Risk', turbidity: 'Turbidity', ph: 'pH', tds: 'TDS', bio: 'Biological', none: 'None' };
const KEY = { risk: ['Moderate', 'Severe'], turbidity: ['Clear', 'Cloudy'], ph: ['Normal', 'Off range'], tds: ['Low', 'High'], bio: ['Low', 'High'] };
const RAMP = ['#ffe05a', '#fa9628', '#e0342c'];
const PEEK = 150;     // how much of the sheet shows when lowered
const OPEN = 370;     // its height when raised

function Fact({ label, value }) {
  return (
    <View style={s.fact}>
      <Text style={FONT.h2} numberOfLines={1}>{value}</Text>
      <Text style={FONT.small} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** The whole river at a glance, shown when nothing is selected. */
function RiverSummary({ live, fc, onPick }) {
  const affected = live.stations.filter((x) => x.risk >= 0.45 || fc[x.id]?.arrival_s > 0);
  return (
    <>
      <Text style={FONT.h2}>{affected.length ? `${affected.length} water point${affected.length > 1 ? 's' : ''} affected` : 'The river is clear'}</Text>
      <Text style={FONT.small}>Tap the map to check any spot. Readings are simulated.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
        {live.stations.map((st) => (
          <PressScale key={st.id} onPress={() => onPick(st.id)} style={s.point}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[s.status, { backgroundColor: stationStatus(st).color }]} />
              <Text style={[FONT.body, { fontWeight: '700' }]}>{st.id}</Text>
            </View>
            <Text style={FONT.small}>{fc[st.id]?.arrival_s > 0 ? `Plume in ${fmtMin(fc[st.id].arrival_s)}` : `Health ${st.wqhi.score}`}</Text>
          </PressScale>
        ))}
      </ScrollView>
    </>
  );
}

/** A report for one water point, in the spirit of a hazard report for a place. */
function PointReport({ st, eta, onClose, onDetails, onSite }) {
  return (
    <>
      <View style={s.reportHead}>
        <Dot id={st.id} size={12} />
        <View style={{ flex: 1 }}>
          <Text style={FONT.h2} numberOfLines={1}>{st.name}</Text>
          <Text style={FONT.small}>{st.id}. Readings are simulated.</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close report"><Ionicons name="close" size={20} color={C.muted} /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <StatusBadge st={st} />
        {st.valve && <Pill text={st.valve.open ? 'Intake open' : 'Intake closed'} kind={st.valve.open ? 'good' : 'red'} />}
        {eta > 0 && <Pill text={`Plume in ${fmtMin(eta)}`} kind="amber" />}
      </View>
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={FONT.small}>Water health</Text><Text style={[FONT.small, { color: C.ink, fontWeight: '700' }]}>{st.wqhi.score}/100</Text>
        </View>
        <Meter pct={st.wqhi.score} />
      </View>
      <View style={s.facts}>
        <Fact label="Turbidity NTU" value={fmt(st.reading?.turbidity, 1)} />
        <Fact label="pH" value={fmt(st.reading?.ph, 2)} />
        <Fact label="People served" value={(st.population ?? 0).toLocaleString()} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button title="Details" kind="ghost" icon="list" onPress={onDetails} style={{ flex: 1 }} />
        <Button title="3D site" icon="cube" onPress={onSite} style={{ flex: 1 }} />
      </View>
    </>
  );
}

/** What the twin knows about any place you tap. */
function SpotReport({ spot, near, onClose, onPoint }) {
  return (
    <>
      <View style={s.reportHead}>
        <Ionicons name="location" size={20} color={C.primary} />
        <View style={{ flex: 1 }}>
          <Text style={FONT.h2}>This location</Text>
          <Text style={FONT.small}>{spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close report"><Ionicons name="close" size={20} color={C.muted} /></Pressable>
      </View>
      {spot.loading ? <Text style={[FONT.body, { marginTop: 10, color: C.ink2 }]}>Checking this spot…</Text>
        : spot.error ? <Text style={[FONT.body, { marginTop: 10, color: C.ink2 }]}>This spot is outside the area the twin covers.</Text> : (
          <>
            <View style={s.facts}>
              <Fact label="Elevation" value={`${Math.round(spot.elevation_m ?? 0)} m`} />
              <Fact label="To the river" value={spot.river_distance_m == null ? 'Not near' : `${spot.river_distance_m.toLocaleString()} m`} />
              <Fact label="In the watershed" value={spot.in_catchment ? 'Yes' : 'No'} />
            </View>
            {near && (
              <PressScale onPress={() => onPoint(near.id)} style={s.nearest}>
                <View style={[s.status, { backgroundColor: stationStatus(near).color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>Nearest: {near.name}</Text>
                  <Text style={FONT.small}>{fmt(spot.nearest_km, 1)} km away, water health {near.wqhi.score}/100</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </PressScale>
            )}
          </>
        )}
    </>
  );
}

/** Map first, like a public hazard map: search on top, the twin behind, a report sheet from below. */
export default function MapTab() {
  const { heatIndex, setHeatIndex, live, forecast, servers } = useData();
  const router = useRouter();
  const top = useSafeAreaInsets().top;
  const [command, setCommand] = useState(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [spot, setSpot] = useState(null);
  const [raised, setRaised] = useState(false);
  const [lift] = useState(() => new Animated.Value(0));
  // Only one 3D view at a time: phones cannot hold two
  const [active, setActive] = useState(true);
  useFocusEffect(useCallback(() => {
    setActive(true);
    return () => setActive(false);
  }, []));
  const run = (js) => setCommand({ js, n: Date.now() });

  useEffect(() => {
    Animated.timing(lift, { toValue: raised ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [lift, raised]);

  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
    onPanResponderRelease: (_, g) => { if (g.dy < -24) setRaised(true); else if (g.dy > 24) setRaised(false); },
  }), []);

  const fc = forecast?.stations ?? live?.forecast?.stations ?? {};
  const st = live?.stations.find((x) => x.id === picked);
  const near = live?.stations.find((x) => x.id === spot?.nearest_id);
  const text = query.trim().toLowerCase();
  const found = text ? (live?.stations ?? []).filter((x) => `${x.id} ${x.name}`.toLowerCase().includes(text)) : [];

  const pick = (id, fly = true) => {
    setPicked(id);
    setSpot(null);
    setQuery('');
    setRaised(true);
    if (fly) run(`window.bulosFocus && window.bulosFocus(${JSON.stringify(id)}); true;`);
  };
  const close = () => { setPicked(null); setSpot(null); setRaised(false); };
  const checkSpot = async ({ lat, lon }) => {
    setPicked(null);
    setRaised(true);
    setSpot({ lat, lon, loading: true });
    try {
      const r = await fetch(`${servers.api}/api/hazard?lat=${lat}&lon=${lon}`);
      if (!r.ok) throw new Error('outside');
      setSpot({ lat, lon, ...(await r.json()) });
    } catch { setSpot({ lat, lon, error: true }); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgTop }}>
      {active && (
        <Web3D style={StyleSheet.absoluteFill} heatIndex={heatIndex} command={command} query={{ embed: 'map', index: heatIndex }}
               onMessage={(m) => { if (m.type === 'select') pick(m.id, false); if (m.type === 'probe') checkSpot(m); }} />
      )}

      <View pointerEvents="box-none" style={[s.top, { paddingTop: top + 8 }]}>
        <Reveal style={s.search}>
          <Logo size={28} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search water points" placeholderTextColor={C.muted} style={s.input} returnKeyType="search" accessibilityLabel="Search water points" />
          {query ? <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={C.muted} /></Pressable> : <Ionicons name="search" size={18} color={C.muted} />}
        </Reveal>
        {found.length > 0 && (
          <View style={s.results}>
            {found.map((x) => (
              <Pressable key={x.id} onPress={() => pick(x.id)} style={s.result} accessibilityRole="button">
                <Dot id={x.id} /><Text style={[FONT.body, { flex: 1 }]} numberOfLines={1}><Text style={{ fontWeight: '700' }}>{x.id}</Text> {x.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Reveal delay={80}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}>
            {Object.entries(LAYERS).map(([k, label]) => (
              <PressScale key={k} onPress={() => setHeatIndex(k)} style={[s.chip, heatIndex === k && s.chipOn]}>
                <Text style={[s.chipText, heatIndex === k && { color: '#fff' }]}>{label}</Text>
              </PressScale>
            ))}
          </ScrollView>
        </Reveal>
      </View>

      <Animated.View pointerEvents="box-none" style={[s.tools, { bottom: PEEK + 10, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, PEEK - OPEN] }) }] }]}>
        <PressScale onPress={() => { close(); run('window.bulosHome && window.bulosHome(); true;'); }} style={s.round} accessibilityLabel="Back to the whole river">
          <Ionicons name="locate" size={20} color={C.primary} />
        </PressScale>
      </Animated.View>

      <Animated.View style={[s.sheet, { height: OPEN, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [OPEN - PEEK, 0] }) }] }]}>
        <Pressable {...drag.panHandlers} onPress={() => setRaised((v) => !v)} style={s.handleArea} accessibilityRole="button" accessibilityLabel={raised ? 'Lower the panel' : 'Raise the panel'}>
          <View style={s.handle} />
        </Pressable>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
          {st ? <PointReport st={st} eta={fc[st.id]?.arrival_s} onClose={close} onDetails={() => router.push(`/point/${st.id}`)} onSite={() => router.push(`/site/${st.id}`)} />
            : spot ? <SpotReport spot={spot} near={near} onClose={close} onPoint={(id) => pick(id)} />
              : live ? <RiverSummary live={live} fc={fc} onPick={(id) => pick(id)} /> : <Text style={FONT.body}>Connecting to the twin…</Text>}
          {KEY[heatIndex] && (
            <View style={s.key}>
              <Text style={FONT.small}>{KEY[heatIndex][0]}</Text>
              <View style={s.ramp}>{RAMP.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}</View>
              <Text style={FONT.small}>{KEY[heatIndex][1]}</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
      <Toast />
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 10, right: 10, gap: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 10, height: 48, ...shadow },
  input: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0 },
  results: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 4, ...shadow },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: '#fff', ...shadow },
  chipOn: { backgroundColor: C.primary },
  chipText: { fontWeight: '700', color: C.ink2, fontSize: 13 },
  tools: { position: 'absolute', right: 10 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, ...shadow },
  handleArea: { alignItems: 'center', paddingVertical: 9 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#cdd6e4' },
  point: { backgroundColor: C.panel2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 104, gap: 2 },
  status: { width: 10, height: 10, borderRadius: 5 },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  facts: { flexDirection: 'row', gap: 8, marginTop: 12 },
  fact: { flex: 1, backgroundColor: C.panel2, borderRadius: 12, padding: 10 },
  nearest: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel2, borderRadius: 12, padding: 12, marginTop: 8 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  ramp: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
});
