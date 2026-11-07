import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';
import { useData } from '../../lib/data';

const TABS = [
  ['index', 'Home', 'home'],
  ['map', '3D map', 'map'],
  ['forecast', 'Forecast', 'pulse'],
  ['points', 'Points', 'water'],
  ['maintenance', 'Tasks', 'calendar'],
  ['more', 'More', 'ellipsis-horizontal'],
];

export default function TabLayout() {
  const { tasks, live } = useData();
  const urgent = (tasks ?? []).filter((t) => t.status === 'OVERDUE' || (t.urgent && t.status !== 'COMPLETED')).length;
  const alerts = live?.stations.filter((s) => s.classification === 'ACUTE_EVENT').length ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: C.line, height: 62, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size - 2} color={color} />,
            tabBarBadge: name === 'maintenance' && urgent ? urgent : name === 'points' && alerts ? alerts : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
