import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';
import { rideDetailHref } from '@/lib/rideHref';
import type { Ride } from '@/lib/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d away`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function RideStatusBadge({ status }: { status?: string }) {
  if (status === 'active') {
    return (
      <View style={[badge.wrap, badge.active]}>
        <View style={badge.dot} />
        <Text style={[badge.text, { color: '#4ade80' }]}>LIVE</Text>
      </View>
    );
  }
  if (status === 'completed') {
    return <View style={[badge.wrap, badge.done]}><Text style={[badge.text, { color: Neon.muted }]}>DONE</Text></View>;
  }
  return <View style={[badge.wrap, badge.upcoming]}><Text style={[badge.text, { color: Neon.accentSoft }]}>UPCOMING</Text></View>;
}

const badge = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  active: { borderColor: 'rgba(74,222,128,0.4)', backgroundColor: 'rgba(74,222,128,0.1)' },
  done: { borderColor: 'rgba(113,113,122,0.3)', backgroundColor: 'rgba(113,113,122,0.08)' },
  upcoming: { borderColor: 'rgba(232,33,39,0.3)', backgroundColor: 'rgba(232,33,39,0.08)' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
});

export default function ProfileScreen() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const scale = useSharedValue(1);
  const scaleBtn = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const logoutStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleBtn.value }] }));

  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [driverRides, setDriverRides] = useState<Ride[]>([]);

  useFocusEffect(useCallback(() => {
    if (!user?.accountReady) return;
    setRidesLoading(true);
    Promise.all([
      api.fetchMyPassengerRides().catch(() => [] as Ride[]),
      api.fetchMyRides().catch(() => [] as Ride[]),
    ]).then(([passenger, driver]) => {
      setMyRides(passenger);
      setDriverRides(driver);
    }).finally(() => setRidesLoading(false));
  }, [user?.accountReady]));

  const activeRides = myRides.filter((r) => r.status === 'active');
  const upcomingRides = myRides.filter((r) => r.status === 'scheduled' && new Date(r.when).getTime() > Date.now());
  const pastRides = myRides.filter((r) => r.status === 'completed' || new Date(r.when).getTime() <= Date.now()).slice(0, 5);

  const ratingVal = user?.ratingAvg != null ? `${user.ratingAvg.toFixed(1)} ★` : '—';

  if (loading) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <View style={styles.loadWrap}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '50%' }]} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>PROFILE</Text>
            <View style={styles.sectionLine} />
          </View>
        </View>

        {user ? (
          <>
            {/* VERIFY BANNER */}
            {user.accountReady === false && (
              <Pressable onPress={() => router.push('/verify-account')} style={styles.verifyBanner}>
                <View style={styles.verifyBannerInner}>
                  <Text style={styles.verifyIcon}>⚡</Text>
                  <View style={styles.verifyText}>
                    <Text style={styles.verifyTitle}>Finish Verification</Text>
                    <Text style={styles.verifySub}>Complete email & phone to unlock all features</Text>
                  </View>
                  <Text style={styles.verifyArrow}>›</Text>
                </View>
              </Pressable>
            )}

            {/* AVATAR + NAME HERO */}
            <View style={styles.avatarHero}>
              <View style={styles.avatarRing}>
                {user.avatarUrl
                  ? <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
                  : <View style={styles.avatarPh}><Text style={styles.avatarInitial}>{user.name?.[0] ?? '?'}</Text></View>}
                <View style={[styles.statusDot, user.accountReady ? styles.statusOn : styles.statusOff]} />
              </View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <View style={styles.verifiedRow}>
                <View style={[styles.verifiedChip, user.emailVerified ? styles.verifiedOn : styles.verifiedOff]}>
                  <Text style={styles.verifiedChipText}>{user.emailVerified ? '✓ Email' : '✗ Email'}</Text>
                </View>
                <View style={[styles.verifiedChip, user.phoneVerified ? styles.verifiedOn : styles.verifiedOff]}>
                  <Text style={styles.verifiedChipText}>{user.phoneVerified ? '✓ Phone' : '✗ Phone'}</Text>
                </View>
                <View style={[styles.verifiedChip, user.cnicDocumentUploaded ? styles.verifiedOn : styles.verifiedOff]}>
                  <Text style={styles.verifiedChipText}>{user.cnicDocumentUploaded ? '✓ CNIC' : '✗ CNIC'}</Text>
                </View>
              </View>
            </View>

            {/* STATS ROW */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{ridesLoading ? '—' : myRides.length}</Text>
                <Text style={styles.statLabel}>Rides Taken</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{ridesLoading ? '—' : driverRides.length}</Text>
                <Text style={styles.statLabel}>Rides Offered</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{ratingVal}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>

            {/* ── MY RIDES SECTION ── */}
            {user.accountReady && (
              <View style={styles.ridesSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionLine} />
                  <Text style={styles.sectionTitle}>MY RIDES</Text>
                  <View style={styles.sectionLine} />
                </View>

                {ridesLoading ? (
                  <View style={styles.ridesLoader}>
                    <ActivityIndicator size="small" color={Neon.accent} />
                  </View>
                ) : myRides.length === 0 ? (
                  <View style={styles.ridesEmpty}>
                    <Text style={styles.ridesEmptyIcon}>🚗</Text>
                    <Text style={styles.ridesEmptyText}>No rides yet</Text>
                    <Text style={styles.ridesEmptySub}>Join a ride from the Rides tab to see it here.</Text>
                  </View>
                ) : (
                  <>
                    {/* ACTIVE RIDES — shown first and highlighted */}
                    {activeRides.map((ride) => (
                      <Pressable key={ride.id} onPress={() => router.push(rideDetailHref(ride.id))} style={styles.activeRideCard}>
                        <LinearGradient
                          colors={['rgba(74,222,128,0.12)', 'rgba(74,222,128,0.04)']}
                          style={styles.activeRideGrad}>
                          <View style={styles.rideCardTop}>
                            <View style={styles.rideCardRoute}>
                              <View style={styles.routeDotGreen} />
                              <Text style={styles.rideCardFrom} numberOfLines={1}>{ride.from}</Text>
                              <Text style={styles.rideCardArrow}>›</Text>
                              <View style={styles.routeDotRed} />
                              <Text style={styles.rideCardTo} numberOfLines={1}>{ride.to}</Text>
                            </View>
                            <RideStatusBadge status={ride.status} />
                          </View>
                          <View style={styles.rideCardMeta}>
                            <Text style={styles.rideCardDriver}>🚗 {ride.driver?.name ?? 'Driver'}</Text>
                            <Text style={styles.rideCardWhen}>{formatWhen(ride.when)}</Text>
                          </View>
                          <Text style={styles.rideCardTap}>Tap to track live location →</Text>
                        </LinearGradient>
                      </Pressable>
                    ))}

                    {/* UPCOMING RIDES */}
                    {upcomingRides.map((ride) => {
                      const eta = timeUntil(ride.when);
                      return (
                        <Pressable key={ride.id} onPress={() => router.push(rideDetailHref(ride.id))} style={styles.rideCard}>
                          <View style={styles.rideCardTop}>
                            <View style={styles.rideCardRoute}>
                              <View style={styles.routeDotGreen} />
                              <Text style={styles.rideCardFrom} numberOfLines={1}>{ride.from}</Text>
                              <Text style={styles.rideCardArrow}>›</Text>
                              <View style={styles.routeDotRed} />
                              <Text style={styles.rideCardTo} numberOfLines={1}>{ride.to}</Text>
                            </View>
                            <RideStatusBadge status={ride.status} />
                          </View>
                          <View style={styles.rideCardMeta}>
                            <Text style={styles.rideCardDriver}>🚗 {ride.driver?.name ?? 'Driver'}</Text>
                            <Text style={styles.rideCardWhen}>{eta ? `${eta} · ` : ''}{formatWhen(ride.when)}</Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {/* PAST RIDES */}
                    {pastRides.length > 0 && (
                      <>
                        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                          <View style={styles.sectionLine} />
                          <Text style={styles.sectionTitle}>PAST</Text>
                          <View style={styles.sectionLine} />
                        </View>
                        {pastRides.map((ride) => (
                          <Pressable key={ride.id} onPress={() => router.push(rideDetailHref(ride.id))} style={styles.rideCard}>
                            <View style={styles.rideCardTop}>
                              <View style={styles.rideCardRoute}>
                                <View style={[styles.routeDotGreen, { opacity: 0.4 }]} />
                                <Text style={[styles.rideCardFrom, { opacity: 0.6 }]} numberOfLines={1}>{ride.from}</Text>
                                <Text style={styles.rideCardArrow}>›</Text>
                                <View style={[styles.routeDotRed, { opacity: 0.4 }]} />
                                <Text style={[styles.rideCardTo, { opacity: 0.6 }]} numberOfLines={1}>{ride.to}</Text>
                              </View>
                              <RideStatusBadge status={ride.status} />
                            </View>
                            <View style={styles.rideCardMeta}>
                              <Text style={styles.rideCardDriver}>🚗 {ride.driver?.name ?? 'Driver'}</Text>
                              <Text style={styles.rideCardWhen}>{formatWhen(ride.when)}</Text>
                            </View>
                          </Pressable>
                        ))}
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {/* INFO CARDS */}
            <View style={styles.infoSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionLine} />
                <Text style={styles.sectionTitle}>DETAILS</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.infoCard}>
                {[
                  { icon: '📞', label: 'Phone', value: user.phone ?? '—', action: user.phone ? () => Linking.openURL(`tel:${user.phone!.replace(/[^\d+]/g, '')}`) : undefined },
                  { icon: '✉️', label: 'Email', value: user.email, action: () => Linking.openURL(`mailto:${user.email}`) },
                  { icon: '🪪', label: 'CNIC', value: user.cnic ?? '—', action: undefined },
                ].map((row, i, arr) => (
                  <Pressable
                    key={row.label}
                    onPress={row.action}
                    style={[styles.infoRow, i < arr.length - 1 && styles.infoRowDivider]}>
                    <Text style={styles.infoIcon}>{row.icon}</Text>
                    <View style={styles.infoCol}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoVal} numberOfLines={1}>{row.value}</Text>
                    </View>
                    {row.action && <Text style={styles.infoChevron}>›</Text>}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* QUICK ACTIONS */}
            <View style={styles.actionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionLine} />
                <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.actionsGrid}>
                <Pressable onPress={() => router.push('/(tabs)')} style={styles.actionCard}>
                  <Text style={styles.actionIcon}>🚗</Text>
                  <Text style={styles.actionLabel}>Browse Rides</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/(tabs)/offer')} style={styles.actionCard}>
                  <Text style={styles.actionIcon}>＋</Text>
                  <Text style={styles.actionLabel}>Offer Ride</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/(tabs)/inbox')} style={styles.actionCard}>
                  <Text style={styles.actionIcon}>📬</Text>
                  <Text style={styles.actionLabel}>Inbox</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/verify-account')} style={styles.actionCard}>
                  <Text style={styles.actionIcon}>✅</Text>
                  <Text style={styles.actionLabel}>Verify</Text>
                </Pressable>
              </View>
            </View>

            {/* LOGOUT */}
            <AnimatedPressable
              onPress={() => logout()}
              onPressIn={() => { scaleBtn.value = withSpring(0.96, { damping: 14, stiffness: 400 }); }}
              onPressOut={() => { scaleBtn.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
              style={[styles.logoutBtn, logoutStyle]}>
              <Text style={styles.logoutText}>LOG OUT</Text>
            </AnimatedPressable>

            <Text style={styles.version}>SAMEWAY · v1.0</Text>
          </>
        ) : (
          /* NOT LOGGED IN */
          <View style={styles.guestWrap}>
            <View style={styles.guestHero}>
              <Text style={styles.guestIcon}>👤</Text>
              <Text style={styles.guestTitle}>You're not signed in</Text>
              <Text style={styles.guestSub}>Sign in to offer rides, join carpools, and manage your account.</Text>
            </View>

            <AnimatedPressable
              onPress={() => router.push('/login')}
              onPressIn={() => { scale.value = withSpring(0.96, { damping: 14, stiffness: 400 }); }}
              onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
              style={[styles.primaryWrap, btnStyle]}>
              <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>SIGN IN</Text>
              </LinearGradient>
            </AnimatedPressable>

            <Pressable onPress={() => router.push('/signup')} style={styles.createBtn}>
              <Text style={styles.createBtnText}>Create account →</Text>
            </Pressable>

            <View style={styles.featureList}>
              {['Real-time ride matching', 'Fare negotiation', 'Verified drivers only', 'In-app chat'].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingBottom: 120 },
  loadWrap: { alignItems: 'center', paddingTop: 100, gap: 14 },
  skeletonAvatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)' },
  skeletonLine: { height: 12, width: '65%', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },

  /* SECTION HEADER */
  header: { paddingTop: 64, paddingHorizontal: 22, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, marginBottom: 16 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  /* VERIFY BANNER */
  verifyBanner: { marginHorizontal: 22, marginBottom: 20, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,33,39,0.4)' },
  verifyBannerInner: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, backgroundColor: 'rgba(232,33,39,0.08)' },
  verifyIcon: { fontSize: 22 },
  verifyText: { flex: 1 },
  verifyTitle: { color: Neon.accent, fontWeight: '800', fontSize: 14 },
  verifySub: { color: Neon.muted, fontSize: 12, marginTop: 2 },
  verifyArrow: { color: Neon.accent, fontSize: 22, fontWeight: '700' },

  /* AVATAR HERO */
  avatarHero: { alignItems: 'center', marginBottom: 28, paddingHorizontal: 22 },
  avatarRing: {
    position: 'relative', marginBottom: 14,
    padding: 3, borderRadius: 50,
    borderWidth: 2, borderColor: 'rgba(232,33,39,0.5)',
  },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarPh: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(232,33,39,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: Neon.accent, fontSize: 36, fontWeight: '900' },
  statusDot: {
    position: 'absolute', bottom: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: Neon.bg,
  },
  statusOn: { backgroundColor: '#4ade80' },
  statusOff: { backgroundColor: Neon.muted },
  userName: { color: Neon.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  userEmail: { color: Neon.muted, fontSize: 14, marginTop: 4, marginBottom: 12 },
  verifiedRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  verifiedChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  verifiedOn: { borderColor: 'rgba(74,222,128,0.4)', backgroundColor: 'rgba(74,222,128,0.1)' },
  verifiedOff: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  verifiedChipText: { fontSize: 11, fontWeight: '700', color: Neon.accentSoft },

  /* STATS */
  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 22, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
  },
  statVal: { color: Neon.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: Neon.muted, fontSize: 10, fontWeight: '600', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  /* MY RIDES */
  ridesSection: { marginBottom: 28 },
  ridesLoader: { alignItems: 'center', paddingVertical: 24 },
  ridesEmpty: { alignItems: 'center', paddingVertical: 28, gap: 8, marginHorizontal: 22 },
  ridesEmptyIcon: { fontSize: 36 },
  ridesEmptyText: { color: Neon.text, fontSize: 16, fontWeight: '700' },
  ridesEmptySub: { color: Neon.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  /* ACTIVE RIDE CARD */
  activeRideCard: {
    marginHorizontal: 22, marginBottom: 10,
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.4)',
  },
  activeRideGrad: { padding: 16 },
  rideCardTap: { color: '#4ade80', fontSize: 11, fontWeight: '700', marginTop: 8 },

  /* RIDE CARD (upcoming + past) */
  rideCard: {
    marginHorizontal: 22, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, padding: 14,
  },
  rideCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rideCardRoute: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  routeDotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80', flexShrink: 0 },
  routeDotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Neon.accent, flexShrink: 0 },
  rideCardFrom: { color: Neon.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  rideCardArrow: { color: Neon.muted, fontSize: 13, fontWeight: '700' },
  rideCardTo: { color: Neon.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  rideCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rideCardDriver: { color: Neon.muted, fontSize: 12, fontWeight: '600' },
  rideCardWhen: { color: Neon.muted, fontSize: 11 },

  /* INFO CARD */
  infoSection: { marginBottom: 24 },
  infoCard: {
    marginHorizontal: 22,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 18, overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  infoIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  infoCol: { flex: 1 },
  infoLabel: { color: Neon.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoVal: { color: Neon.text, fontSize: 15, fontWeight: '600' },
  infoChevron: { color: Neon.muted, fontSize: 20 },

  /* QUICK ACTIONS */
  actionsSection: { marginBottom: 28 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 22 },
  actionCard: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, padding: 18, alignItems: 'center', gap: 8,
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { color: Neon.accentSoft, fontSize: 13, fontWeight: '700', textAlign: 'center' },

  /* LOGOUT */
  logoutBtn: {
    marginHorizontal: 22, marginBottom: 10,
    borderWidth: 1.5, borderColor: 'rgba(232,33,39,0.35)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
    backgroundColor: 'rgba(232,33,39,0.08)',
  },
  logoutText: { color: Neon.accent, fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  version: { color: 'rgba(113,113,122,0.4)', fontSize: 11, textAlign: 'center', letterSpacing: 1, marginBottom: 8 },

  /* GUEST */
  guestWrap: { paddingHorizontal: 22 },
  guestHero: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  guestIcon: { fontSize: 56, marginBottom: 8 },
  guestTitle: { color: Neon.text, fontSize: 22, fontWeight: '800' },
  guestSub: { color: Neon.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  primaryWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  primaryBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 16 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  createBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 32 },
  createBtnText: { color: Neon.accentSoft, fontSize: 15, fontWeight: '600' },
  featureList: { gap: 12, marginBottom: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Neon.accent },
  featureText: { color: Neon.muted, fontSize: 14, fontWeight: '500' },
});
