import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Children, useEffect, useState } from 'react';
import { C, FONT, PILL, STATION_COLOR, shadow } from '../lib/theme';
import { fmtClock, fmtMin, stationStatus } from '../lib/format';
import { useData } from '../lib/data';
import Logo from './Logo';

export function Background({ children }) {
  return <View style={{ flex: 1, backgroundColor: C.bgTop }}>{children}</View>;
}

/* ---------------- motion ---------------- */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Fades and rises into place once, when a screen opens. */
export function Reveal({ children, delay = 0, style }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, delay]);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{children}</Animated.View>;
}

/** Sinks slightly under the finger, so every tap feels answered. */
export function PressScale({ children, style, onPress, disabled, ...rest }) {
  const [v] = useState(() => new Animated.Value(1));
  const to = (x) => Animated.spring(v, { toValue: x, speed: 40, bounciness: 5, useNativeDriver: true }).start();
  return (
    <AnimatedPressable onPress={onPress} disabled={disabled} onPressIn={() => to(0.97)} onPressOut={() => to(1)} accessibilityRole="button" style={[style, { transform: [{ scale: v }] }]} {...rest}>
      {children}
    </AnimatedPressable>
  );
}

/** A bar that grows to its value and glides when the value changes. */
export function Meter({ pct = 0, color = C.primary, height = 8 }) {
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(w, { toValue: Math.min(100, Math.max(0, pct)), duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [w, pct]);
  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: '#e4ecff' }}>
      <Animated.View style={{ height: '100%', borderRadius: height / 2, backgroundColor: color, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

/** Gently breathes, for things that need attention or are still loading. */
export function Pulse({ children, style, min = 0.92 }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[style, { transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [min, 1] }) }] }]}>{children}</Animated.View>;
}

export function LoadingLogo({ text, size = 64 }) {
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <Pulse><Logo size={size} /></Pulse>
      {text ? <Text style={[FONT.body, { color: C.ink2 }]}>{text}</Text> : null}
    </View>
  );
}

