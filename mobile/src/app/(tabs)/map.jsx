import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen } from '../../components/ui';
import Web3D from '../../components/Web3D';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';

const INDEX_LABEL = { risk: 'Overall risk', turbidity: 'Turbidity', ph: 'pH', tds: 'TDS', bio: 'Biological' };

export default function MapTab() {
  const { heatIndex, setHeatIndex, static: st } = useData();
  const router = useRouter();
  const indices = st?.heat_indices ?? Object.keys(INDEX_LABEL);
  return (
    <Screen title="Watershed 3D map" subtitle={st?.site?.subtitle ?? 'Catchment mapping'} scroll={false} advisory={false}>
      <View>
        <Text style={[FONT.small, { marginBottom: 6 }]}>Heatmap shows</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {indices.map((k) => (
            <Pressable key={k} onPress={() => setHeatIndex(k)} style={[s.chip, heatIndex === k && s.chipOn]} accessibilityRole="button">
              <Text style={[s.chipText, heatIndex === k && { color: '#fff' }]}>{INDEX_LABEL[k] ?? k}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Web3D style={{ flex: 1 }} query={{ embed: 'map', index: heatIndex }}
             onMessage={(m) => m.type === 'select' && router.push(`/point/${m.id}`)} />
      <Card style={{ paddingVertical: 10 }}>
        <View style={s.legend}>
          <Text style={FONT.small}>none</Text>
          <View style={s.ramp}>
            {['#fbe7c4', '#f2b48a', '#e07850', '#c23a2c', '#9e1e1e'].map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}
          </View>
          <Text style={FONT.small}>severe</Text>
        </View>
        <Text style={[FONT.small, { marginTop: 6 }]}>Drag to rotate, pinch to zoom. Tap a water point to open it. Dashed lines are gravity-fed pipelines.</Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontWeight: '700', color: C.ink2, fontSize: 13 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ramp: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
});
