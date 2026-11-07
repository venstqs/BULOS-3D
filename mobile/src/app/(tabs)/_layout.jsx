import { Tabs } from 'expo-router';
import Dock from '../../components/Dock';

const TABS = [
  ['index', 'Home'],
  ['map', '3D map'],
  ['forecast', 'Forecast'],
  ['points', 'Points'],
  ['maintenance', 'Tasks'],
  ['more', 'More'],
];

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <Dock {...props} />} screenOptions={{ headerShown: false, animation: 'fade' }}>
      {TABS.map(([name, title]) => <Tabs.Screen key={name} name={name} options={{ title }} />)}
    </Tabs>
  );
}
