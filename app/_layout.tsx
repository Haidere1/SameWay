import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ChatDock } from '@/components/ChatDock';
import { Neon } from '@/constants/theme';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';

const CarpoolTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Neon.accent,
    background: Neon.bg,
    card: Neon.bgElevated,
    text: Neon.text,
    border: Neon.border,
    notification: Neon.accentBlue,
  },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={CarpoolTheme}>
        <ChatProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Neon.bgElevated },
              headerTintColor: Neon.text,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: Neon.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Sign in' }} />
            <Stack.Screen name="signup" options={{ title: 'Create account' }} />
            <Stack.Screen name="verify-account" options={{ title: 'Verify account' }} />
            <Stack.Screen name="ride/[id]" options={{ title: 'Ride details' }} />
          </Stack>
          <ChatDock />
          <StatusBar style="light" />
        </ChatProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
