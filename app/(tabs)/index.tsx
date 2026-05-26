import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { DriverProfileModal } from '@/components/DriverProfileModal';
import { RideCard } from '@/components/RideCard';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';
import { rideDetailHref } from '@/lib/rideHref';
import type { Ride } from '@/lib/types';

const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';
const FILTERS = ['All', 'Today', 'Near Me', 'Available'] as const;
type Filter = (typeof FILTERS)[number];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const TESTIMONIALS = [
  { name: 'Aisha K.', text: 'Saved me 40% on my daily commute. The fare negotiation is genius!', stars: 5 },
  { name: 'Bilal M.', text: 'Super easy to offer rides. Got 3 passengers my first week.', stars: 5 },
  { name: 'Sara T.', text: 'Feels safe — every driver is CNIC-verified. Love it.', stars: 5 },
];

const FEATURES = [
  { icon: '🔒', title: 'CNIC Verified', desc: 'Every user is identity-verified before joining.' },
  { icon: '💬', title: 'Fare Negotiation', desc: 'Agree on a price that works for both sides.' },
  { icon: '📍', title: 'Live Map', desc: 'See rides near you in real-time.' },
  { icon: '💸', title: 'Split the Cost', desc: 'Carpooling saves 40-70% vs solo travel.' },
];

