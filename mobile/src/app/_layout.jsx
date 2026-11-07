import { Inter_400Regular, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Intro from '../components/Intro';
import { DataProvider } from '../lib/data';
import { C } from '../lib/theme';

const sheet = { presentation: 'modal', animation: 'slide_from_bottom' };

export default function RootLayout() {
  const [loaded, failed] = useFonts({ Inter_400Regular, Inter_600SemiBold, Sora_600SemiBold, Sora_700Bold });
  const ready = loaded || Boolean(failed);
  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="light" />
        {ready && <Stack
          screenOptions={{
            headerTintColor: '#fff',
            headerTitleStyle: { color: '#fff', fontFamily: loaded ? 'Sora_600SemiBold' : undefined },
            headerStyle: { backgroundColor: C.primary },
            animation: 'slide_from_right',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.bgTop },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="point/[id]" options={{ title: 'Water point' }} />
          <Stack.Screen name="site/[id]" options={{ title: '3D site view' }} />
          <Stack.Screen name="water-test" options={{ title: 'Water test report', ...sheet }} />
          <Stack.Screen name="reminder" options={{ title: 'Add reminder', ...sheet }} />
          <Stack.Screen name="log" options={{ title: 'Log maintenance', ...sheet }} />
          <Stack.Screen name="advisory" options={{ title: 'Send advisory', ...sheet }} />
          <Stack.Screen name="simulate" options={{ title: 'Simulate a field event', ...sheet }} />
          <Stack.Screen name="reports" options={{ title: 'Reports' }} />
          <Stack.Screen name="safe" options={{ title: 'Is my water safe?', ...sheet }} />
          <Stack.Screen name="journey" options={{ headerShown: false }} />
          <Stack.Screen name="drill" options={{ title: 'Run a drill' }} />
          <Stack.Screen name="alerts" options={{ title: 'Alerts' }} />
          <Stack.Screen name="about" options={{ title: 'About Bulos 3D' }} />
          <Stack.Screen name="settings" options={{ title: 'Server settings' }} />
        </Stack>}
        <Intro ready={ready} />
      </DataProvider>
    </SafeAreaProvider>
  );
}
