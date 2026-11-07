import { StyleSheet, View } from 'react-native';
import Text from '../../components/Text';
import { useRouter } from 'expo-router';
import { Button, Empty, Pill, Screen, Tile } from '../../components/ui';
import { useData } from '../../lib/data';
import { C, FONT, TINT } from '../../lib/theme';
import { TASK_PILL, dueIn } from '../../lib/format';

function Count({ label, value, tint }) {
  return (
    <View style={[s.count, { backgroundColor: TINT[tint][0] }]}>
      <Text style={[s.countValue, { color: TINT[tint][1] }]}>{value}</Text>
      <Text style={[FONT.small, { color: C.ink2 }]}>{label}</Text>
    </View>
  );
}

export default function MaintenanceTab() {
  const { tasks, live } = useData();
  const router = useRouter();
  const now = live?.clock.epoch_ms ?? 0;
  const name = (sid) => live?.stations.find((x) => x.id === sid)?.name ?? sid;
  const by = (status) => (tasks ?? []).filter((t) => t.status === status);
  const groups = [
    ['Overdue', by('OVERDUE')],
    ['Due today', by('DUE_TODAY')],
    ['Upcoming', by('UPCOMING')],
    ['Completed', by('COMPLETED').sort((a, b) => b.done_ms - a.done_ms).slice(0, 10)],
  ].filter(([, list]) => list.length);
  return (
    <Screen dock sky title="Tasks" subtitle="Cleaning, calibration, filters and solar"
            right={<Button title="Add" kind="light" icon="add" onPress={() => router.push('/reminder')} />}>
      <View style={s.counts}>
        <Count label="Overdue" value={by('OVERDUE').length} tint="coral" />
        <Count label="Due today" value={by('DUE_TODAY').length} tint="sun" />
        <Count label="Upcoming" value={by('UPCOMING').length} tint="blue" />
      </View>

      {!groups.length && <Empty text="No tasks yet. Add a reminder to keep a site on schedule." />}
      {groups.map(([title, list]) => (
        <View key={title} style={{ gap: 8 }}>
          <Text style={FONT.h2}>{title}</Text>
          {list.map((t) => {
            const [label, kind] = TASK_PILL[t.status];
            const done = t.status === 'COMPLETED';
            return (
              <Tile key={t.id} style={s.row} onPress={done ? undefined : () => router.push({ pathname: '/log', params: { task: String(t.id) } })}>
                <View style={s.date}>
                  <Text style={s.mon}>{new Date(t.done_ms ?? t.due_ms).toLocaleDateString([], { month: 'short' })}</Text>
                  <Text style={s.day}>{new Date(t.done_ms ?? t.due_ms).getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[FONT.body, { fontWeight: '600' }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={FONT.small} numberOfLines={1}>{name(t.station)}</Text>
                  <Text style={FONT.small} numberOfLines={1}>
                    {done ? `Done by ${t.done_by}` : `${dueIn(t.due_ms, now)}${t.recurring_days ? `, every ${t.recurring_days} days` : ''}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Pill text={!done && t.urgent ? 'Urgent' : label} kind={!done && t.urgent ? 'red' : kind} />
                  {!done && <Text style={s.link}>Mark done</Text>}
                </View>
              </Tile>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  counts: { flexDirection: 'row', gap: 10 },
  count: { flex: 1, alignItems: 'center', gap: 2, borderRadius: 22, paddingVertical: 14 },
  countValue: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: C.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  date: { width: 46, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: '#fff' },
  mon: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '600', width: '100%', textAlign: 'center', paddingVertical: 2 },
  day: { fontSize: 18, fontWeight: '700', color: C.ink, paddingVertical: 2 },
  link: { color: C.primary, fontWeight: '600', fontSize: 12 },
});
