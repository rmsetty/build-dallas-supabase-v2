import { Tabs } from 'expo-router';
import { usePalette } from '@/hooks/use-palette';
import { HomeTabBar } from '../home/components/home-chrome';

export default function MainTabs() {
  const colors = usePalette();
  return (
    <Tabs
      initialRouteName="home"
      backBehavior="none"
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { position: 'absolute' },
      }}
      tabBar={({ state, navigation }) => {
        const select = (name: 'home' | 'explore') => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return;
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (state.routes[state.index].key !== route.key && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        return (
          <HomeTabBar
            active={state.routes[state.index].name === 'explore' ? 'discover' : 'home'}
            onHomePress={() => select('home')}
            onDiscoverPress={() => select('explore')}
          />
        );
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Discover' }} />
    </Tabs>
  );
}
