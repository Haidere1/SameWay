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

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) { Alert.alert('Missing fields', 'Enter email and password.'); return; }
    setBusy(true);
    try {
      const usr = await login(email.trim(), password);
      if (usr.accountReady === false) router.replace('/verify-account');
      else router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : 'Try again');
    } finally { setBusy(false); }
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.box}>

          {/* BRAND */}
          <View style={styles.brand}>
            <Text style={styles.brandLabel}>WELCOME BACK</Text>
            <Text style={styles.brandTitle}>SAME<Text style={styles.brandAccent}>WAY</Text></Text>
            <Text style={styles.brandSub}>Sign in to your account</Text>
          </View>

          {/* FORM CARD */}
          <View style={styles.card}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                value={email} onChangeText={setEmail}
                autoCapitalize="none" keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={Neon.muted}
                style={styles.fieldInput}
              />
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.passRow}>
                <TextInput
                  value={password} onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  placeholder="Your password"
                  placeholderTextColor={Neon.muted}
                  style={[styles.fieldInput, { flex: 1 }]}
                />
                <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* SUBMIT */}
          <Pressable
            onPress={onSubmit} disabled={busy}
            style={({ pressed }) => [styles.btn, busy && styles.btnDisabled, pressed && !busy && styles.btnPressed]}>
            <LinearGradient
              colors={busy ? ['#3f3f46', '#27272a'] : [Neon.accent, '#c01920']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnGrad}>
              <Text style={styles.btnText}>{busy ? 'SIGNING IN…' : 'SIGN IN'}</Text>
              {!busy && <Text style={styles.btnArrow}>›</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => router.push('/signup')} style={styles.link}>
            <Text style={styles.linkText}>No account? <Text style={styles.linkAccent}>Create one →</Text></Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  box: {},
  brand: { marginBottom: 32, alignItems: 'center' },
  brandLabel: { color: Neon.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  brandTitle: { fontSize: 48, fontWeight: '900', color: Neon.text, letterSpacing: -1, lineHeight: 52 },
  brandAccent: { color: Neon.accent },
  brandSub: { color: Neon.muted, fontSize: 14, marginTop: 6 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: Neon.border, borderRadius: 18, overflow: 'hidden', marginBottom: 16,
  },
  fieldWrap: { padding: 16 },
  fieldLabel: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  fieldInput: { color: Neon.text, fontSize: 16, fontWeight: '600' },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  passRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { padding: 4 },
  eyeText: { fontSize: 16 },
  btn: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.9 },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 8 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1.5 },
  btnArrow: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 26 },
  link: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: Neon.muted, fontSize: 14 },
  linkAccent: { color: Neon.accentSoft, fontWeight: '700' },
});
