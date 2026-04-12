import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Neon } from '@/constants/theme';
import type { Ride } from '@/lib/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  ride: Ride;
  currentUserId: string | null;
  onJoin: () => void;
  onOpenDetail: () => void;
};

export function RideCard({ ride, currentUserId, onJoin, onOpenDetail }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const taken = ride.passengerIds.length;
  const full = taken >= ride.seatCount;
  const isDriver = currentUserId != null && ride.driver?.id === currentUserId;
  const already = currentUserId != null && ride.passengerIds.includes(currentUserId);
  const canJoin = currentUserId != null && !isDriver && !already && !full;

  const CardShell = Platform.OS === 'web' ? View : BlurView;
  const blurProps =
    Platform.OS === 'web' ? {} : { intensity: 40, tint: 'dark' as const };

  return (
    <Animated.View style={[styles.outer, animatedStyle]}>
      <LinearGradient
        colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}>
        <CardShell {...blurProps} style={styles.glass}>
          <Pressable
            onPress={onOpenDetail}
            onPressIn={() => {
              scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 12, stiffness: 200 });
            }}
            style={styles.inner}>
            <View style={styles.rowTop}>
              {ride.driver?.avatarUrl ? (
                <Image source={{ uri: ride.driver.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.route} numberOfLines={2}>
                  {ride.from} → {ride.to}
                </Text>
                <Text style={styles.meta}>{formatWhen(ride.when)}</Text>
              </View>
            </View>
            <Text style={styles.driver}>Driver: {ride.driver?.name ?? 'Unknown'}</Text>
            {ride.distanceKm != null ? (
              <Text style={styles.distance}>~{ride.distanceKm} km from you</Text>
            ) : null}
            <Text style={styles.seats}>
              Seats {taken}/{ride.seatCount} filled
            </Text>
            <Text style={styles.tapHint}>Tap card for details & contact</Text>
          </Pressable>
          {canJoin ? (
            <AnimatedPressable onPress={onJoin} style={styles.joinRow}>
              <Text style={styles.joinText}>Request seat (fare)</Text>
            </AnimatedPressable>
          ) : null}
          {!currentUserId ? <Text style={styles.hint}>Sign in to join</Text> : null}
          {isDriver ? <Text style={styles.hint}>Your ride</Text> : null}
          {already && !isDriver ? <Text style={styles.hintJoined}>You’re in</Text> : null}
          {full && !already && !isDriver ? <Text style={styles.hint}>Full</Text> : null}
        </CardShell>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  gradientBorder: {
    borderRadius: 20,
    padding: 1.5,
  },
  glass: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'web' ? 'rgba(20, 10, 40, 0.75)' : 'rgba(12, 6, 24, 0.55)',
  },
  inner: {
    padding: 18,
    paddingBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  rowText: {
    flex: 1,
  },
  route: {
    color: Neon.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  meta: {
    color: Neon.muted,
    fontSize: 13,
  },
  driver: {
    color: Neon.accentSoft,
    fontSize: 14,
    marginBottom: 2,
  },
  distance: {
    color: Neon.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  seats: {
    color: Neon.muted,
    fontSize: 13,
    marginTop: 6,
  },
  tapHint: {
    marginTop: 8,
    color: Neon.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  joinRow: {
    marginHorizontal: 18,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    borderWidth: 1,
    borderColor: Neon.border,
    alignItems: 'center',
  },
  joinText: {
    color: Neon.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  hint: {
    marginHorizontal: 18,
    marginBottom: 12,
    color: Neon.muted,
    fontSize: 13,
  },
  hintJoined: {
    marginHorizontal: 18,
    marginBottom: 12,
    color: Neon.accentSoft,
    fontSize: 13,
    fontWeight: '600',
  },
});
