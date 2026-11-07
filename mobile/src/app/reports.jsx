import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Text from '../components/Text';
import { Card, CardHead, Dot, Empty, Screen } from '../components/ui';
import { apiGet } from '../lib/api';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';
import { fmtClock, fmtDate } from '../lib/format';

const SEV = { danger: '#a32626', warning: '#7a5600', info: C.ink };

export default function Reports() {
  const { live, apiBase } = useData();
  const [comp, setComp] = useState(null);
  useEffect(() => {
    if (apiBase) apiGet(apiBase, '/api/compliance?hours=24').then(setComp).catch(() => setComp(false));
  }, [apiBase]);
  return (
    <Screen edges={[]} advisory={false}>
      <Card>
        <CardHead title="PNSDW 2017 compliance" sub="Raw intake samples within limits, last 24 hours" />
        {comp === null ? <Empty text="Loading…" /> : comp === false ? <Empty text="Compliance report unavailable." /> : comp.stations.map((s, i) => (
          <View key={s.station_id} style={{ paddingVertical: 9, borderBottomWidth: i === comp.stations.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Dot id={s.station_id} />
              <Text style={[FONT.body, { fontWeight: '700', flex: 1 }]}>{s.station_id}</Text>
              <Text style={FONT.small}>{s.samples} samples, WQHI {s.wqhi_avg}</Text>
            </View>
            <Text style={[FONT.small, { marginTop: 3, color: C.ink2 }]}>
              Turbidity {s.turbidity_pct}%, pH {s.ph_pct}%, TDS {s.tds_pct}%, intake closed {s.intake_closed_pct}%
            </Text>
          </View>
        ))}
        {comp && <Text style={[FONT.small, { marginTop: 6 }]}>Archive: {comp.backend}</Text>}
      </Card>

      <Card>
        <CardHead title="Text messages" sub={live?.sms_provider === 'outbox' ? 'No SMS gateway configured: logged only' : live?.sms_provider} />
        {!live?.sms.length && <Empty text="No messages yet." />}
        {live?.sms.map((m, i) => (
          <View key={`${m.t}-${i}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={FONT.small}>To {m.role}, {m.status}</Text>
            <Text style={FONT.body}>{m.message}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <CardHead title="Event log" />
        {live?.events.slice(0, 40).map((e, i) => (
          <View key={`${e.t_ms}-${i}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={FONT.small}>{fmtDate(e.t_ms)} {fmtClock(e.t_ms)}, {e.station ?? 'system'}, {e.type.replaceAll('_', ' ').toLowerCase()}</Text>
            <Text style={[FONT.body, { color: SEV[e.severity] ?? C.ink }]}>{e.message}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
