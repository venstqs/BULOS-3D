import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button } from './ui';
import { useData } from '../lib/data';
import { C, FONT } from '../lib/theme';

/**
 * CesiumJS / Three.js cannot run natively in Expo Go, so the 3D views are the
 * website's own embed pages (?embed=map | ?embed=site) inside a WebView.
 */
export default function Web3D({ query, onMessage, style }) {
  const { servers } = useData();
  const [state, setState] = useState('loading');
  const [nonce, setNonce] = useState(0);
  if (!servers) return null;
  const qs = Object.entries({ ...query, api: servers.api })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const uri = `${servers.web.replace(/\/+$/, '')}/?${qs}`;
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
          <Text style={FONT.h2}>The 3D view could not load</Text>
          <Text style={[FONT.body, { color: C.ink2, textAlign: 'center' }]}>
            It comes from the Bulos 3D website at {servers.web}. Start it on your PC with “npm run start:lan”, then try again.
          </Text>
          <Button title="Try again" icon="refresh" onPress={() => { setState('loading'); setNonce((n) => n + 1); }} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: 'hidden', backgroundColor: C.panel2 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});
