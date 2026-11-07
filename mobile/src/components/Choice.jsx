import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './Text';
import { Ionicons } from '@expo/vector-icons';
import { C, FONT } from '../lib/theme';

/** Horizontal single-choice chips. options: [{ value, label }] */
export function Chips({ options, value, onChange, wrap = false }) {
  const chips = options.map((o) => {
    const on = o.value === value;
    return (
      <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[s.chip, on && s.on]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
        <Text style={[s.text, on && { color: '#fff' }]}>{o.label}</Text>
      </Pressable>
    );
  });
  return wrap
    ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chips}</ScrollView>;
}

/** Vertical list with a check mark on the selected item(s). */
export function Options({ options, isOn, onPress }) {
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <Pressable key={String(o.value)} onPress={() => onPress(o.value)} style={[s.option, on && { borderColor: C.primary, backgroundColor: '#eef3ff' }]}
                     accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.primary : C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={[FONT.body, { fontWeight: '700' }]}>{o.label}</Text>
              {o.sub ? <Text style={FONT.small}>{o.sub}</Text> : null}
            </View>
            {o.right ?? null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Label({ children }) {
  return <Text style={[FONT.small, { color: C.ink2, fontWeight: '700', marginBottom: 6, marginTop: 4 }]}>{children}</Text>;
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  on: { backgroundColor: C.primary, borderColor: C.primary },
  text: { fontWeight: '700', color: C.ink2, fontSize: 13 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
});
