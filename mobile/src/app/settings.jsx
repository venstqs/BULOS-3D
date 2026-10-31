import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button, Card, Screen } from '../components/ui';
import { Label } from '../components/Choice';
import { apiGet, defaultServers } from '../lib/api';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

const input = { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#fff', color: C.ink, fontSize: 15 };

export default function Settings() {
  const { servers } = useData();
  if (!servers) return null;
  // remount the form whenever the saved addresses change (e.g. after "Reset to automatic")
  return <SettingsForm key={`${servers.api}|${servers.web}`} servers={servers} />;
}

function SettingsForm({ servers }) {
  const { setServers, resetServers, notify } = useData();
  const [api, setApi] = useState(servers.api);
  const [web, setWeb] = useState(servers.web);
  const [testing, setTesting] = useState(false);
  const d = defaultServers();

  const test = async () => {
    setTesting(true);
    try {
      const h = await apiGet(api, '/api/health');
      notify(true, `Connected: data server is ${h.status} (${h.mode} mode).`);
    } catch (e) {
      notify(false, `${e.message} Check that “npm run start:lan” is running and the phone is on the same Wi-Fi.`);
    }
    setTesting(false);
  };

  return (
    <Screen edges={[]} advisory={false}>
      <Card>
        <Label>Data server (FastAPI)</Label>
        <TextInput value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <Label>Website (for the 3D views)</Label>
        <TextInput value={web} onChangeText={setWeb} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <Text style={[FONT.small, { marginTop: 10 }]}>
          Default from Expo: {d.api} and {d.web}. That is the PC running “npm start” in the mobile folder.
        </Text>
      </Card>
      <Button title="Test connection" icon="wifi" kind="ghost" busy={testing} onPress={test} />
      <Button title="Save" icon="checkmark-done" onPress={async () => { await setServers({ api: api.trim(), web: web.trim() }); notify(true, 'Server addresses saved.'); }} />
      <Button title="Reset to automatic" kind="ghost" icon="refresh" onPress={async () => { await resetServers(); notify(true, 'Using the automatic addresses.'); }} />
      <Card>
        <Text style={FONT.h2}>Connecting your phone</Text>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 6 }]}>
          1. On the PC, in the project folder: npm run start:lan{'\n'}
          2. In the mobile folder: npm start, then scan the QR code with Expo Go{'\n'}
          3. Keep the phone and PC on the same Wi-Fi. If Windows asks, allow Python and Node on private networks.
        </Text>
      </Card>
    </Screen>
  );
}
