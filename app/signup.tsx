import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function phoneDigitsOk(phone: string): boolean {
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15;
}

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | undefined>();
  const [photoType, setPhotoType] = useState<string | undefined>();
  const [cnicUri, setCnicUri] = useState<string | null>(null);
  const [cnicName, setCnicName] = useState<string | undefined>();
  const [cnicType, setCnicType] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    const digits = cnic.replace(/\D/g, '');
    return (
      name.trim().length >= 2 &&
      EMAIL_RE.test(email.trim()) &&
      password.length >= 8 &&
      digits.length === 13 &&
      phoneDigitsOk(phone) &&
      photoUri != null &&
      cnicUri != null
    );
  }, [name, email, password, cnic, phone, photoUri, cnicUri]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Allow photo library access to add your profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setPhotoUri(a.uri);
      setPhotoName(a.fileName ?? 'profile.jpg');
      setPhotoType(a.mimeType ?? 'image/jpeg');
    }
  };

  const pickCnic = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Allow photo library access to upload your CNIC card.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      setCnicUri(a.uri);
      setCnicName(a.fileName ?? 'cnic.jpg');
      setCnicType(a.mimeType ?? 'image/jpeg');
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert(
        'Check your details',
        'Use a real email format, a phone number with 10–15 digits, 13-digit CNIC, password (8+ characters), profile photo, and CNIC card photo.',
      );
      return;
    }
    setBusy(true);
    try {
      const res = await signup({
        email: email.trim(),
        password,
        name: name.trim(),
        cnic,
        phone: phone.trim(),
        photoUri: photoUri!,
        photoName,
        photoType,
        cnicCardUri: cnicUri!,
        cnicCardName: cnicName,
        cnicCardType: cnicType,
      });
      const dev = res.devCodes;
      const msg = dev
        ? `Email code: ${dev.email}\nPhone code: ${dev.phone}\n\n(In production these would be sent by email/SMS.)`
        : 'Enter the codes sent to your email and phone (non-production servers also log them to the console).';
      Alert.alert('Verify next', msg, [
        {
          text: 'Continue',
          onPress: () => router.replace('/verify-account'),
        },
      ]);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg =
        raw.trim().length > 0
          ? raw
          : 'Unknown error. Ensure the SameWay server is running and EXPO_PUBLIC_API_URL uses your PC’s LAN IP (not localhost) when testing on a phone.';
      Alert.alert('Sign up failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.sub}>
            Enter a valid email, phone (10–15 digits), and 13-digit CNIC. Add your profile photo and a legible CNIC
            card image. Password must be at least 8 characters. Create account stays disabled until everything is
            valid — then you verify email and phone codes.
          </Text>

          <Text style={styles.label}>Profile photo</Text>
          <Pressable style={styles.photoBox} onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <Text style={styles.photoPlaceholder}>Tap to add your face photo</Text>
            )}
          </Pressable>

          <Text style={styles.label}>CNIC card (photo of card)</Text>
          <Pressable style={styles.photoBoxWide} onPress={pickCnic}>
            {cnicUri ? (
              <Image source={{ uri: cnicUri }} style={styles.photoWide} />
            ) : (
              <Text style={styles.photoPlaceholder}>Tap to photograph CNIC card (legible)</Text>
            )}
          </Pressable>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={Neon.muted}
            style={styles.input}
          />
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
          <TextInput
            value={cnic}
            onChangeText={setCnic}
            keyboardType="number-pad"
            placeholder="CNIC (13 digits)"
            placeholderTextColor={Neon.muted}
            style={styles.input}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Mobile number"
            placeholderTextColor={Neon.muted}
            style={styles.input}
          />

          <Pressable
            onPress={onSubmit}
            disabled={busy || !canSubmit}
            style={({ pressed }) => [
              styles.btn,
              (!canSubmit || busy) && styles.btnDisabled,
              pressed && canSubmit && !busy && styles.btnPressed,
            ]}>
            <Text style={styles.btnText}>{busy ? 'Creating…' : 'Sign up'}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Neon.text,
    marginBottom: 10,
  },
  sub: {
    color: Neon.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    color: Neon.accentSoft,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  photoBox: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Neon.border,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  photoBoxWide: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Neon.border,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  photo: { width: '100%', height: '100%' },
  photoWide: { width: '100%', height: '100%' },
  photoPlaceholder: { color: Neon.muted, textAlign: 'center', padding: 8, fontSize: 13 },
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
  btnDisabled: { opacity: 0.35 },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  btnText: {
    color: Neon.onAccent,
    fontWeight: '800',
    fontSize: 17,
  },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: Neon.accentBlue, fontSize: 16, fontWeight: '600' },
});
