import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Neon } from '@/constants/theme';
import type { Ride } from '@/lib/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Departed';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d away`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Props = {
  ride: Ride;
  currentUserId: string | null;
  onJoin: () => void;
  onOpenDetail: () => void;
  onViewDriverProfile?: () => void;
};

export function RideCard({ ride, currentUserId, onJoin, onOpenDetail, onViewDriverProfile }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const taken = ride.passengerIds.length;
  const full = taken >= ride.seatCount;
  const isDriver = currentUserId != null && ride.driver?.id === currentUserId;
  const already = currentUserId != null && ride.passengerIds.includes(currentUserId);
  const canJoin = currentUserId != null && !isDriver && !already && !full;
  const fillPct = Math.round((taken / ride.seatCount) * 100);

  const CardShell = Platform.OS === 'web' ? View : BlurView;
  const blurProps = Platform.OS === 'web' ? {} : { intensity: 30, tint: 'dark' as const };

  return (
    <Animated.View style={[styles.outer, animatedStyle]}>
      <View style={[styles.accentBar, full ? styles.accentBarFull : already ? styles.accentBarOn : styles.accentBarDefault]} />
      <CardShell {...blurProps} style={styles.glass}>
        <AnimatedPressable
          onPress={onOpenDetail}
          onPressIn={() => { scale.value = withSpring(0.975, { damping: 15, stiffness: 400 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
          style={styles.inner}>

          {/* TOP ROW */}
          <View style={styles.topRow}>
            <Pressable onPress={onViewDriverProfile} style={styles.avatarWrap} hitSlop={6}>
              {ride.driver?.avatarUrl
                ? <Image source={{ uri: ride.driver.avatarUrl }} style={styles.avatar} />
                : <View style={styles.avatarPh}><Text style={styles.avatarInitial}>{ride.driver?.name?.[0] ?? '?'}</Text></View>}
              <View style={styles.onlineDot} />
            </Pressable>
            <View style={styles.routeCol}>
              <Text style={styles.route} numberOfLines={1}>{ride.from}</Text>
              <View style={styles.arrowRow}>
                <View style={styles.dashLine} />
                <Text style={styles.arrowIcon}>›</Text>
                <View style={styles.dashLine} />
              </View>
              <Text style={styles.route} numberOfLines={1}>{ride.to}</Text>
            </View>
            <View style={styles.timerCol}>
              <Text style={styles.timerLabel}>DEPARTS</Text>
              <Text style={styles.timerVal}>{timeUntil(ride.when)}</Text>
            </View>
          </View>

          {/* META ROW */}
          <View style={styles.metaRow}>
            <Pressable onPress={onViewDriverProfile} style={styles.metaChip}>
              <Text style={styles.metaChipText}>👤 {ride.driver?.name ?? 'Unknown'}</Text>
            </Pressable>
            {ride.driver?.ratingAvg != null && (
              <Pressable onPress={onViewDriverProfile} style={[styles.metaChip, styles.metaChipStar]}>
                <Text style={styles.metaChipStarText}>★ {ride.driver.ratingAvg.toFixed(1)}</Text>
              </Pressable>
            )}
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>🗓 {formatWhen(ride.when)}</Text>
            </View>
            {ride.distanceKm != null && (
              <View style={[styles.metaChip, styles.metaChipAccent]}>
                <Text style={[styles.metaChipText, styles.metaChipTextAccent]}>📍 {ride.distanceKm} km</Text>
              </View>
            )}
          </View>

          {/* SEAT BAR */}
          <View style={styles.seatSection}>
            <View style={styles.seatLabelRow}>
              <Text style={styles.seatLabel}>SEATS</Text>
              <Text style={styles.seatCount}>{taken} / {ride.seatCount}</Text>
            </View>
            <View style={styles.seatTrack}>
              <LinearGradient
                colors={full ? ['#ef4444', '#dc2626'] : [Neon.accent, '#ff6b6b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.seatFill, { width: `${fillPct}%` as any }]}
              />
            </View>
            <View style={styles.seatDots}>
              {Array.from({ length: ride.seatCount }).map((_, i) => (
                <View key={i} style={[styles.dot, i < taken ? styles.dotFilled : styles.dotEmpty]} />
              ))}
            </View>
          </View>

          {/* STATUS BADGE */}
          {isDriver && <View style={[styles.badge, styles.badgeDriver]}><Text style={styles.badgeText}>YOUR RIDE</Text></View>}
          {already && !isDriver && <View style={[styles.badge, styles.badgeJoined]}><Text style={styles.badgeText}>YOU'RE IN ✓</Text></View>}
          {full && !already && !isDriver && <View style={[styles.badge, styles.badgeFull]}><Text style={styles.badgeText}>FULL</Text></View>}
          {!currentUserId && <Text style={styles.signInHint}>Sign in to join →</Text>}
        </AnimatedPressable>

        {/* JOIN BUTTON */}
        {canJoin && (
          <Pressable onPress={onJoin} style={({ pressed }) => [styles.joinBtn, pressed && styles.joinBtnPressed]}>
            <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.joinGrad}>
              <Text style={styles.joinText}>REQUEST SEAT</Text>
              <Text style={styles.joinArrow}>›</Text>
            </LinearGradient>
          </Pressable>
        )}
      </CardShell>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 14,
    marginHorizontal: 22,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
  },
  accentBar: { width: 3, borderRadius: 3 },
  accentBarDefault: { backgroundColor: Neon.accent },
  accentBarOn: { backgroundColor: '#4ade80' },
  accentBarFull: { backgroundColor: Neon.muted },
  glass: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? 'rgba(20,14,28,0.85)' : 'rgba(18,10,26,0.6)',
  },
  inner: { padding: 16, paddingBottom: 10 },

  /* TOP ROW */
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: 'rgba(232,33,39,0.5)' },
  avatarPh: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(232,33,39,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(232,33,39,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: Neon.accent, fontWeight: '800', fontSize: 18 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#4ade80',
    borderWidth: 1.5, borderColor: '#0d0d0f',
  },
  routeCol: { flex: 1 },
  route: { color: Neon.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 3 },
  dashLine: { flex: 1, height: 1, backgroundColor: 'rgba(232,33,39,0.3)' },
  arrowIcon: { color: Neon.accent, fontSize: 16, fontWeight: '900' },
  timerCol: { alignItems: 'center', minWidth: 56 },
  timerLabel: { color: Neon.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  timerVal: { color: Neon.accent, fontSize: 15, fontWeight: '900', marginTop: 2 },

  /* META */
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  metaChip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  metaChipAccent: { borderColor: 'rgba(232,33,39,0.3)', backgroundColor: 'rgba(232,33,39,0.08)' },
  metaChipStar: { borderColor: 'rgba(250,204,21,0.35)', backgroundColor: 'rgba(250,204,21,0.08)' },
  metaChipText: { color: Neon.muted, fontSize: 11, fontWeight: '600' },
  metaChipTextAccent: { color: Neon.accent },
  metaChipStarText: { color: '#facc15', fontSize: 11, fontWeight: '700' },

  /* SEAT BAR */
  seatSection: { marginBottom: 10 },
  seatLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  seatLabel: { color: Neon.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  seatCount: { color: Neon.accentSoft, fontSize: 11, fontWeight: '700' },
  seatTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  seatFill: { height: '100%', borderRadius: 4 },
  seatDots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotFilled: { backgroundColor: Neon.accent },
  dotEmpty: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },

  /* BADGE */
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4, marginBottom: 4 },
  badgeDriver: { backgroundColor: 'rgba(161,161,170,0.15)', borderWidth: 1, borderColor: 'rgba(161,161,170,0.25)' },
  badgeJoined: { backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  badgeFull: { backgroundColor: 'rgba(113,113,122,0.12)', borderWidth: 1, borderColor: 'rgba(113,113,122,0.25)' },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: Neon.accentSoft },
  signInHint: { color: Neon.muted, fontSize: 12, marginTop: 4, marginBottom: 4 },

  /* JOIN */
  joinBtn: { marginHorizontal: 16, marginBottom: 14, borderRadius: 12, overflow: 'hidden' },
  joinBtnPressed: { opacity: 0.88 },
  joinGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  joinText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1.2 },
  joinArrow: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
});
