import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, PressScale, Pulse, Reveal, Screen } from '../components/ui';
import RiverLine from '../components/RiverLine';
import { tapFeel } from '../components/motion';
import { apiPost } from '../lib/api';
import { useData } from '../lib/data';
import { eventInfo, fmtClock } from '../lib/format';
import { C, FONT, TINT } from '../lib/theme';

const DRILLS = [
  { name: 'SEPTIC', title: 'Piggery spill', sub: 'Raw effluent enters a farm stream above AG-02', icon: 'warning', tint: 'coral' },
  { name: 'MONSOON', title: 'Heavy monsoon rain', sub: 'Runoff turns the whole river muddy', icon: 'rainy', tint: 'blue' },
  { name: 'BIOFOULING', title: 'Dirty sensor', sub: 'The twin must not mistake it for pollution', icon: 'construct', tint: 'sun' },
];
const DRILL_SPEED = 240;

function Stat({ value, label }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={[FONT.small, { textAlign: 'center', color: C.ink2 }]}>{label}</Text>
    </View>
  );
}

/** Starts a simulated event at high speed and shows what the twin does, as it happens. */
export default function Drill() {
  const { live, apiBase, refresh, notify } = useData();
  const router = useRouter();
  const [drill, setDrill] = useState(null);
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  // Leaving the screen always puts the simulation back the way it was
  useEffect(() => () => end.current?.(), []);

  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;
  if (live.clock.mode !== 'sim') return <Screen edges={[]}><Empty text="Drills only run in the simulator." /></Screen>;

  const start = async (d) => {
    setBusy(true);
    tapFeel();
    const speed = live.clock.speed;
    const from = live.clock.epoch_ms;
    try {
      await apiPost(apiBase, '/api/speed', { speed: DRILL_SPEED });
      await apiPost(apiBase, '/api/scenario', { name: d.name });
      end.current = () => {
        end.current = null;
        apiPost(apiBase, '/api/scenario', { name: 'RESET' }).catch(() => {});
        apiPost(apiBase, '/api/speed', { speed }).catch(() => {});
      };
      setDrill({ ...d, from });
      refresh();
    } catch (e) {
      notify(false, e.message);
    }
    setBusy(false);
  };

  const stop = () => {
    end.current?.();
    setDrill(null);
    notify(true, 'Drill ended. The river is back to normal.');
  };

  if (!drill) {
    return (
      <Screen edges={[]} advisory={false}>
        <Text style={[FONT.body, { color: C.ink2 }]}>Pick an event. It plays out in the simulator at {DRILL_SPEED}× speed, and you can watch the twin respond step by step.</Text>
        <View style={{ gap: 10 }}>
          {DRILLS.map((d) => (
            <PressScale key={d.name} onPress={() => start(d)} disabled={busy} style={[s.pick, { backgroundColor: TINT[d.tint][0] }]} accessibilityLabel={`Start ${d.title}`}>
              <View style={s.pickIcon}><Ionicons name={d.icon} size={24} color={TINT[d.tint][1]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={FONT.h2}>{d.title}</Text>
                <Text style={[FONT.small, { color: C.ink2, marginTop: 2 }]}>{d.sub}</Text>
              </View>
              <Ionicons name="play-circle" size={30} color={TINT[d.tint][1]} />
            </PressScale>
          ))}
        </View>
        <Text style={[FONT.small, { textAlign: 'center' }]}>Everything here is simulated. Nothing is sent to anyone.</Text>
      </Screen>
    );
  }

  const feed = live.events.filter((e) => e.t_ms >= drill.from && !/Clear all/.test(e.message)).slice().reverse();
  const closed = live.stations.filter((x) => x.valve && !x.valve.open);
  const affected = live.stations.filter((x) => x.risk >= 0.25);
  const protectedPeople = closed.reduce((sum, x) => sum + (x.population ?? 0), 0);
  const minutes = Math.max(0, Math.round((live.clock.epoch_ms - drill.from) / 60000));

  return (
    <Screen edges={[]} advisory={false}>
      <View style={s.running}>
        <Pulse style={[s.live, { backgroundColor: TINT[drill.tint][1] }]}><Ionicons name={drill.icon} size={18} color="#fff" /></Pulse>
        <View style={{ flex: 1 }}>
          <Text style={FONT.h2}>{drill.title}</Text>
          <Text style={FONT.small}>{minutes} simulated minutes so far</Text>
        </View>
      </View>

      <Card style={{ paddingHorizontal: 14 }}>
        <RiverLine live={live} selected={affected[0]?.id} onSelect={(id) => router.push(`/point/${id}`)} />
      </Card>

      <View style={s.stats}>
        <Stat value={affected.length} label="Points affected" />
        <Stat value={closed.length} label="Intakes closed" />
        <Stat value={protectedPeople.toLocaleString()} label="People on stored water" />
      </View>

      <View style={{ gap: 2 }}>
        <Text style={[FONT.h2, { marginBottom: 6 }]}>What the twin did</Text>
        {!feed.length && <Empty text="Waiting for the first signal…" />}
        {feed.slice(-12).map((e, i) => {
          const info = eventInfo(e);
          return (
            <Reveal key={`${e.t_ms}-${e.type}-${i}`} style={s.event}>
              <View style={[s.eventIcon, { backgroundColor: TINT[info.tint][0] }]}><Ionicons name={info.icon} size={16} color={TINT[info.tint][1]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { fontWeight: '600' }]}>{info.label}{e.station ? `, ${e.station}` : ''}</Text>
                <Text style={FONT.small}>{fmtClock(e.t_ms)}, {e.message}</Text>
              </View>
            </Reveal>
          );
        })}
      </View>

      <Button title="End the drill" kind="danger" icon="stop-circle" onPress={stop} />
    </Screen>
  );
}

const s = StyleSheet.create({
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 14 },
  pickIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  running: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  live: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: TINT.blue[0], borderRadius: 22, paddingVertical: 14, paddingHorizontal: 6 },
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: C.primary },
  event: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
  eventIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
