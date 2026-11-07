import { useEffect, useState } from 'react';
import { Animated, ScrollView, Share, StyleSheet, View } from 'react-native';
import Text from '../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Empty, MyPointStar, PressScale, Screen } from '../components/ui';
import WaterDisc from '../components/WaterDisc';
import { tapFeel, useReducedMotion } from '../components/motion';
import { useData } from '../lib/data';
import { shareText, waterVerdict } from '../lib/safety';
import { C, FONT } from '../lib/theme';
import { waterAt, waterRgb } from '../lib/water';

/** The answer lands with a small bounce each time the point changes. */
function Verdict({ verdict, st, rgb }) {
  const reduced = useReducedMotion();
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    a.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.spring(a, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
  }, [a, reduced, st.id, verdict.level]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
      <View style={[s.verdict, { backgroundColor: verdict.color }]}>
        <WaterDisc size={84} rgb={rgb} style={s.disc}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff' }}>{st.wqhi.score}</Text>
        </WaterDisc>
        <View style={{ flex: 1, gap: 4 }}>
          <Ionicons name={verdict.icon} size={26} color="#fff" />
          <Text style={s.title}>{verdict.title}</Text>
          <Text style={s.sub}>{verdict.sub}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function Safe() {
  const { id } = useLocalSearchParams();
  const { live, forecast, myPoint } = useData();
  const router = useRouter();
  const [picked, setPicked] = useState(id ?? null);
  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;

  const st = live.stations.find((x) => x.id === (picked ?? myPoint)) ?? live.stations.find((x) => x.id === 'KS-03') ?? live.stations[0];
  const fc = forecast?.stations ?? live.forecast?.stations ?? {};
  const verdict = waterVerdict(st, live, fc);
  const share = () => Share.share({ message: shareText(st, verdict) }).catch(() => {});

  return (
    <Screen edges={[]} advisory={false}>
      <View style={{ gap: 8 }}>
        <Text style={FONT.h2}>Which water do you use?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ marginHorizontal: -18 }}>
          <View style={{ width: 10 }} />
          {live.stations.map((x) => {
            const on = x.id === st.id;
            return (
              <PressScale key={x.id} onPress={() => { tapFeel(); setPicked(x.id); }} style={[s.chip, on && s.chipOn]} accessibilityLabel={x.name} accessibilityState={{ selected: on }}>
                <Text style={[s.chipId, on && { color: '#fff' }]}>{x.id}</Text>
                <Text style={[s.chipName, on && { color: '#dfe8ff' }]} numberOfLines={2}>{x.name}</Text>
              </PressScale>
            );
          })}
          <View style={{ width: 10 }} />
        </ScrollView>
      </View>

      <Verdict verdict={verdict} st={st} rgb={waterRgb(...waterAt(live, st.chainage_m))} />

      <Card>
        <Text style={[FONT.h2, { marginBottom: 10 }]}>What to do</Text>
        <View style={{ gap: 10 }}>
          {verdict.steps.map((text, i) => (
            <View key={text} style={s.step}>
              <View style={s.stepNo}><Text style={s.stepNoText}>{i + 1}</Text></View>
              <Text style={[FONT.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={[FONT.h2, { marginBottom: 10 }]}>Why the app says this</Text>
        <View style={{ gap: 9 }}>
          {verdict.reasons.map((r) => (
            <View key={r.text} style={s.reason}>
              <Ionicons name={r.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={r.ok ? C.good : C.serious} />
              <Text style={[FONT.body, { flex: 1 }]}>{r.text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Share" kind="ghost" icon="share-outline" onPress={share} style={{ flex: 1 }} />
        <Button title="Full details" icon="list" onPress={() => router.push(`/point/${st.id}`)} style={{ flex: 1 }} />
      </View>
      <View style={s.mine}>
        <Text style={[FONT.body, { flex: 1, color: C.ink2 }]}>Make this my water point</Text>
        <MyPointStar id={st.id} />
      </View>

      <Text style={[FONT.small, { textAlign: 'center' }]}>
        This answer comes from a simulation for a student project. It is not a real water test. Always follow your barangay health office.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  chip: { width: 128, minHeight: 74, borderRadius: 18, padding: 12, backgroundColor: C.card },
  chipOn: { backgroundColor: C.primary },
  chipId: { fontSize: 13, fontWeight: '600', color: C.primary },
  chipName: { fontSize: 12, lineHeight: 16, color: C.ink2, marginTop: 2 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 26, padding: 18 },
  disc: { borderWidth: 3, borderColor: '#fff' },
  title: { fontSize: 22, lineHeight: 27, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  sub: { fontSize: 14, lineHeight: 19, color: '#fff' },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNo: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 14, minHeight: 52 },
});
