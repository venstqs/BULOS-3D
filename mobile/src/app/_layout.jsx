import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '../lib/data';
import { C } from '../lib/theme';

const sheet = { presentation: 'modal', animation: 'slide_from_bottom' };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: C.primary,
            headerTitleStyle: { color: C.ink, fontWeight: '700' },
            headerStyle: { backgroundColor: C.bgTop },
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
          <Stack.Screen name="about" options={{ title: 'About Bulos 3D' }} />
          <Stack.Screen name="settings" options={{ title: 'Server settings' }} />
        </Stack>
      </DataProvider>
    </SafeAreaProvider>
  );
}
