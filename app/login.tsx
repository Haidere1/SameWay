import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter email and password.');
      return;
    }
    setBusy(true);
    try {
      const usr = await login(email.trim(), password);
      if (usr.accountReady === false) {
        router.replace('/verify-account');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.box}>
          <Text style={styles.title}>Welcome back</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={Neon.muted}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={Neon.muted}
            style={styles.input}
          />
          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
            <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/signup')} style={styles.link}>
            <Text style={styles.linkText}>New here? Create account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1, justifyContent: 'center', padding: 24 },
  box: {},
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Neon.text,
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Neon.text,
    fontSize: 16,
    marginBottom: 14,
  },
  btn: {
    backgroundColor: Neon.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  btnText: {
    color: Neon.onAccent,
    fontWeight: '800',
    fontSize: 17,
  },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: Neon.accentBlue, fontSize: 16, fontWeight: '600' },
});
