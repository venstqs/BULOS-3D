import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Dot, Screen, StatusBadge, Tile } from '../../components/ui';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { KIND_ICON, fmt } from '../../lib/format';

export default function PointsTab() {
  const { live, forecast } = useData();
  const router = useRouter();
  return (
    <Screen title="Water points" subtitle="Springs, kiosks, wells and intakes">
      {live?.stations.map((st) => {
        const f = forecast?.stations?.[st.id];
        return (
          <Tile key={st.id} onPress={() => router.push(`/point/${st.id}`)} style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={KIND_ICON[st.kind] ?? 'water'} size={22} color={C.primary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Dot id={st.id} size={8} />
                  <Text style={FONT.small}>{st.id}</Text>
                </View>
                <Text style={[FONT.body, { fontWeight: '700' }]} numberOfLines={1}>{st.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge st={st} />
                  {st.valve && !st.valve.open && <Text style={[FONT.small, { color: '#a32626', fontWeight: '700' }]}>intake closed</Text>}
                  {f?.arrival_s > 0 && <Text style={[FONT.small, { color: '#7a5600', fontWeight: '700' }]}>plume in {Math.round(f.arrival_s / 60)} min</Text>}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: C.primary }}>{st.wqhi.score}</Text>
                <Text style={FONT.small}>WQHI</Text>
              </View>
            </View>
            <Text style={[FONT.small, { marginTop: 8 }]}>
              {fmt(st.elevation_m, 0)} m · {st.population ? `serves ${st.population.toLocaleString()} people` : 'monitoring only'} · {st.owner}
            </Text>
          </Tile>
        );
      })}
      {!live && <Card><Text style={FONT.small}>Waiting for data…</Text></Card>}
    </Screen>
  );
}