/** Scrollable screen with gradient background, pull-to-refresh, connection + advisory notices. */
export function Screen({ title, subtitle, right, children, edges = ['top'], advisory = true, scroll = true }) {
  const { refresh } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };
  const body = (
    <>
      {(title || right) && (
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            {subtitle ? <Text style={FONT.small}>{subtitle}</Text> : null}
            {title ? <Text style={FONT.title}>{title}</Text> : null}
          </View>
          {right}
        </View>
      )}
      <ConnectionNotice />
      {advisory && <AdvisoryBanner />}
      {scroll ? Children.toArray(children).map((child, i) => <Reveal key={child?.key ?? i} delay={Math.min(i, 5) * 55}>{child}</Reveal>) : children}
    </>
  );
  return (
    <Background>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
            {body}
          </ScrollView>
        ) : <View style={[s.scroll, { flex: 1 }]}>{body}</View>}
      </SafeAreaView>
      <Toast />
    </Background>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function CardHead({ title, sub, icon, action, onAction }) {
  return (
    <View style={s.cardHead}>
      {icon ? <IconTile name={icon} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={FONT.h2} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[FONT.small, { marginTop: 2 }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={s.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconTile({ name, size = 42 }) {
  return (
    <LinearGradient colors={[C.primaryLight, C.primary]} style={[s.iconTile, { width: size, height: size, borderRadius: size * 0.31 }]}>
      <Ionicons name={name} size={size * 0.48} color="#fff" />
    </LinearGradient>
  );
}

export function Tile({ children, style, onPress }) {
  if (onPress) return <PressScale onPress={onPress} style={[s.tile, style]}>{children}</PressScale>;
  return <View style={[s.tile, style]}>{children}</View>;
}

export function Pill({ text, kind = 'blue', icon }) {
  const [bg, fg] = PILL[kind] ?? PILL.blue;
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[s.pillText, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export function StatusBadge({ st }) {
  const status = stationStatus(st);
  return <Pill text={status.label} kind={status.pill} icon={status.icon} />;
}

export function Dot({ id, size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: STATION_COLOR[id] ?? C.primary }} />;
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, busy, style }) {
  const primary = kind === 'primary';
  const danger = kind === 'danger';
  const content = (
    <View style={s.btnInner}>
      {busy ? <ActivityIndicator color={primary || danger ? '#fff' : C.primary} size="small" />
        : icon ? <Ionicons name={icon} size={16} color={primary || danger ? '#fff' : C.ink2} /> : null}
      <Text style={[s.btnText, { color: primary || danger ? '#fff' : C.ink2 }]}>{title}</Text>
    </View>
  );
  return (
    <PressScale onPress={onPress} disabled={disabled || busy} style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      <View style={[s.btn, primary ? { backgroundColor: C.primary } : danger ? { backgroundColor: C.critical } : s.btnGhost]}>{content}</View>
    </PressScale>
  );
}

export function Row({ label, value, last }) {
  return (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      <Text style={[FONT.small, { fontSize: 13 }]}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number'
        ? <Text style={[FONT.body, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{value}</Text> : value}
    </View>
  );
}

export function Empty({ text }) {
  return <Text style={[FONT.small, { fontSize: 13, paddingVertical: 6 }]}>{text}</Text>;
}

export function Toast() {
  const { toast, dismissToast } = useData();
  if (!toast) return null;
  return (
    <Reveal key={toast.text} style={s.toast}>
      <Pressable onPress={dismissToast} style={[s.toastInner, { borderColor: toast.ok ? '#b7d7b7' : '#e9b4b4' }]}>
        <Ionicons name={toast.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={toast.ok ? C.good : C.critical} />
        <Text style={[FONT.body, { flex: 1, color: toast.ok ? '#157a3e' : '#a32626' }]}>{toast.text}</Text>
      </Pressable>
    </Reveal>
  );
}

export function ConnectionNotice() {
  const { status, live, servers, error, toggleStandalone } = useData();
  const router = useRouter();
  if (status === 'online') return null;
  if (status === 'standalone') {
    return (
      <Pressable onPress={() => router.push('/settings')} style={s.demoBar} accessibilityRole="button">
        <Ionicons name="flask" size={15} color="#7a5600" />
        <Text style={[FONT.small, { color: '#7a5600', fontWeight: '700', flex: 1 }]}>Demo mode: simulated data on this phone. Nothing here is a real reading.</Text>
      </Pressable>
    );
  }
  if (status === 'connecting' && !live) {
    return <View style={{ paddingVertical: 48 }}><LoadingLogo text="Connecting to the twin…" /></View>;
  }
  return (
    <Card style={{ borderColor: '#e9b4b4' }}>
      <Text style={[FONT.h2, { color: '#a32626' }]}>{live ? 'Connection lost' : 'Cannot reach the data server'}</Text>
      <Text style={[FONT.body, { marginTop: 6, color: C.ink2 }]}>
        {live ? 'Showing the last readings. Retrying every few seconds.'
          : `The app is looking for Bulos 3D at ${servers?.api}. On your PC, run "npm run start:lan" in the project folder, and keep your phone on the same Wi-Fi.`}
      </Text>
      {error ? <Text style={[FONT.small, { marginTop: 6 }]}>{error}</Text> : null}
      <Button title="Server settings" kind="ghost" icon="settings" onPress={() => router.push('/settings')} style={{ marginTop: 12 }} />
      {!live && <Button title="Use demo mode instead" kind="ghost" icon="flask" onPress={toggleStandalone} style={{ marginTop: 8 }} />}
    </Card>
  );
}

export function AdvisoryBanner() {
  const { live, forecast } = useData();
  const router = useRouter();
  if (!live) return null;
  const fc = forecast?.stations ?? live.forecast?.stations ?? {};
  const now = live.stations.filter((st) => st.classification === 'ACUTE_EVENT');
  const coming = live.stations.filter((st) => fc[st.id]?.arrival_s > 0 && fc[st.id].peak_risk >= 0.45);
  if (!now.length && !coming.length) return null;
  const issued = live.events.filter((e) => ['FORECAST_ADVISORY', 'EDGE_AUTO_TRIP', 'ANOMALY'].includes(e.type));
  return (
    <View style={s.advisory} accessibilityRole="alert">
      <Pulse style={s.advisoryIcon}><Ionicons name="warning" size={20} color={C.ink} /></Pulse>
      <View style={{ flex: 1 }}>
        <Text style={FONT.h2}>Water advisory No. {Math.max(1, issued.length)}</Text>
        <Text style={FONT.small}>Issued {fmtClock(issued[0]?.t_ms ?? live.clock.epoch_ms)}</Text>
        {now.length > 0 && <Text style={[FONT.body, { marginTop: 4 }]}>Contamination at {now.map((x) => x.name).join(', ')}.</Text>}
        {coming.map((x) => (
          <Text key={x.id} style={[FONT.body, { marginTop: 2 }]}>Arriving at {x.name} in {fmtMin(fc[x.id].arrival_s)}.</Text>
        ))}
        <Text style={[FONT.small, { marginTop: 4, color: C.ink2 }]}>Do not drink untreated water along this stretch; boil for at least 1 minute.</Text>
        <Button title="Send advisory" icon="send" onPress={() => router.push('/advisory')} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 2, marginBottom: 2 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, minHeight: 36 },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  tile: { backgroundColor: C.tile, borderRadius: 16, padding: 12, shadowColor: '#2f5be7', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  link: { color: C.primary, fontWeight: '700', fontSize: 13 },
  btn: { borderRadius: 14, paddingVertical: 11, paddingHorizontal: 16 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 18 },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 12, ...shadow },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  demoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff3cf', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  advisory: { flexDirection: 'row', gap: 12, backgroundColor: '#fff8e1', borderColor: '#f4dd8a', borderWidth: 1, borderRadius: 22, padding: 16 },
  advisoryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.advisory, alignItems: 'center', justifyContent: 'center' },
});
