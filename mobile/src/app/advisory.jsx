import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Pill, Screen } from '../components/ui';
import { Label, Options } from '../components/Choice';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

export default function Advisory() {
  const router = useRouter();
  const { live, forecast, act } = useData();
  const fc = forecast?.stations ?? {};
  const contacts = live?.stations.filter((s) => s.sms) ?? [];
  const affected = contacts.filter((s) => s.risk >= 0.45 || fc[s.id]?.arrival_s > 0).map((s) => s.id);
  const [ids, setIds] = useState(affected);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const send = async () => {
    setBusy(true);
    const ok = await act('/api/advisory', { station_ids: ids, message: message.trim() || null, sent_by: 'Mobile operator' }, (r) => r.message);
    setBusy(false);
    if (ok) router.back();
  };
  return (
    <Screen edges={[]} advisory={false}>
      <Text style={[FONT.body, { color: C.ink2 }]}>
        {affected.length ? 'Water points that are affected or expecting contamination are already selected.' : 'No water point is affected right now. Choose who should get the message.'}
      </Text>
      <Card>
        <Label>Send to</Label>
        <Options
          options={contacts.map((s) => ({
            value: s.id, label: s.name, sub: `to ${s.sms}`,
            right: fc[s.id]?.arrival_s > 0 ? <Pill text={`${Math.round(fc[s.id].arrival_s / 60)} min`} kind="amber" />
              : s.risk >= 0.45 ? <Pill text="contaminated" kind="red" /> : null,
          }))}
          isOn={(v) => ids.includes(v)}
          onPress={toggle}
        />
        <Label>Message (leave empty for the standard advisory)</Label>
        <TextInput value={message} onChangeText={setMessage} multiline maxLength={300}
                   placeholder="Water advisory: do not drink untreated water; boil water for at least 1 minute." placeholderTextColor={C.muted}
                   style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, minHeight: 80, backgroundColor: '#fff', color: C.ink }} />
        <Text style={[FONT.small, { marginTop: 8 }]}>
          {live.sms_provider === 'outbox' ? 'No SMS gateway is configured on the server, so messages are logged in Reports instead of sent.' : `Sent through ${live.sms_provider}.`}
        </Text>
      </Card>
      <Button title={`Send to ${ids.length} contact${ids.length === 1 ? '' : 's'}`} icon="send" busy={busy} disabled={!ids.length} onPress={send} />
    </Screen>
  );
}
