import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Button, Card, Dot, Pill, StatusBadge } from './ui';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';
import { fmt } from '../lib/format';

/**
 * 3D Cesium/Three.js view embedded via WebView.
 * If the web server is offline or in standalone mode, it provides an
 * interactive native 2D React Native schematic so testing is never blocked.
 */
export default function Web3D({ query, onMessage, style }) {
  const { servers, live, isStandalone } = useData();
  const [state, setState] = useState('loading');
  const [nonce, setNonce] = useState(0);
  const [useNativeFallback, setUseNativeFallback] = useState(isStandalone);

  if (!servers) return null;

  const qs = Object.entries({ ...query, api: servers.api })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const uri = `${servers.web.replace(/\/+$/, '')}/?${qs}`;

  if (useNativeFallback) {
    return (
      <View style={[s.wrap, style]}>
        <View style={s.topBar}>
          <Text style={[FONT.small, { fontWeight: '700', color: C.ink }]}>Native 2D Schematic Mode</Text>
          <Pressable onPress={() => { setUseNativeFallback(false); setState('loading'); setNonce((n) => n + 1); }}>
            <Text style={[FONT.small, { color: C.primary, fontWeight: '700' }]}>Try 3D View</Text>
          </Pressable>
        </View>
        {query.embed === 'map' ? (
          <NativeMapSchematic live={live} onSelect={(id) => onMessage?.({ type: 'select', id })} />
        ) : (
          <NativeSiteSchematic st={live?.stations?.find((x) => x.id === query.id) ?? live?.stations?.[0]} />
        )}
      </View>
    );
  }

  return (
    <View style={[s.wrap, style]}>
      {state !== 'error' && (
        <WebView
          key={`${uri}-${nonce}`}
          source={{ uri }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          onLoadEnd={() => setState((x) => (x === 'error' ? x : 'ready'))}
          onError={() => setState('error')}
          onHttpError={() => setState('error')}
          onMessage={(e) => {
            try { onMessage?.(JSON.parse(e.nativeEvent.data)); } catch { /* ignore non-JSON */ }
          }}
          style={{ flex: 1, backgroundColor: C.panel2 }}
        />
      )}
      {state === 'loading' && (
        <View style={s.overlay} pointerEvents="none">
          <ActivityIndicator color={C.primary} />
          <Text style={FONT.small}>Loading the 3D view…</Text>
        </View>
      )}
      {state === 'error' && (
        <View style={s.error}>
          <Ionicons name="cube-outline" size={38} color={C.ink2} />
          <Text style={FONT.h2}>3D Web View Unavailable</Text>
          <Text style={[FONT.body, { color: C.ink2, textAlign: 'center', maxWidth: 280 }]}>
            The 3D Web server ({servers.web}) is unreachable. You can test immediately using the native React Native view.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button title="Switch to Native 2D" icon="map" onPress={() => setUseNativeFallback(true)} />
            <Button title="Retry 3D" kind="ghost" icon="refresh" onPress={() => { setState('loading'); setNonce((n) => n + 1); }} />
          </View>
        </View>
      )}
    </View>
  );
}

function NativeMapSchematic({ live, onSelect }) {
  if (!live) return null;
  return (
    <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
      <Text style={[FONT.small, { color: C.ink2 }]}>Mt. Isarog Peak (1,852 m) → Naga River Main Stem</Text>
      <View style={{ gap: 8, marginVertical: 6 }}>
        {live.stations.map((st) => (
          <Pressable
            key={st.id}
            onPress={() => onSelect?.(st.id)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              padding: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.line,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dot id={st.id} size={10} />
              <View>
                <Text style={[FONT.body, { fontWeight: '700' }]}>{st.id} · {st.name}</Text>
                <Text style={FONT.small}>{fmt(st.elevation_m, 0)} m elev · chainage {(st.chainage_m / 1000).toFixed(1)} km</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <StatusBadge st={st} />
              {st.valve && !st.valve.open && <Text style={[FONT.small, { color: '#a32626', fontWeight: '700' }]}>Intake Closed</Text>}
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={[FONT.small, { color: C.ink2, textAlign: 'center' }]}>Tap any station to inspect gauges and controls.</Text>
    </View>
  );
}

function NativeSiteSchematic({ st }) {
  if (!st) return null;
  return (
    <View style={{ flex: 1, padding: 14, justifyContent: 'space-around' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={FONT.h2}>{st.name} ({st.id})</Text>
        <StatusBadge st={st} />
      </View>

      <View style={{ gap: 8 }}>
        <Card style={{ marginVertical: 0, padding: 10 }}>
          <Text style={[FONT.small, { fontWeight: '700', marginBottom: 4 }]}>Telemetry & Optics</Text>
          <Text style={FONT.body}>
            Turbidity: {st.reading.turbidity} NTU · ORP: {st.reading.orp} mV · pH: {st.reading.ph}
          </Text>
          <Text style={[FONT.small, { color: C.ink2 }]}>
            {st.classification === 'SENSOR_BIOFOULING' ? 'Optical probe has biofilm; drift compensator active.' : 'Sensor clean; readings at baseline.'}
          </Text>
        </Card>

        {st.valve && (
          <Card style={{ marginVertical: 0, padding: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[FONT.small, { fontWeight: '700' }]}>12V Solenoid Valve Actuator</Text>
              <Pill text={st.valve.open ? 'OPEN' : 'CLOSED'} kind={st.valve.open ? 'good' : 'red'} />
            </View>
            <Text style={[FONT.small, { color: C.ink2, marginTop: 4 }]}>
              {st.valve.open ? 'Water flowing into treatment storage.' : 'Flow stopped. Downstream consumers protected.'}
            </Text>
          </Card>
        )}

        {st.tank && (
          <Card style={{ marginVertical: 0, padding: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[FONT.small, { fontWeight: '700' }]}>Storage Reserve</Text>
              <Text style={[FONT.body, { fontWeight: '700' }]}>{st.tank.pct}% ({st.tank.reserve_h} h)</Text>
            </View>
            <View style={{ height: 8, backgroundColor: C.line, borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
              <View style={{ width: `${st.tank.pct}%`, height: '100%', backgroundColor: st.tank.pct < 20 ? '#c23a2c' : C.primary }} />
            </View>
          </Card>
        )}
      </View>

      <Text style={[FONT.small, { color: C.ink2, textAlign: 'center' }]}>
        LoRaWAN edge node: {st.link.rssi} dBm · battery {st.link.battery_v} V
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', backgroundColor: C.panel2 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
});
