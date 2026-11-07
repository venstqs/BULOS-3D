import { View } from 'react-native';
import Text from '../../components/Text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Background, Card, StatusBadge } from '../../components/ui';
import Web3D from '../../components/Web3D';
import WaterDisc from '../../components/WaterDisc';
import { useData } from '../../lib/data';
import { FONT } from '../../lib/theme';
import { CLASS_LABEL, EDGE_LABEL } from '../../lib/format';
import { waterAt, waterRgb } from '../../lib/water';

export default function SiteView() {
  const { id } = useLocalSearchParams();
  const { live } = useData();
  const st = live?.stations.find((x) => x.id === id);
  return (
    <Background>
      <Stack.Screen options={{ title: st ? `${st.id} 3D site view` : '3D site view' }} />
      <View style={{ flex: 1, padding: 10, gap: 10 }}>
        <Web3D style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }} query={{ embed: 'site', id }} />
        {st && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <WaterDisc size={68} rgb={waterRgb(...waterAt(live, st.chainage_m))} still>
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff' }}>{st.wqhi.score}</Text>
              </WaterDisc>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={FONT.h2} numberOfLines={1}>{st.name}</Text>
                <StatusBadge st={st} />
                <Text style={FONT.small} numberOfLines={2}>{CLASS_LABEL[st.classification]}. {EDGE_LABEL[st.edge_state]}.</Text>
              </View>
            </View>
            <Text style={[FONT.small, { marginTop: 8 }]}>Drag to orbit, pinch to zoom. The model shows probe fouling, valve state, tank level and the sensor node beacon live.</Text>
          </Card>
        )}
      </View>
    </Background>
  );
}
