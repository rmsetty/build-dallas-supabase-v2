import { usePalette } from '@/hooks/use-palette';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { anchor: 'index' };

function Routes() {
  const { isAuthenticated } = useAuth();
  const colors = usePalette();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-in" options={{
          presentation: 'modal',
        }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colors = usePalette();
  return (
    <AuthProvider>
      <ThemeProvider value={colors.dark ? DarkTheme : DefaultTheme}>
        <StatusBar style={colors.dark ? 'light' : 'dark'} />
        <Routes />
      </ThemeProvider>
    </AuthProvider>
  );
}