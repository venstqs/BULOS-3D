import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Screen } from '../components/ui';
import Logo from '../components/Logo';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

const FEATURES = [
  ['map', 'Rural & watershed catchment mapping', 'CesiumJS 3D terrain with the watershed, streams and 28 km river computed from the Copernicus elevation model.', '/map'],
  ['layers', 'Real-time contaminant heatmaps', 'Overall risk, turbidity, pH, TDS or the biological indicator, spread over the terrain.', '/map'],
  ['git-network', 'Flow speed & velocity simulation', 'River speed from slope and rain, gravity pipelines from elevation head, gated by telemetry.', '/forecast'],
  ['pulse', 'Dispersion & predictive forecasting', 'Arrival, peak and clearing times at every intake 4 h ahead, including the riverbank-aquifer well.', '/forecast'],
  ['cube', 'Asset inspection & health indexing', 'Isometric Three.js site views with the Water Quality Health Index and live gauges.', '/points'],
];

const SDGS = [
  ['3', 'Good health and well-being', '#4c9f38'],
  ['6', 'Clean water and sanitation', '#26bde2'],
  ['9', 'Industry, innovation and infrastructure', '#fd6925'],
  ['11', 'Sustainable cities and communities', '#fd9d24'],
  ['13', 'Climate action', '#3f7e44'],
];

export default function About() {
  const router = useRouter();
  const { static: st } = useData();
  return (
    <Screen edges={[]} advisory={false}>
      <Card style={{ alignItems: 'center' }}>
        <Logo size={72} />
        <Text style={[FONT.title, { marginTop: 8, textAlign: 'center' }]}>Bulos 3D: Water Quality Digital Twin</Text>
        <Text style={[FONT.body, { color: C.ink2, textAlign: 'center', marginTop: 4 }]}>Spatial telemetry and hydrodynamic simulation for rural and isolated water networks.</Text>
        <Text style={[FONT.small, { marginTop: 6 }]}>Pilot: {st?.site?.title ?? 'Naga City, Camarines Sur'}</Text>
      </Card>

      <Card>
        <Text style={FONT.h2}>The problem</Text>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 6 }]}>
          Remote springs, shallow wells and kiosks rely on infrequent manual testing, have no SCADA oversight, and sit in terrain that slows emergency response.
        </Text>
        <Text style={[FONT.h2, { marginTop: 12 }]}>Our solution</Text>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 6 }]}>
          Low-cost ESP32 nodes stream readings over LoRaWAN or MQTT into a Python digital twin, which models the watershed in 3D and warns health units and residents before contaminated water is dispensed.
        </Text>
      </Card>

      <Card>
        <Text style={FONT.h2}>What makes this a digital twin</Text>
        <Text style={[FONT.body, { color: C.ink2, marginTop: 6 }]}>
          A digital twin is a virtual copy of a real system that stays in step with it through live data, uses physics to
          predict what happens next, and sends decisions back to change the real system. A 3D map alone is not a twin.
        </Text>
        <Text style={[FONT.body, { fontWeight: '700', marginTop: 10 }]}>Sense → Sync → Simulate → Decide → Act</Text>
        <Text style={[FONT.small, { marginTop: 8 }]}>
          Today the full loop runs against a simulated field that sends real-format sensor packets. A physical node has not
          been connected yet, so field accuracy is still unproven.
        </Text>
      </Card>

      <Card>
        <Text style={FONT.h2}>The five core features</Text>
        {FEATURES.map(([icon, title, text, href], i) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: i === FEATURES.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[FONT.body, { fontWeight: '700' }]}>{i + 1}. {title}</Text>
              <Text style={[FONT.small, { color: C.ink2 }]}>{text}</Text>
              <Text onPress={() => router.push(href)} style={{ color: C.primary, fontWeight: '700', fontSize: 12, marginTop: 2 }}>Open</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={FONT.h2}>UN Sustainable Development Goals</Text>
        <View style={{ gap: 8, marginTop: 10 }}>
          {SDGS.map(([n, name, color]) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{n}</Text>
              </View>
              <Text style={FONT.body}>{name}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Text style={[FONT.small, { textAlign: 'center' }]}>Camarines Sur National High School · Xylem Global Student Innovation Challenge. Water-point locations are an illustrative pilot layout.</Text>
      <Button title="Open the 3D map" icon="map" onPress={() => router.push('/map')} />
    </Screen>
  );
}
