import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function phoneDigitsOk(p: string) { const d = p.replace(/\D/g, ''); return d.length >= 10 && d.length <= 15; }

const STEPS = ['Photos', 'Info', 'Security'];

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | undefined>();
  const [photoType, setPhotoType] = useState<string | undefined>();
  const [cnicUri, setCnicUri] = useState<string | null>(null);
  const [cnicName, setCnicName] = useState<string | undefined>();
  const [cnicType, setCnicType] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const cnicDigits = cnic.replace(/\D/g, '');

  const canSubmit = useMemo(() => (
    name.trim().length >= 2 &&
    EMAIL_RE.test(email.trim()) &&
    password.length >= 8 &&
    cnicDigits.length === 13 &&
    phoneDigitsOk(phone) &&
    photoUri != null &&
    cnicUri != null
  ), [name, email, password, cnic, phone, photoUri, cnicUri]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhotoUri(a.uri); setPhotoName(a.fileName ?? 'profile.jpg'); setPhotoType(a.mimeType ?? 'image/jpeg');
    }
  };

  const pickCnic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setCnicUri(a.uri); setCnicName(a.fileName ?? 'cnic.jpg'); setCnicType(a.mimeType ?? 'image/jpeg');
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Check your details', 'Fill all fields correctly:\n• Name (2+ chars)\n• Valid email\n• Password (8+ chars)\n• CNIC (13 digits)\n• Phone (10-15 digits)\n• Both photos');
      return;
    }
    setBusy(true);
    try {
      const res = await signup({ email: email.trim(), password, name: name.trim(), cnic, phone: phone.trim(), photoUri: photoUri!, photoName, photoType, cnicCardUri: cnicUri!, cnicCardName: cnicName, cnicCardType: cnicType });
      const dev = res.devCodes;
      const msg = dev
        ? `Email code: ${dev.email}\nPhone code: ${dev.phone}\n\n(Dev mode — production sends these by email/SMS.)`
        : 'Check your email and phone for verification codes.';
      Alert.alert('Almost there!', msg, [{ text: 'Continue', onPress: () => router.replace('/verify-account') }]);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      Alert.alert('Sign up failed', raw.trim().length > 0 ? raw : 'Check your connection and try again.');
    } finally { setBusy(false); }
  };

  // Field validation indicators
  const checks = {
    name: name.trim().length >= 2,
    email: EMAIL_RE.test(email.trim()),
    password: password.length >= 8,
    cnic: cnicDigits.length === 13,
    phone: phoneDigitsOk(phone),
    photo: photoUri != null,
    cnicImg: cnicUri != null,
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.headerLabel}>NEW ACCOUNT</Text>
            <Text style={styles.headerTitle}>JOIN <Text style={styles.headerAccent}>SAMEWAY</Text></Text>
            <Text style={styles.headerSub}>Verified, safe rides — complete all steps to unlock the app.</Text>
          </View>

          {/* STEP INDICATOR */}
          <View style={styles.stepRow}>
            {STEPS.map((s, i) => (
              <View key={s} style={styles.stepItem}>
                <View style={[styles.stepCircle, i <= step ? styles.stepCircleOn : styles.stepCircleOff]}>
                  <Text style={[styles.stepNum, i <= step && styles.stepNumOn]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, i <= step && styles.stepLabelOn]}>{s}</Text>
                {i < STEPS.length - 1 && <View style={[styles.stepConnector, i < step && styles.stepConnectorOn]} />}
              </View>
            ))}
          </View>

          {/* SECTION: PHOTOS */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>IDENTITY PHOTOS</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.photosRow}>
            {/* Profile Photo */}
            <Pressable onPress={pickPhoto} style={styles.photoCard}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={styles.photoImg} contentFit="cover" />
                : (
                  <View style={styles.photoEmpty}>
                    <Text style={styles.photoEmptyIcon}>🤳</Text>
                    <Text style={styles.photoEmptyText}>Profile Photo</Text>
                    <Text style={styles.photoEmptyHint}>Tap to upload</Text>
                  </View>
                )}
              <View style={[styles.photoCheckBadge, checks.photo ? styles.photoCheckOn : styles.photoCheckOff]}>
                <Text style={styles.photoCheckText}>{checks.photo ? '✓' : '+'}</Text>
              </View>
            </Pressable>

            {/* CNIC Photo */}
            <Pressable onPress={pickCnic} style={[styles.photoCard, styles.photoCardWide]}>
              {cnicUri
                ? <Image source={{ uri: cnicUri }} style={styles.photoImg} contentFit="cover" />
                : (
                  <View style={styles.photoEmpty}>
                    <Text style={styles.photoEmptyIcon}>🪪</Text>
                    <Text style={styles.photoEmptyText}>CNIC Card</Text>
                    <Text style={styles.photoEmptyHint}>Both sides visible</Text>
                  </View>
                )}
              <View style={[styles.photoCheckBadge, checks.cnicImg ? styles.photoCheckOn : styles.photoCheckOff]}>
                <Text style={styles.photoCheckText}>{checks.cnicImg ? '✓' : '+'}</Text>
              </View>
            </Pressable>
          </View>

          {/* SECTION: PERSONAL INFO */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.formCard}>
            {[
              { label: 'FULL NAME', value: name, setter: setName, placeholder: 'Your full name', key: 'name', check: checks.name, keyboard: 'default' as const, cap: 'words' as const },
              { label: 'EMAIL ADDRESS', value: email, setter: setEmail, placeholder: 'you@example.com', key: 'email', check: checks.email, keyboard: 'email-address' as const, cap: 'none' as const },
              { label: 'CNIC NUMBER', value: cnic, setter: setCnic, placeholder: '13-digit CNIC', key: 'cnic', check: checks.cnic, keyboard: 'number-pad' as const, cap: 'none' as const },
              { label: 'MOBILE NUMBER', value: phone, setter: setPhone, placeholder: '03xx-xxxxxxx', key: 'phone', check: checks.phone, keyboard: 'phone-pad' as const, cap: 'none' as const },
            ].map((f, i, arr) => (
              <View key={f.key} style={[styles.fieldRow, i < arr.length - 1 && styles.fieldRowDivider]}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  {f.value.length > 0 && (
                    <View style={[styles.fieldCheck, f.check ? styles.fieldCheckOn : styles.fieldCheckOff]}>
                      <Text style={styles.fieldCheckText}>{f.check ? '✓' : '✗'}</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  value={f.value}
                  onChangeText={f.setter}
                  placeholder={f.placeholder}
                  placeholderTextColor={Neon.muted}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.cap}
                  style={styles.fieldInput}
                />
              </View>
            ))}
          </View>

          {/* SECTION: SECURITY */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>SECURITY</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.formCard}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                {password.length > 0 && (
                  <View style={[styles.fieldCheck, checks.password ? styles.fieldCheckOn : styles.fieldCheckOff]}>
                    <Text style={styles.fieldCheckText}>{checks.password ? '✓' : '✗'}</Text>
                  </View>
                )}
              </View>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  placeholder="8+ characters"
                  placeholderTextColor={Neon.muted}
                  style={[styles.fieldInput, styles.passwordInput]}
                />
                <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  {[1, 2, 3, 4].map((lvl) => {
                    const filled = (password.length >= 8 ? 4 : password.length >= 6 ? 3 : password.length >= 4 ? 2 : 1) >= lvl;
                    return <View key={lvl} style={[styles.strengthBar, filled ? styles.strengthFilled : styles.strengthEmpty]} />;
                  })}
                  <Text style={styles.strengthLabel}>{password.length >= 8 ? 'Strong' : password.length >= 6 ? 'OK' : password.length >= 4 ? 'Weak' : 'Too short'}</Text>
                </View>
              )}
            </View>
          </View>

          {/* CHECKLIST */}
          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>REQUIREMENTS</Text>
            {[
              { label: 'Profile photo uploaded', ok: checks.photo },
              { label: 'CNIC card photo uploaded', ok: checks.cnicImg },
              { label: 'Full name (2+ characters)', ok: checks.name },
              { label: 'Valid email address', ok: checks.email },
              { label: '13-digit CNIC number', ok: checks.cnic },
              { label: 'Phone number (10-15 digits)', ok: checks.phone },
              { label: 'Password (8+ characters)', ok: checks.password },
            ].map((c) => (
              <View key={c.label} style={styles.checkItem}>
                <Text style={[styles.checkDot, c.ok ? styles.checkDotOn : styles.checkDotOff]}>{c.ok ? '✓' : '○'}</Text>
                <Text style={[styles.checkText, c.ok && styles.checkTextOn]}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* SUBMIT */}
          <Pressable
            onPress={onSubmit}
            disabled={busy || !canSubmit}
            style={({ pressed }) => [styles.submitBtn, (!canSubmit || busy) && styles.submitBtnDisabled, pressed && canSubmit && !busy && styles.submitBtnPressed]}>
            <LinearGradient
              colors={canSubmit && !busy ? [Neon.accent, '#c01920'] : ['#3f3f46', '#27272a']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.submitGrad}>
              <Text style={styles.submitText}>{busy ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}</Text>
              {!busy && canSubmit && <Text style={styles.submitArrow}>›</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={() => router.replace('/login')} style={styles.signInLink}>
            <Text style={styles.signInLinkText}>Already have an account? <Text style={styles.signInLinkAccent}>Sign in →</Text></Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingBottom: 60 },

  /* HEADER */
  header: { paddingTop: 64, paddingHorizontal: 22, paddingBottom: 20 },
  headerLabel: { color: Neon.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 38, fontWeight: '900', color: Neon.text, letterSpacing: -1, lineHeight: 42, marginBottom: 8 },
  headerAccent: { color: Neon.accent },
  headerSub: { color: Neon.muted, fontSize: 14, lineHeight: 20 },

  /* STEPS */
  stepRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 22, marginBottom: 24 },
  stepItem: { flex: 1, alignItems: 'center', flexDirection: 'row', position: 'relative' },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  stepCircleOn: { borderColor: Neon.accent, backgroundColor: 'rgba(232,33,39,0.15)' },
  stepCircleOff: { borderColor: Neon.border, backgroundColor: 'transparent' },
  stepNum: { fontSize: 13, fontWeight: '800', color: Neon.muted },
  stepNumOn: { color: Neon.accent },
  stepLabel: { color: Neon.muted, fontSize: 10, fontWeight: '700', marginLeft: 6, letterSpacing: 0.5 },
  stepLabelOn: { color: Neon.accentSoft },
  stepConnector: { flex: 1, height: 1, backgroundColor: Neon.border, marginLeft: 6 },
  stepConnectorOn: { backgroundColor: Neon.accent },

  /* SECTION */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, marginBottom: 12, marginTop: 4 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  /* PHOTOS */
  photosRow: { flexDirection: 'row', gap: 10, marginHorizontal: 22, marginBottom: 20 },
  photoCard: {
    flex: 1, height: 130, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    position: 'relative',
  },
  photoCardWide: { flex: 1.6 },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoEmptyIcon: { fontSize: 26 },
  photoEmptyText: { color: Neon.accentSoft, fontSize: 12, fontWeight: '700' },
  photoEmptyHint: { color: Neon.muted, fontSize: 10 },
  photoCheckBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  photoCheckOn: { backgroundColor: 'rgba(74,222,128,0.2)', borderColor: '#4ade80' },
  photoCheckOff: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' },
  photoCheckText: { color: Neon.text, fontSize: 10, fontWeight: '900' },

  /* FORM CARD */
  formCard: {
    marginHorizontal: 22, marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 18, overflow: 'hidden',
  },
  fieldRow: { padding: 14 },
  fieldRowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  fieldCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  fieldCheckOn: { backgroundColor: 'rgba(74,222,128,0.15)', borderColor: '#4ade80' },
  fieldCheckOff: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: '#ef4444' },
  fieldCheckText: { fontSize: 9, fontWeight: '900', color: Neon.text },
  fieldInput: { color: Neon.text, fontSize: 16, fontWeight: '600', paddingVertical: 2 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { padding: 4 },
  eyeText: { fontSize: 16 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthFilled: { backgroundColor: Neon.accent },
  strengthEmpty: { backgroundColor: 'rgba(255,255,255,0.1)' },
  strengthLabel: { color: Neon.muted, fontSize: 10, fontWeight: '600', marginLeft: 4 },

  /* CHECKLIST */
  checklistCard: {
    marginHorizontal: 22, marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 18, padding: 16,
  },
  checklistTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  checkDot: { fontSize: 13, fontWeight: '800', width: 18, textAlign: 'center' },
  checkDotOn: { color: '#4ade80' },
  checkDotOff: { color: 'rgba(255,255,255,0.2)' },
  checkText: { color: Neon.muted, fontSize: 13 },
  checkTextOn: { color: Neon.accentSoft },

  /* SUBMIT */
  submitBtn: { marginHorizontal: 22, borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnPressed: { opacity: 0.9 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 8 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
  submitArrow: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 26 },

  signInLink: { alignItems: 'center', paddingVertical: 8 },
  signInLinkText: { color: Neon.muted, fontSize: 14 },
  signInLinkAccent: { color: Neon.accentSoft, fontWeight: '700' },
});
