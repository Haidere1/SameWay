import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';

export default function VerifyAccountScreen() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.accountReady) {
      router.replace('/(tabs)');
    }
  }, [user?.accountReady, router, user]);

  const goHomeIfReady = async () => {
    const u = await refreshUser();
    if (u?.accountReady) {
      router.replace('/(tabs)');
    }
  };

  const onVerifyEmail = async () => {
    if (emailCode.trim().length !== 6) {
      Alert.alert('Email code', 'Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      await api.verifyEmailCode(emailCode.trim());
      setEmailCode('');
      Alert.alert('Email verified', 'Great — now verify your phone.');
      await refreshUser();
    } catch (e) {
      Alert.alert('Verification failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyPhone = async () => {
    if (phoneCode.trim().length !== 6) {
      Alert.alert('Phone code', 'Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      await api.verifyPhoneCode(phoneCode.trim());
      setPhoneCode('');
      Alert.alert('Phone verified', 'Your account is ready.');
      await goHomeIfReady();
    } catch (e) {
      Alert.alert('Verification failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onResendEmail = async () => {
    setBusy(true);
    try {
      const r = await api.resendEmailCode();
      const msg =
        r.devCode != null
          ? `Dev code: ${r.devCode} (non-production server)`
          : 'A new code was generated. Check your email (or server logs in development).';
      Alert.alert('Code sent', msg);
    } catch (e) {
      Alert.alert('Resend failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onResendPhone = async () => {
    setBusy(true);
    try {
      const r = await api.resendPhoneCode();
      const msg =
        r.devCode != null
          ? `Dev code: ${r.devCode} (non-production server)`
          : 'A new code was generated. Check SMS (or server logs in development).';
      Alert.alert('Code sent', msg);
    } catch (e) {
      Alert.alert('Resend failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <Text style={styles.muted}>Sign in first.</Text>
        <Pressable onPress={() => router.replace('/login')} style={styles.link}>
          <Text style={styles.linkText}>Go to sign in</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Verify your account</Text>
          <Text style={styles.sub}>
            Before you can join or offer rides, confirm your email and phone. Codes are sent when you sign up;
            in development they also appear in the API response and server console.
          </Text>
          {user.cnicDocumentUploaded ? (
            <Text style={styles.ok}>CNIC card image uploaded.</Text>
          ) : (
            <Text style={styles.warn}>CNIC card image missing — sign up again with both photos.</Text>
          )}

          <Text style={styles.section}>1. Email {!user.emailVerified ? '(required)' : '✓'}</Text>
          {!user.emailVerified ? (
            <>
              <TextInput
                value={emailCode}
                onChangeText={setEmailCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit code"
                placeholderTextColor={Neon.muted}
                style={styles.input}
              />
              <Pressable
                onPress={onVerifyEmail}
                disabled={busy}
                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
                <Text style={styles.btnText}>Verify email</Text>
              </Pressable>
              <Pressable onPress={onResendEmail} disabled={busy} style={styles.secondary}>
                <Text style={styles.secondaryText}>Resend email code</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.done}>Verified</Text>
          )}

          <Text style={styles.section}>2. Phone {!user.phoneVerified ? '(required)' : '✓'}</Text>
          {!user.phoneVerified ? (
            <>
              <TextInput
                value={phoneCode}
                onChangeText={setPhoneCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit code"
                placeholderTextColor={Neon.muted}
                style={styles.input}
              />
              <Pressable
                onPress={onVerifyPhone}
                disabled={busy}
                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
                <Text style={styles.btnText}>Verify phone</Text>
              </Pressable>
              <Pressable onPress={onResendPhone} disabled={busy} style={styles.secondary}>
                <Text style={styles.secondaryText}>Resend phone code</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.done}>Verified</Text>
          )}

          <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skip}>
            <Text style={styles.skipText}>Back to app</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: Neon.text, marginBottom: 10 },
  sub: { color: Neon.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  section: { color: Neon.accentSoft, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Neon.text,
    fontSize: 18,
    letterSpacing: 4,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: Neon.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnPressed: { opacity: 0.9 },
  btnText: { color: Neon.onAccent, fontWeight: '800', fontSize: 16 },
  secondary: { paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: Neon.accentBlue, fontWeight: '600' },
  done: { color: Neon.accentSoft, fontWeight: '600' },
  ok: { color: Neon.accentSoft, marginBottom: 8 },
  warn: { color: '#f87171', marginBottom: 8 },
  muted: { color: Neon.muted, padding: 24 },
  link: { padding: 16 },
  linkText: { color: Neon.accentBlue, fontWeight: '600' },
  skip: { marginTop: 32, alignItems: 'center' },
  skipText: { color: Neon.muted, fontSize: 15 },
});