export default function RidesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [profileDriver, setProfileDriver] = useState<{ id: string; name: string; avatarUrl: string | null; ratingAvg?: number | null; ratingCount?: number } | null>(null);

  const load = useCallback(async (coords: { lat: number; lng: number } | null) => {
    const data = coords ? await api.fetchRides(coords.lat, coords.lng) : await api.fetchRides();
    setRides(data);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let coords: { lat: number; lng: number } | null = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setLocNote('Location off');
      } else {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (alive) setLoc(coords);
        } catch { if (alive) setLocNote('GPS unavailable'); }
      }
      try { await load(coords); }
      catch (e) { if (alive) Alert.alert('Error', e instanceof Error ? e.message : 'Could not load rides'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      let coords = loc;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLoc(coords);
      }
      await load(coords);
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Could not load rides'); }
    finally { setRefreshing(false); }
  }, [load, loc]);

  const mapRegion = useMemo(() => {
    if (loc) return { latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    const first = rides.find((r) => r.fromLat != null && r.fromLng != null);
    if (first?.fromLat != null && first?.fromLng != null)
      return { latitude: first.fromLat, longitude: first.fromLng, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    return { latitude: 24.86, longitude: 67.0, latitudeDelta: 0.3, longitudeDelta: 0.3 };
  }, [loc, rides]);

  const filteredRides = useMemo(() => {
    if (activeFilter === 'All') return rides;
    if (activeFilter === 'Today') { const t = new Date().toDateString(); return rides.filter((r) => new Date(r.when).toDateString() === t); }
    if (activeFilter === 'Available') return rides.filter((r) => r.passengerIds.length < r.seatCount);
    return rides;
  }, [rides, activeFilter, loc]);

  const totalSeats = rides.reduce((s, r) => s + (r.seatCount - r.passengerIds.length), 0);
  const todayCount = rides.filter((r) => new Date(r.when).toDateString() === new Date().toDateString()).length;

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <DriverProfileModal
        driverId={profileDriver?.id ?? null}
        driverName={profileDriver?.name ?? ''}
        driverAvatarUrl={profileDriver?.avatarUrl ?? null}
        ratingAvg={profileDriver?.ratingAvg}
        ratingCount={profileDriver?.ratingCount}
        onClose={() => setProfileDriver(null)}
      />
      <AnimatedBackground />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Neon.accent} />}
        showsVerticalScrollIndicator={false}>

        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroPill}>
            <View style={[styles.pillDot, loc ? styles.pillDotOn : styles.pillDotOff]} />
            <Text style={styles.pillText}>{loc ? 'Location active' : locNote ?? 'Locating…'}</Text>
          </View>
          <Text style={styles.heroGreet}>{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</Text>
          <Text style={styles.heroTitle}>SAME<Text style={styles.heroAccent}>WAY</Text></Text>
          <Text style={styles.heroSub}>Share the road. Split the cost.</Text>
        </View>

        {/* STATS ROW */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{rides.length}</Text>
            <Text style={styles.statLabel}>Rides</Text>
          </View>
          <View style={[styles.statCard, styles.statCardAccent]}>
            <Text style={[styles.statNum, styles.statNumAccent]}>{totalSeats}</Text>
            <Text style={styles.statLabel}>Open Seats</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{todayCount}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>★ 5.0</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* MAP */}
        {!loading && (
          <View style={styles.mapSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>LIVE MAP</Text>
              <View style={styles.sectionLine} />
            </View>
            {IS_MAP ? (
              <View style={styles.mapWrap}>
                <MapView
                  style={styles.map}
                  initialRegion={mapRegion}
                  region={mapRegion}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  showsUserLocation={!!loc}>
                  {rides.filter((r) => r.fromLat != null && r.fromLng != null).map((r) => (
                    <Marker
                      key={r.id}
                      coordinate={{ latitude: r.fromLat!, longitude: r.fromLng! }}
                      title={r.from} description={`→ ${r.to}`}
                      onCalloutPress={() => router.push(rideDetailHref(r.id))}
                      pinColor={Neon.accent}
                    />
                  ))}
                </MapView>
                <View style={styles.mapBadge}>
                  <Text style={styles.mapBadgeText}>{rides.length} rides plotted</Text>
                </View>
              </View>
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackIcon}>🗺</Text>
                <Text style={styles.mapFallbackText}>Map on iOS & Android</Text>
              </View>
            )}
          </View>
        )}

        {/* FILTERS */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={styles.filtersScroll}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setActiveFilter(f)} style={[styles.chip, activeFilter === f && styles.chipOn]}>
              <Text style={[styles.chipText, activeFilter === f && styles.chipTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* RIDES */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionTitle}>UPCOMING RIDES</Text>
          <View style={styles.sectionLine} />
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={Neon.accent} />
            <Text style={styles.loaderText}>Finding rides near you…</Text>
          </View>
        ) : filteredRides.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🚗</Text>
            <Text style={styles.emptyTitle}>No rides found</Text>
            <Text style={styles.emptySub}>{activeFilter !== 'All' ? 'Try a different filter.' : 'Be the first — offer a ride from the Offer tab.'}</Text>
          </View>
        ) : (
          filteredRides.map((ride) => (
            <RideCard
              key={ride.id} ride={ride}
              currentUserId={user?.id ?? null}
              onJoin={() => router.push(rideDetailHref(ride.id, { join: true }))}
              onOpenDetail={() => router.push(rideDetailHref(ride.id))}
              onViewDriverProfile={ride.driver ? () => setProfileDriver({
                id: ride.driver!.id,
                name: ride.driver!.name,
                avatarUrl: ride.driver!.avatarUrl,
                ratingAvg: ride.driver!.ratingAvg,
                ratingCount: ride.driver!.ratingCount,
              }) : undefined}
            />
          ))
        )}

        {/* FEATURES SECTION */}
        {!loading && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>WHY SAMEWAY</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.featuresGrid}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.featureCard}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* TESTIMONIALS */}
        {!loading && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>COMMUNITY</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.testimonialsWrap}>
              {/* RATING HERO */}
              <View style={styles.ratingHero}>
                <Text style={styles.ratingBig}>5.0</Text>
                <Text style={styles.ratingStars}>★★★★★</Text>
                <Text style={styles.ratingLabel}>Average driver rating</Text>
                <View style={styles.ratingStats}>
                  <View style={styles.ratingStat}>
                    <Text style={styles.ratingStatNum}>100%</Text>
                    <Text style={styles.ratingStatLabel}>Verified users</Text>
                  </View>
                  <View style={styles.ratingStatDivider} />
                  <View style={styles.ratingStat}>
                    <Text style={styles.ratingStatNum}>4.9x</Text>
                    <Text style={styles.ratingStatLabel}>Cheaper avg.</Text>
                  </View>
                  <View style={styles.ratingStatDivider} />
                  <View style={styles.ratingStat}>
                    <Text style={styles.ratingStatNum}>∞</Text>
                    <Text style={styles.ratingStatLabel}>Routes covered</Text>
                  </View>
                </View>
              </View>
              {/* TESTIMONIAL CARDS */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.testimonialScroll}>
                {TESTIMONIALS.map((t) => (
                  <View key={t.name} style={styles.testimonialCard}>
                    <Text style={styles.testimonialStars}>{'★'.repeat(t.stars)}</Text>
                    <Text style={styles.testimonialText}>"{t.text}"</Text>
                    <Text style={styles.testimonialName}>— {t.name}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* HOW IT WORKS */}
        {!loading && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>HOW IT WORKS</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.stepsWrap}>
              {[
                { n: '01', title: 'Browse Rides', desc: 'Find rides near you on the live map or list view.' },
                { n: '02', title: 'Offer a Fare', desc: 'Pick your price — driver accepts or counters.' },
                { n: '03', title: 'Hop In & Chat', desc: 'Once agreed, chat opens and youre on the ride.' }
              ].map((s, i) => (
                <View key={s.n} style={styles.stepCard}>
                  <View style={styles.stepLeft}>
                    <Text style={styles.stepNum}>{s.n}</Text>
                    {i < 2 && <View style={styles.stepVertLine} />}
                  </View>
                  <View style={styles.stepRight}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepDesc}>{s.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingBottom: 120 },

  /* HERO */
  hero: { paddingHorizontal: 22, paddingTop: 64, paddingBottom: 24 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14, gap: 6,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillDotOn: { backgroundColor: '#4ade80' },
  pillDotOff: { backgroundColor: Neon.muted },
  pillText: { color: Neon.muted, fontSize: 12, fontWeight: '600' },
  heroGreet: { color: Neon.muted, fontSize: 14, fontWeight: '500', marginBottom: 4 },
  heroTitle: { fontSize: 52, fontWeight: '900', color: Neon.text, letterSpacing: -1, lineHeight: 56 },
  heroAccent: { color: Neon.accent },
  heroSub: { color: Neon.muted, fontSize: 15, fontWeight: '500', marginTop: 6, letterSpacing: 0.3 },

  /* STATS */
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Neon.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  statCardAccent: { borderColor: 'rgba(232,33,39,0.4)', backgroundColor: 'rgba(232,33,39,0.08)' },
  statNum: { fontSize: 18, fontWeight: '800', color: Neon.text },
  statNumAccent: { color: Neon.accent },
  statLabel: { color: Neon.muted, fontSize: 9, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },

  /* MAP */
  mapSection: { paddingHorizontal: 22, marginBottom: 20 },
  mapWrap: { height: 230, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,33,39,0.35)' },
  map: { ...StyleSheet.absoluteFillObject },
  mapBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(14,14,16,0.82)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Neon.border,
  },
  mapBadgeText: { color: Neon.accentSoft, fontSize: 11, fontWeight: '700' },
  mapFallback: {
    height: 100, borderRadius: 18, borderWidth: 1, borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.03)', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  mapFallbackIcon: { fontSize: 28 },
  mapFallbackText: { color: Neon.muted, fontSize: 13 },

  /* SECTION HEADER */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, marginBottom: 14 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  /* FILTERS */
  filtersScroll: { marginBottom: 20 },
  filtersRow: { paddingHorizontal: 22, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Neon.border, backgroundColor: 'rgba(255,255,255,0.04)' },
  chipOn: { borderColor: Neon.accent, backgroundColor: 'rgba(232,33,39,0.15)' },
  chipText: { color: Neon.muted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: Neon.accent },

  /* RIDES */
  loaderWrap: { alignItems: 'center', paddingTop: 48, gap: 14 },
  loaderText: { color: Neon.muted, fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: Neon.text, fontSize: 18, fontWeight: '700' },
  emptySub: { color: Neon.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  /* FEATURES */
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 22, marginBottom: 28 },
  featureCard: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, padding: 16, gap: 6,
  },
  featureIcon: { fontSize: 24 },
  featureTitle: { color: Neon.text, fontSize: 13, fontWeight: '800' },
  featureDesc: { color: Neon.muted, fontSize: 12, lineHeight: 17 },

  /* TESTIMONIALS */
  testimonialsWrap: { marginBottom: 28 },
  ratingHero: {
    marginHorizontal: 22, marginBottom: 16,
    backgroundColor: 'rgba(232,33,39,0.07)',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.2)',
    borderRadius: 18, padding: 20, alignItems: 'center',
  },
  ratingBig: { color: Neon.accent, fontSize: 56, fontWeight: '900', lineHeight: 60 },
  ratingStars: { color: Neon.accent, fontSize: 18, marginBottom: 4 },
  ratingLabel: { color: Neon.muted, fontSize: 12, marginBottom: 16 },
  ratingStats: { flexDirection: 'row', alignItems: 'center', gap: 0, width: '100%' },
  ratingStat: { flex: 1, alignItems: 'center', gap: 3 },
  ratingStatNum: { color: Neon.text, fontSize: 18, fontWeight: '900' },
  ratingStatLabel: { color: Neon.muted, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  ratingStatDivider: { width: 1, height: 32, backgroundColor: Neon.border },
  testimonialScroll: { paddingHorizontal: 22, gap: 12 },
  testimonialCard: {
    width: 240, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, padding: 16, gap: 8,
  },
  testimonialStars: { color: Neon.accent, fontSize: 14 },
  testimonialText: { color: Neon.accentSoft, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  testimonialName: { color: Neon.muted, fontSize: 12, fontWeight: '600' },

  /* HOW IT WORKS */
  stepsWrap: { marginHorizontal: 22, marginBottom: 20, gap: 0 },
  stepCard: { flexDirection: 'row', gap: 16, minHeight: 72 },
  stepLeft: { alignItems: 'center', width: 40 },
  stepNum: { color: Neon.accent, fontWeight: '900', fontSize: 18, lineHeight: 24 },
  stepVertLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(232,33,39,0.2)', marginTop: 4 },
  stepRight: { flex: 1, paddingBottom: 20 },
  stepTitle: { color: Neon.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: Neon.muted, fontSize: 13, lineHeight: 19 },
});
