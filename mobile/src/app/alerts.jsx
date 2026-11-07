import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Empty, PressScale, Screen } from '../components/ui';
import { Chips } from '../components/Choice';
import { useData } from '../lib/data';
import { eventInfo, fmtClock, fmtDate } from '../lib/format';
import { C, FONT, TINT } from '../lib/theme';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'danger', label: 'Urgent' },
  { value: 'warning', label: 'Warnings' },
  { value: 'info', label: 'Updates' },
];

export default function Alerts() {
  const { live, alertsSeen, markAlertsSeen } = useData();
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [seenBefore] = useState(alertsSeen);   // keeps the new markers while this screen is open

  useEffect(() => { markAlertsSeen(); }, [markAlertsSeen]);

  const events = (live?.events ?? []).filter((e) => filter === 'all' || e.severity === filter);
  const days = [];
  events.forEach((e) => {
    const day = fmtDate(e.t_ms);
    if (days.at(-1)?.day !== day) days.push({ day, list: [] });
    days.at(-1).list.push(e);
  });

  return (
    <Screen edges={[]} advisory={false}>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />
      {!events.length && <Empty text="Nothing here. New alerts from the twin appear in this list." />}
      {days.map(({ day, list }) => (
        <View key={day} style={{ gap: 8 }}>
          <Text style={FONT.h2}>{day}</Text>
          {list.map((e, i) => {
            const info = eventInfo(e);
            const isNew = e.t_ms > seenBefore && e.severity !== 'info';
            const open = e.station ? () => router.push(`/point/${e.station}`) : undefined;
            return (
              <PressScale key={`${e.t_ms}-${e.type}-${i}`} onPress={open} disabled={!open} style={[s.row, { backgroundColor: TINT[info.tint][0] }]}>
                <View style={s.icon}><Ionicons name={info.icon} size={18} color={TINT[info.tint][1]} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[FONT.body, { flexShrink: 1, fontWeight: '600' }]} numberOfLines={1}>{info.label}{e.station ? `, ${e.station}` : ''}</Text>
                    {isNew && <View style={s.dot} accessibilityLabel="New" />}
                  </View>
                  <Text style={[FONT.small, { color: C.ink2 }]} numberOfLines={3}>{e.message}</Text>
                  <Text style={FONT.small}>{fmtClock(e.t_ms)}</Text>
                </View>
              </PressScale>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, borderRadius: 20, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.critical },
});
