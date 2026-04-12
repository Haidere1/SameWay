import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ProfileScreen() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (loading) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <Text style={styles.center}>Loading…</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        {user ? (
          <>
            {user.accountReady === false ? (
              <Pressable onPress={() => router.push('/verify-account')} style={styles.verifyBanner}>
                <Text style={styles.verifyBannerText}>
                  Finish email & phone verification to join or offer rides →
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.card}>
              {user.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]} />
              )}
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.email}>{user.email}</Text>
              <Text style={styles.meta}>Phone: {user.phone ?? '—'}</Text>
              <Text style={styles.meta}>CNIC: {user.cnic ?? '—'}</Text>
              <Pressable
                style={styles.linkRow}
                onPress={() => Linking.openURL(`mailto:${user.email}`)}>
                <Text style={styles.linkSmall}>Email me</Text>
              </Pressable>
              <Pressable
                style={styles.linkRow}
                onPress={() =>
                  user.phone
                    ? Linking.openURL(`tel:${user.phone.replace(/[^\d+]/g, '')}`)
                    : undefined
                }>
                <Text style={styles.linkSmall}>Call my number</Text>
              </Pressable>
            </View>
            <AnimatedPressable
              onPress={() => logout()}
              onPressIn={() => {
                scale.value = withSpring(0.96, { damping: 14, stiffness: 400 });
              }}
              onPressOut={() => {
                scale.value = withSpring(1, { damping: 12, stiffness: 200 });
              }}
              style={[styles.outlineBtn, btnStyle]}>
              <Text style={styles.outlineText}>Log out</Text>
            </AnimatedPressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>Sign in to offer rides and join carpools.</Text>
            <AnimatedPressable
              onPress={() => router.push('/login')}
              onPressIn={() => {
                scale.value = withSpring(0.96, { damping: 14, stiffness: 400 });
              }}
              onPressOut={() => {
                scale.value = withSpring(1, { damping: 12, stiffness: 200 });
              }}
              style={[styles.primaryWrap, btnStyle]}>
              <LinearGradient
                colors={[Neon.accent, Neon.accentBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Sign in</Text>
              </LinearGradient>
            </AnimatedPressable>
            <Pressable onPress={() => router.push('/signup')} style={styles.linkBtn}>
              <Text style={styles.linkText}>Create account</Text>
            </Pressable>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
  },
  center: {
    color: Neon.muted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: 16,
  },
  verifyBanner: {
    borderWidth: 1,
    borderColor: Neon.accent,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  verifyBannerText: {
    color: Neon.accent,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Neon.text,
    marginBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
  },
  name: {
    color: Neon.text,
    fontSize: 20,
    fontWeight: '700',
  },
  email: {
    color: Neon.muted,
    marginTop: 6,
    fontSize: 15,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 18,
    marginBottom: 14,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Neon.border,
  },
  avatarPh: {
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  meta: {
    color: Neon.muted,
    fontSize: 14,
    marginTop: 8,
  },
  linkRow: { marginTop: 10 },
  linkSmall: { color: Neon.accentBlue, fontSize: 15, fontWeight: '600' },
  hint: {
    color: Neon.muted,
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  primaryWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  primaryBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 16,
  },
  primaryText: {
    color: Neon.onAccent,
    fontWeight: '800',
    fontSize: 17,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: Neon.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  outlineText: {
    color: Neon.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  linkBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkText: {
    color: Neon.accentBlue,
    fontSize: 16,
    fontWeight: '600',
  },
});
