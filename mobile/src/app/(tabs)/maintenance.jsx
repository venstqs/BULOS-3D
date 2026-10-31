import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Pill, Screen, Tile } from '../../components/ui';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { TASK_PILL, dueIn } from '../../lib/format';

export default function MaintenanceTab() {
  const { tasks, live } = useData();
  const router = useRouter();
  const now = live?.clock.epoch_ms ?? 0;
  const name = (sid) => live?.stations.find((x) => x.id === sid)?.name ?? sid;
  const groups = [
    ['Overdue', (tasks ?? []).filter((t) => t.status === 'OVERDUE')],
    ['Due today', (tasks ?? []).filter((t) => t.status === 'DUE_TODAY')],
    ['Upcoming', (tasks ?? []).filter((t) => t.status === 'UPCOMING')],
    ['Completed', (tasks ?? []).filter((t) => t.status === 'COMPLETED').sort((a, b) => b.done_ms - a.done_ms).slice(0, 10)],
  ];
  return (
    <Screen title="Maintenance" subtitle="Probe cleaning, calibration, filters, solar"
            right={<Button title="Add" icon="add-circle" onPress={() => router.push('/reminder')} />}>
      {groups.map(([title, list]) => (
        <Card key={title}>
          <Text style={[FONT.h2, { marginBottom: 10 }]}>{title} <Text style={FONT.small}>({list.length})</Text></Text>
          {!list.length && <Empty text="Nothing here." />}
          <View style={{ gap: 8 }}>
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
                    <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>{t.title}</Text>
                    <Text style={FONT.small} numberOfLines={1}>{name(t.station)}</Text>
                    <Text style={FONT.small} numberOfLines={1}>
                      {done ? `Done by ${t.done_by}` : `${dueIn(t.due_ms, now)}${t.recurring_days ? ` · every ${t.recurring_days} days` : ''}`}
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
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  date: { width: 46, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line, alignItems: 'center', backgroundColor: '#fff' },
  mon: { backgroundColor: C.primary, color: '#fff', fontSize: 10, fontWeight: '700', width: '100%', textAlign: 'center', paddingVertical: 2 },
  day: { fontSize: 18, fontWeight: '700', color: C.ink, paddingVertical: 2 },
  link: { color: C.primary, fontWeight: '700', fontSize: 12 },
});
