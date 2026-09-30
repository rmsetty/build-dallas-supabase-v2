import { usePalette } from '@/hooks/use-palette';
import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const colors = usePalette();
  return (
    <Stack screenOptions={{ headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="create-event" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="interests" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}
