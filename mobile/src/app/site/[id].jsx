import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Background, Card, StatusBadge } from '../../components/ui';
import Web3D from '../../components/Web3D';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { CLASS_LABEL, EDGE_LABEL } from '../../lib/format';

export default function SiteView() {
  const { id } = useLocalSearchParams();
  const { live } = useData();
  const st = live?.stations.find((x) => x.id === id);
  return (
    <Background>
      <Stack.Screen options={{ title: st ? `${st.id} 3D site view` : '3D site view' }} />
      <View style={{ flex: 1, padding: 10, gap: 10 }}>
        <Web3D style={{ flex: 1, borderRadius: 14 }} query={{ embed: 'site', id }} />
        {st && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 26, fontWeight: '700', color: C.primary }}>{st.wqhi.score}</Text>
                <Text style={FONT.small}>WQHI</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={FONT.h2} numberOfLines={1}>{st.name}</Text>
                <StatusBadge st={st} />
                <Text style={FONT.small}>{CLASS_LABEL[st.classification]} · {EDGE_LABEL[st.edge_state]}</Text>
              </View>
            </View>
            <Text style={[FONT.small, { marginTop: 8 }]}>Drag to orbit, pinch to zoom. The model shows probe fouling, valve state, tank level and the sensor node beacon live.</Text>
          </Card>
        )}
      </View>
    </Background>
  );
}
