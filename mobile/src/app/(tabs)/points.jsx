import { View } from 'react-native';
import Text from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, CardHead, Empty, MyPointStar, Screen, StatusBadge, Tile } from '../../components/ui';
import { LineChart } from '../../components/charts';
import WaterDisc from '../../components/WaterDisc';
import { useData } from '../../lib/data';
import { C, FONT } from '../../lib/theme';
import { fmt, fmtClock, fmtMin } from '../../lib/format';
import { waterAt, waterLabel, waterRgb } from '../../lib/water';

export default function PointsTab() {
  const { live, forecast, trend } = useData();
  const router = useRouter();
  return (
    <Screen dock sky title="Water points" subtitle="From the spring down to the health unit">
      {live?.stations.map((st) => {
        const f = forecast?.stations?.[st.id];
        const [te, od] = waterAt(live, st.chainage_m);
        return (
          <Tile key={st.id} onPress={() => router.push(`/point/${st.id}`)} style={{ padding: 14, borderWidth: 0, backgroundColor: C.card, borderRadius: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <WaterDisc size={64} rgb={waterRgb(te, od)} still>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>{st.wqhi.score}</Text>
              </WaterDisc>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[FONT.body, { fontWeight: '600' }]} numberOfLines={2}>{st.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge st={st} />
                  <Text style={FONT.small}>{waterLabel(te, od)}</Text>
                </View>
                {st.valve && !st.valve.open && <Text style={[FONT.small, { color: '#a32626', fontWeight: '600' }]}>Intake closed</Text>}
                {f?.arrival_s > 0 && <Text style={[FONT.small, { color: '#7a5600', fontWeight: '600' }]}>Plume in {fmtMin(f.arrival_s)}</Text>}
                <Text style={FONT.small} numberOfLines={1}>
                  {st.id}, {fmt(st.elevation_m, 0)} m{st.population ? `, ${st.population.toLocaleString()} people` : ', monitoring only'}
                </Text>
              </View>
              <MyPointStar id={st.id} size={22} color={C.muted} />
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </View>
          </Tile>
        );
      })}
      {!live && <Empty text="Waiting for data…" />}

      <Card>
        <CardHead title="Water health over time" sub="Average of all points, last 12 hours" />
        {trend?.length > 1 ? (
          <LineChart series={[{ id: 'wq', label: 'Health', color: C.primary, area: true, points: trend.map((p) => ({ x: p.t_ms, y: p.avg })) }]}
                     yDomain={[0, 100]} xFormat={fmtClock} yFormat={(y) => y.toFixed(0)} />
        ) : <Empty text="Collecting history…" />}
      </Card>
    </Screen>
  );
}
