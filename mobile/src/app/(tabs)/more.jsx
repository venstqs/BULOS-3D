import { View } from 'react-native';
import Text from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Screen, Tile } from '../../components/ui';
import Logo from '../../components/Logo';
import { useData } from '../../lib/data';
import { C, FONT, TINT } from '../../lib/theme';

export default function MoreTab() {
  const router = useRouter();
  const { live, servers, status, static: st } = useData();
  const items = [
    ['shield-checkmark', 'Is my water safe?', 'A plain answer for your water point', '/safe', true, 'blue'],
    ['water', 'Follow a drop', 'Ride the river from the spring to the town', '/journey', true, 'aqua'],
    ['flash', 'Run a drill', 'Start an event and watch the twin respond', '/drill', live?.clock.mode === 'sim', 'violet'],
    ['notifications', 'Alerts', 'Everything the twin has flagged', '/alerts', true, 'coral'],
    ['play-circle', 'Simulate a field event', 'Start one and keep using the app', '/simulate', live?.clock.mode === 'sim', 'violet'],
    ['document-text', 'Reports', 'Event log, SMS outbox, PNSDW compliance', '/reports', true, 'sun'],
    ['information-circle', 'About Bulos 3D', 'Problem, the 5 features, SDGs', '/about', true, 'blue'],
    ['settings', 'Server settings', servers ? servers.api : 'Data server address', '/settings', true, 'blue'],
  ].filter((x) => x[4]);
  return (
    <Screen dock sky title="More" subtitle="Tools, reports and settings">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Logo size={76} />
          <View style={{ flex: 1 }}>
            <Text style={FONT.h2}>Bulos 3D</Text>
            <Text style={FONT.small}>Water quality digital twin for {st?.site?.title ?? 'Naga City'}</Text>
            <Text style={[FONT.small, { color: status === 'online' ? C.good : C.critical, fontWeight: '700', marginTop: 2 }]}>
              {status === 'online' ? `Connected, ${live?.clock.mode === 'sim' ? `simulation at ${live.clock.speed}× speed` : 'live feeds'}` : 'Not connected'}
            </Text>
          </View>
        </View>
      </Card>
      {items.map(([icon, title, sub, href, , tint]) => (
        <Tile key={href} onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 0, backgroundColor: C.card, borderRadius: 22 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: TINT[tint][0], alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={21} color={TINT[tint][1]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[FONT.body, { fontWeight: '700' }]}>{title}</Text>
            <Text style={FONT.small} numberOfLines={1}>{sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Tile>
      ))}
      <Text style={[FONT.small, { textAlign: 'center', marginTop: 8 }]}>
        Prototype for the Xylem Global Student Innovation Challenge by Camarines Sur National High School. Not an official government system.
      </Text>
    </Screen>
  );
}
