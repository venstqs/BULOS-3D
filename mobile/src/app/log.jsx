import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Empty, Pill, Screen } from '../components/ui';
import { Label, Options } from '../components/Choice';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';
import { TASK_PILL, fmtDate } from '../lib/format';

const input = { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#fff', color: C.ink };

export default function LogMaintenance() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { tasks, live, act } = useData();
  const open = (tasks ?? []).filter((t) => t.status !== 'COMPLETED');
  const [taskId, setTaskId] = useState(params.task ? Number(params.task) : null);
  const [by, setBy] = useState('LGU field technician');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = open.find((t) => t.id === taskId) ?? open[0];
  const name = (sid) => live?.stations.find((x) => x.id === sid)?.name ?? sid;

  if (!tasks) return <Screen edges={[]}><Empty text="Loading tasks…" /></Screen>;
  if (!open.length) {
    return (
      <Screen edges={[]} advisory={false}>
        <Card><Text style={FONT.body}>There are no open maintenance tasks. Add a reminder first.</Text></Card>
        <Button title="Add reminder" icon="notifications" onPress={() => router.replace('/reminder')} />
      </Screen>
    );
  }
  const save = async () => {
    setBusy(true);
    const ok = await act(`/api/maintenance/${chosen.id}/done`, { done_by: by, note }, (r) => r.message);
    setBusy(false);
    if (ok) router.back();
  };
  return (
    <Screen edges={[]} advisory={false}>
      <Card>
        <Label>Completed task</Label>
        <Options
          options={open.slice(0, 12).map((t) => {
            const [label, kind] = TASK_PILL[t.status];
            return {
              value: t.id, label: t.title, sub: `${name(t.station)} · due ${fmtDate(t.due_ms)}`,
              right: <Pill text={t.urgent ? 'Urgent' : label} kind={t.urgent ? 'red' : kind} />,
            };
          })}
          isOn={(v) => v === chosen.id}
          onPress={setTaskId}
        />
        <Label>Done by</Label>
        <TextInput value={by} onChangeText={setBy} style={input} />
        <Label>Notes (optional)</Label>
        <TextInput value={note} onChangeText={setNote} placeholder="What was found or replaced" placeholderTextColor={C.muted} multiline style={[input, { minHeight: 70 }]} />
        {chosen.kind === 'LENS_CLEAN' && <Text style={[FONT.small, { marginTop: 8 }]}>Logging a probe cleaning also tells the sensor node to reset its drift check.</Text>}
      </Card>
      <Button title="Mark as done" icon="checkmark-done" busy={busy} disabled={!by.trim()} onPress={save} />
    </Screen>
  );
}
