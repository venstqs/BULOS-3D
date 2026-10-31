import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Screen, Tile } from '../../components/ui';
import Logo from '../../components/Logo';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';

export default function MoreTab() {
  const router = useRouter();
  const { live, servers, status, static: st } = useData();
  const items = [
    ['play-circle', 'Simulate a field event', 'Monsoon rain, piggery spill, dirty sensor', '/simulate', live?.clock.mode === 'sim'],
    ['document-text', 'Reports', 'Event log, SMS outbox, PNSDW compliance', '/reports', true],
    ['information-circle', 'About Bulos 3D', 'Problem, the 5 features, SDGs', '/about', true],
    ['settings', 'Server settings', servers ? servers.api : 'Data server address', '/settings', true],
  ].filter((x) => x[4]);
  return (
    <Screen title="More" subtitle="Bulos 3D">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Logo size={52} />
          <View style={{ flex: 1 }}>
            <Text style={FONT.h2}>Bulos 3D</Text>
            <Text style={FONT.small}>Water quality digital twin · {st?.site?.title ?? 'Naga City'}</Text>
            <Text style={[FONT.small, { color: status === 'online' ? C.good : C.critical, fontWeight: '700', marginTop: 2 }]}>
              {status === 'online' ? `Connected · ${live?.clock.mode === 'sim' ? `virtual field, ${live.clock.speed}× speed` : 'live feeds'}` : 'Not connected'}
            </Text>
          </View>
        </View>
      </Card>
      {items.map(([icon, title, sub, href]) => (
        <Tile key={href} onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={21} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[FONT.body, { fontWeight: '700' }]}>{title}</Text>
            <Text style={FONT.small} numberOfLines={1}>{sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Tile>
      ))}
      <Text style={[FONT.small, { textAlign: 'center', marginTop: 8 }]}>
        Prototype for the Xylem Global Student Innovation Challenge · Camarines Sur National High School. Not an official government system.
      </Text>
    </Screen>
  );
}
