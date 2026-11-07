import { createContext, useContext } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNInput } from 'react-native';
import { isLoaded } from 'expo-font';

// Sora for headings and Inter for reading, the same pair as the website.
let loaded = false;
const fontsReady = () => {
  if (!loaded) loaded = isLoaded('Inter_400Regular');
  return loaded;
};

function face({ fontWeight, fontSize = 14 }) {
  const weight = fontWeight === 'bold' ? 700 : Number(fontWeight) || 400;
  if (weight < 600) return 'Inter_400Regular';
  if (fontSize < 15) return 'Inter_600SemiBold';
  return weight >= 700 ? 'Sora_700Bold' : 'Sora_600SemiBold';
}

const Nested = createContext(false);

export default function Text({ style, ...rest }) {
  const nested = useContext(Nested);
  const flat = StyleSheet.flatten(style) ?? {};
  const pick = fontsReady() && !flat.fontFamily && (!nested || flat.fontWeight);
  return (
    <Nested value>
      <RNText style={[style, pick && { fontFamily: face(flat), fontWeight: 'normal' }]} {...rest} />
    </Nested>
  );
}

export function TextInput({ style, ...rest }) {
  return <RNInput style={[style, fontsReady() && { fontFamily: 'Inter_400Regular' }]} {...rest} />;
}
