import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Text from './Text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { C, FONT, PILL, STATION_COLOR, shadow } from '../lib/theme';
import { riverSummary } from '../lib/water';
import Sky, { moodOf } from './Sky';
import { tickFeel } from './motion';
import { BAND, bandOf, fmtClock, fmtMin, stationStatus } from '../lib/format';
import { dockSpace } from '../lib/dock';
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

/** Scrollable screen with pull-to-refresh and connection and advisory notices. dock leaves room for the round button. */
export function Screen({ title, subtitle, right, children, edges = ['top'], advisory = true, scroll = true, dock = false, sky = null }) {
  const { refresh, live, forecast } = useData();
  const space = dockSpace(useSafeAreaInsets().bottom);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };
  const banded = Boolean(sky);
  const body = (
    <>
      {!banded && (title || right) && (
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={FONT.title}>{title}</Text> : null}
            {subtitle ? <Text style={[FONT.small, { fontSize: 13, marginTop: 2 }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      <ConnectionNotice />
      {advisory && <AdvisoryBanner />}
      {children}
    </>
  );
  if (banded) {
    const heading = sky === true ? (
      <View style={[s.header, { marginBottom: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[FONT.title, { color: '#fff' }]}>{title}</Text>
          {subtitle ? <Text style={s.skySub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    ) : sky;
    return (
      <Background>
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
                    contentContainerStyle={{ paddingBottom: dock ? space + 34 : 44 }}>
          <Sky mood={moodOf(riverSummary(live, forecast))}>{heading}</Sky>
          <View style={s.under}>{body}</View>
        </ScrollView>
        <Toast lift={dock ? space + 22 : 18} />
      </Background>
    );
  }

  return (
    <Background>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerStyle={[s.scroll, dock && { paddingBottom: space + 30 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>
            {body}
          </ScrollView>
        ) : <View style={[s.scroll, { flex: 1 }]}>{body}</View>}
      </SafeAreaView>
      <Toast lift={dock ? space + 22 : 18} />
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
    <View style={[s.iconTile, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name={name} size={size * 0.48} color="#fff" />
    </View>
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

/** Marks a water point as yours, so the app opens on it. */
export function MyPointStar({ id, color = C.primary, size = 26 }) {
  const { myPoint, toggleMyPoint } = useData();
  const on = myPoint === id;
  return (
    <Pressable onPress={() => { tickFeel(); toggleMyPoint(id); }} hitSlop={12} accessibilityRole="button"
               accessibilityLabel={on ? 'Remove as my water point' : 'Make this my water point'} accessibilityState={{ selected: on }}>
      <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? C.advisory : color} />
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, busy, style }) {
  const primary = kind === 'primary';
  const danger = kind === 'danger';
  const onLight = kind === 'light';
  const content = (
    <View style={s.btnInner}>
      {busy ? <ActivityIndicator color={primary || danger ? '#fff' : C.primary} size="small" />
        : icon ? <Ionicons name={icon} size={16} color={primary || danger ? '#fff' : onLight ? C.primary : C.ink2} /> : null}
      <Text style={[s.btnText, { color: primary || danger ? '#fff' : onLight ? C.primary : C.ink2 }]}>{title}</Text>
    </View>
  );
  return (
    <PressScale onPress={onPress} disabled={disabled || busy} style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
      <View style={[s.btn, primary ? { backgroundColor: C.primary } : danger ? { backgroundColor: C.critical } : onLight ? { backgroundColor: '#fff' } : s.btnGhost]}>{content}</View>
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

/** The four risk levels side by side, like a public hazard report, with today's level picked out. */
export function RiskLevels({ band }) {
  const levels = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'];
  return (
    <View style={s.levels} accessibilityLabel={`Risk level: ${BAND[band]?.label ?? 'unknown'}`}>
      {levels.map((k) => {
        const on = k === band;
        return (
          <View key={k} style={{ flex: 1, gap: 5 }}>
            <View style={{ height: on ? 10 : 6, marginTop: on ? 0 : 2, borderRadius: 5, backgroundColor: BAND[k].color, opacity: on ? 1 : 0.28 }} />
            <Text style={[FONT.small, on && { color: C.ink, fontWeight: '600' }]} numberOfLines={1}>{BAND[k].label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Risk at this point for the next four hours, an hour at a time. */
export function NextHours({ now, series }) {
  if (!series?.length) return null;
  const at = (h) => series.reduce((a, p) => (Math.abs(p.tau - h * 3600) < Math.abs(a.tau - h * 3600) ? p : a), series[0]).risk;
  const hours = [['Now', now], ['1 h', at(1)], ['2 h', at(2)], ['3 h', at(3)], ['4 h', at(4)]];
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {hours.map(([label, risk]) => {
        const band = BAND[bandOf(risk)];
        return (
          <View key={label} style={s.hour} accessibilityLabel={`${label}: ${band.label}`}>
            <Text style={[FONT.small, { color: C.ink2 }]}>{label}</Text>
            <Ionicons name={band.icon} size={22} color={band.color} />
            <Text style={[FONT.small, { fontSize: 11, color: C.ink }]} numberOfLines={1}>{band.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A section that stays closed until someone wants the detail. */
export function Fold({ title, sub, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable onPress={() => setOpen((v) => !v)} style={s.fold} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Text style={FONT.h2}>{title}</Text>
          {sub ? <Text style={[FONT.small, { marginTop: 2 }]} numberOfLines={2}>{sub}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={C.ink2} />
      </Pressable>
      {open ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </Card>
  );
}

export function Empty({ text }) {
  return <Text style={[FONT.small, { fontSize: 13, paddingVertical: 6 }]}>{text}</Text>;
}

export function Toast({ lift = 18 }) {
  const { toast, dismissToast } = useData();
  if (!toast) return null;
  return (
    <Reveal key={toast.text} style={[s.toast, { bottom: lift }]}>
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
  scroll: { padding: 18, paddingBottom: 40, gap: 18 },
  under: { paddingHorizontal: 18, paddingTop: 10, gap: 20 },
  skySub: { fontSize: 14, lineHeight: 19, color: '#e3ecff', marginTop: 3 },
  levels: { flexDirection: 'row', gap: 6 },
  hour: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 2 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 2, marginBottom: 2 },
  card: { backgroundColor: C.card, borderRadius: 26, padding: 20 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, minHeight: 36 },
  iconTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary },
  tile: { backgroundColor: C.tile, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  link: { color: C.primary, fontWeight: '700', fontSize: 13 },
  btn: { borderRadius: 999, minHeight: 46, justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 18 },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnText: { fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
  toast: { position: 'absolute', left: 16, right: 16 },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 12, ...shadow },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  demoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff3cf', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  advisory: { flexDirection: 'row', gap: 12, backgroundColor: '#fff8e1', borderColor: '#f4dd8a', borderWidth: 1, borderRadius: 22, padding: 16 },
  advisoryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.advisory, alignItems: 'center', justifyContent: 'center' },
});
