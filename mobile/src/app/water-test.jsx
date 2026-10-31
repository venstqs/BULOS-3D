import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Empty, Pill, Screen } from '../components/ui';
import { Chips, Label } from '../components/Choice';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';
import { fmt, fmtClock } from '../lib/format';

export default function WaterTest() {
  const params = useLocalSearchParams();
  const { live, static: st } = useData();
  const [id, setId] = useState(params.id ?? 'KS-03');
  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;
  const s = live.stations.find((x) => x.id === id) ?? live.stations[0];
  const r = s.reading;
  const p = st?.pnsdw ?? { turbidity_ntu: 5, ph_min: 6.5, ph_max: 8.5, tds_mgL: 600 };
  const rows = [
    ['Turbidity', `${fmt(r.turbidity, 1)} NTU`, `≤ ${p.turbidity_ntu} NTU`, r.turbidity <= p.turbidity_ntu],
    ['pH', fmt(r.ph, 2), `${p.ph_min}–${p.ph_max}`, r.ph >= p.ph_min && r.ph <= p.ph_max],
    ['Total dissolved solids', `${fmt(r.tds, 0)} mg/L`, `≤ ${p.tds_mgL} mg/L`, r.tds <= p.tds_mgL],
    ['Oxidation-reduction potential', `${fmt(r.orp, 0)} mV`, `near ${fmt(s.baseline.orp, 0)} mV`, r.orp >= s.baseline.orp - 100],
    ['Biological indicator (TLF)', r.bio == null ? 'no sensor' : `${fmt(r.bio, 1)} ppb`, '< 10 ppb', r.bio == null ? null : r.bio < 10],
    ['Water temperature', `${fmt(r.temp, 1)} °C`, 'reference', null],
  ];
  const fails = rows.filter((x) => x[3] === false).length;
  const share = () => Share.share({
    message: [`Bulos 3D water test: ${s.name} (${s.id}), ${fmtClock(live.clock.epoch_ms)}`,
      ...rows.map(([n, v, std, ok]) => `${n}: ${v} (${std}) ${ok == null ? '' : ok ? 'PASS' : 'FAIL'}`),
      `WQHI ${s.wqhi.score}/100, contamination risk ${fmt(s.risk, 2)}`].join('\n'),
  });
  return (
    <Screen edges={[]} advisory={false}>
      <Label>Water point</Label>
      <Chips options={live.stations.map((x) => ({ value: x.id, label: x.id }))} value={s.id} onChange={setId} />
      <Card>
        <Text style={FONT.h2}>{s.name}</Text>
        <Text style={FONT.small}>Latest reading {fmtClock(live.clock.epoch_ms)} · Philippine National Standards for Drinking Water (PNSDW 2017)</Text>
        <View style={{ marginTop: 10 }}>
          {rows.map(([n, v, std, ok], i) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={[FONT.body, { fontWeight: '600' }]}>{n}</Text>
                <Text style={FONT.small}>Standard {std}</Text>
              </View>
              <Text style={[FONT.body, { fontWeight: '700' }]}>{v}</Text>
              <Pill text={ok == null ? 'info' : ok ? 'Pass' : 'Fail'} kind={ok == null ? 'grey' : ok ? 'good' : 'red'} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Pill text={fails ? `${fails} outside the standard` : 'All within the standard'} kind={fails ? 'red' : 'good'} />
          <Text style={FONT.small}>WQHI {s.wqhi.score}/100 · risk {fmt(s.risk, 2)}</Text>
        </View>
        <Text style={[FONT.small, { marginTop: 10 }]}>Raw intake water. Sensors are surrogates for bacteria; confirm suspected contamination with a lab E. coli test.</Text>
      </Card>
      <Button title="Share report" icon="send" onPress={share} />
    </Screen>
  );
}
