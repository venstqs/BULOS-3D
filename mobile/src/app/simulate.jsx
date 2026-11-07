import Text from '../components/Text';
import { useRouter } from 'expo-router';
import { Card, Empty, Screen } from '../components/ui';
import { Chips, Label, Options } from '../components/Choice';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

const SCENARIOS = [
  ['SEPTIC', 'Piggery lagoon spill', 'Raw effluent enters the farm tributary. AG-02 detects it in about 20 s, then the kiosk gets a forecast warning.'],
  ['MONSOON', 'Heavy monsoon rain', '45 mm/h for an hour. Runoff turns the whole river turbid; intakes close ahead of it.'],
  ['BIOFOULING', 'Dirty sensor at KS-03', 'Biofilm on the turbidity probe. The twin calls it a sensor fault, keeps water flowing and adds a cleaning task.'],
  ['RESET', 'Back to normal', 'Clear all simulated events.'],
];
const STARTED = {
  SEPTIC: 'Piggery spill started. Watch AG-02 on the Home or Points tab.',
  MONSOON: 'Heavy rain started. Rainfall builds over 15 simulated minutes.',
  BIOFOULING: 'Biofilm is growing on the KS-03 probe. About a minute until the twin flags it.',
  RESET: 'All simulated events cleared.',
};

export default function Simulate() {
  const router = useRouter();
  const { live, act } = useData();
  if (!live) return <Screen edges={[]}><Empty text="Loading…" /></Screen>;
  if (live.clock.mode !== 'sim') return <Screen edges={[]}><Card><Text style={FONT.body}>The server is running on live sensor feeds, so simulations are off.</Text></Card></Screen>;
  const run = async (name) => {
    if (await act('/api/scenario', { name }, STARTED[name])) router.back();
  };
  return (
    <Screen edges={[]} advisory={false}>
      <Text style={[FONT.body, { color: C.ink2 }]}>Inject a field event into the virtual field. The twin only sees sensor packets, as it would in a real deployment.</Text>
      <Card>
        <Options options={SCENARIOS.map(([value, label, sub]) => ({ value, label, sub }))} isOn={() => false} onPress={run} />
      </Card>
      <Card>
        <Label>Simulation speed</Label>
        <Chips wrap options={[1, 10, 30, 60, 120, 240].map((v) => ({ value: v, label: `${v}×` }))} value={live.clock.speed}
               onChange={(speed) => act('/api/speed', { speed }, `Speed set to ${speed}× real time.`)} />
        <Text style={[FONT.small, { marginTop: 8 }]}>Simulated seconds per real second. 60× plays an hour of river flow in a minute.</Text>
      </Card>
    </Screen>
  );
}
