import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Card, Pill, Screen } from '../components/ui';
import { Label } from '../components/Choice';
import { apiGet, defaultServers } from '../lib/api';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

const input = { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: '#fff', color: C.ink, fontSize: 15 };

export default function Settings() {
  const { servers } = useData();
  if (!servers) return null;
  return <SettingsForm key={`${servers.api}|${servers.web}|${servers.mode}`} servers={servers} />;
}

function SettingsForm({ servers }) {
  const { setServers, resetServers, toggleStandalone, isStandalone, notify } = useData();
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

  const useStandalonePreset = async () => {
    await setServers({ ...servers, mode: 'standalone' });
    notify(true, 'Enabled Standalone Demo Mode. Testing entirely within React Native!');
  };

  return (
    <Screen edges={[]} advisory={false}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={FONT.h2}>Current Mode</Text>
          <Pill text={isStandalone ? 'Standalone Demo' : 'Live LAN Server'} kind={isStandalone ? 'amber' : 'good'} />
        </View>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 6 }]}>
          {isStandalone
            ? 'Running pure React Native digital twin simulation with real-time sensor jitter, valve controls, and scenario injection without needing a PC server.'
            : 'Connecting to live FastAPI telemetry server over LAN or cloud.'}
        </Text>
        <Button
          title={isStandalone ? 'Switch to Live Server Mode' : 'Switch to Standalone Demo Mode'}
          icon="phone-portrait"
          style={{ marginTop: 12 }}
          onPress={toggleStandalone}
        />
      </Card>

      <Card>
        <Text style={FONT.h2}>Server Addresses</Text>
        <Label>Data server (FastAPI)</Label>
        <TextInput value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <Label>Website (for the 3D views)</Label>
        <TextInput value={web} onChangeText={setWeb} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <Text style={[FONT.small, { marginTop: 10 }]}>
          Default from Expo: {d.api} and {d.web}. That is the PC running “npm start” in the mobile folder.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button title="Save Addresses" icon="checkmark-done" style={{ flex: 1 }} onPress={async () => { await setServers({ api: api.trim(), web: web.trim(), mode: 'auto' }); notify(true, 'Server addresses saved.'); }} />
          <Button title="Test" icon="wifi" kind="ghost" busy={testing} onPress={test} />
        </View>
      </Card>

      <Card>
        <Text style={FONT.h2}>Quick Presets</Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          <Button title="Standalone Demo (No PC Required)" kind="ghost" icon="hardware-chip" onPress={useStandalonePreset} />
          <Button title="Reset to Automatic LAN" kind="ghost" icon="refresh" onPress={async () => { await resetServers(); notify(true, 'Using automatic LAN addresses.'); }} />
        </View>
      </Card>
    </Screen>
  );
}
