import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Empty, Screen } from '../components/ui';
import { Chips, Label } from '../components/Choice';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

const DAYS = [[0, 'Today'], [1, 'Tomorrow'], [3, 'In 3 days'], [7, 'Next week'], [14, 'In 2 weeks'], [30, 'In a month']];
const HOURS = [[7, '7:00 AM'], [9, '9:00 AM'], [13, '1:00 PM'], [16, '4:00 PM']];

export default function Reminder() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { live, static: st, act } = useData();
  const [station, setStation] = useState(params.id ?? 'KS-03');
  const [kind, setKind] = useState('LENS_CLEAN');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(1);
  const [hour, setHour] = useState(9);
  const [busy, setBusy] = useState(false);
  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;

  const due = new Date(live.clock.epoch_ms);
  due.setDate(due.getDate() + days);
  due.setHours(hour, 0, 0, 0);
  const kinds = st?.task_kinds ?? { LENS_CLEAN: 'Clean turbidity probe', CUSTOM: 'Custom task' };
  const save = async () => {
    setBusy(true);
    const ok = await act('/api/maintenance', { station_id: station, kind, title: kind === 'CUSTOM' ? title : null, due_ms: due.getTime(), created_by: 'Mobile operator' }, (r) => r.message);
    setBusy(false);
    if (ok) router.back();
  };
  return (
    <Screen edges={[]} advisory={false}>
      <Card>
        <Label>Water point</Label>
        <Chips options={live.stations.map((x) => ({ value: x.id, label: x.id }))} value={station} onChange={setStation} />
        <Text style={[FONT.small, { marginTop: 4 }]}>{live.stations.find((x) => x.id === station)?.name}</Text>
        <Label>Task</Label>
        <Chips wrap options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} value={kind} onChange={setKind} />
        {kind === 'CUSTOM' && (
          <>
            <Label>Describe the task</Label>
            <TextInput value={title} onChangeText={setTitle} placeholder="For example: replace the antenna cable" placeholderTextColor={C.muted}
                       style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#fff', color: C.ink }} />
          </>
        )}
        <Label>Due</Label>
        <Chips wrap options={DAYS.map(([value, label]) => ({ value, label }))} value={days} onChange={setDays} />
        <Chips wrap options={HOURS.map(([value, label]) => ({ value, label }))} value={hour} onChange={setHour} />
        <Text style={[FONT.small, { marginTop: 8 }]}>
          Due {due.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at {due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Card>
      <Button title="Add reminder" icon="notifications" busy={busy} disabled={kind === 'CUSTOM' && !title.trim()} onPress={save} />
    </Screen>
  );
}
