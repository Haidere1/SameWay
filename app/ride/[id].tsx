import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { DriverProfileModal } from '@/components/DriverProfileModal';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import * as api from '@/lib/api';
import type { Ride } from '@/lib/types';

const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function timeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Departed';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d away`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function telUrl(phone: string) { return `tel:${phone.replace(/[^\d+]/g, '')}`; }

export default function RideDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[]; join?: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const { user } = useAuth();
  const { openThread, refreshThreads } = useChat();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [fareOffer, setFareOffer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [counterModal, setCounterModal] = useState(false);
  const [counterValue, setCounterValue] = useState('');
  const [liveDriverLoc, setLiveDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [rideActionBusy, setRideActionBusy] = useState(false);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [showDriverProfile, setShowDriverProfile] = useState(false);

  const accountReady = user?.accountReady === true;

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.fetchRide(id);
    setRide(data);
    if (data.liveDriverLat != null && data.liveDriverLng != null) {
      setLiveDriverLoc({ lat: data.liveDriverLat, lng: data.liveDriverLng });
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) { setLoading(false); return; }
      try { await load(); }
      catch (e) { if (alive) Alert.alert('Error', e instanceof Error ? e.message : 'Could not load ride'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id, load]);

  const accountReady2 = user?.accountReady === true;
  const d = ride?.driver;
  const isDriver = !!(user && ride && d && user.id === d.id);
  const already = !!(user && ride && ride.passengerIds.includes(user.id));
  const rideStatus = ride?.status ?? 'scheduled';
  const isActive = rideStatus === 'active';

  // Driver: track and push live location while ride is active
  useEffect(() => {
    if (!isDriver || !isActive || !ride?.id) return;

    let alive = true;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access so passengers can track the ride.');
        return;
      }

      const push = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude, longitude } = loc.coords;
          if (!alive) return;
          setLiveDriverLoc({ lat: latitude, lng: longitude });
          await api.updateDriverLocation(ride.id, latitude, longitude);
        } catch { /* silent — keep trying */ }
      };

      await push();
      trackingIntervalRef.current = setInterval(push, 10000);
    };

    startTracking();
    return () => {
      alive = false;
      if (trackingIntervalRef.current) { clearInterval(trackingIntervalRef.current); trackingIntervalRef.current = null; }
    };
  }, [isDriver, isActive, ride?.id]);

  // Passenger: poll live driver location while ride is active
  useEffect(() => {
    if (!already || isDriver || !isActive || !ride?.id) return;

    const poll = async () => {
      try {
        const loc = await api.fetchRideLocation(ride.id);
        if (loc.liveDriverLat != null && loc.liveDriverLng != null) {
          setLiveDriverLoc({ lat: loc.liveDriverLat, lng: loc.liveDriverLng });
        }
      } catch { /* silent */ }
    };

    poll();
    const id2 = setInterval(poll, 8000);
    return () => clearInterval(id2);
  }, [already, isDriver, isActive, ride?.id]);

  // Passenger: poll ride status to detect when driver starts or ends
  useEffect(() => {
    if (!already || isDriver || !ride?.id || isActive) return;
    const id2 = setInterval(async () => {
      try {
        const updated = await api.fetchRide(ride.id);
        if (updated.status !== ride.status) setRide(updated);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(id2);
  }, [already, isDriver, ride?.id, ride?.status, isActive]);

  // Show review prompt when ride completes and user is a passenger
  useEffect(() => {
    if (!already || isDriver || !ride?.id || rideStatus !== 'completed' || hasReviewed) return;
    AsyncStorage.getItem(`reviewed_${ride.id}`).then((val) => {
      if (!val) setShowReview(true);
      else setHasReviewed(true);
    });
  }, [already, isDriver, ride?.id, rideStatus, hasReviewed]);

  const region = useMemo(() => {
    if (isActive && liveDriverLoc) {
      return {
        latitude: liveDriverLoc.lat,
        longitude: liveDriverLoc.lng,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      };
    }
    if (!ride?.fromLat || !ride?.fromLng) return null;
    const lat = (ride.fromLat + (ride.toLat ?? ride.fromLat)) / 2;
    const lng = (ride.fromLng + (ride.toLng ?? ride.fromLng)) / 2;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.15, longitudeDelta: 0.15 };
  }, [ride, isActive, liveDriverLoc]);

  const full = !!(ride && ride.passengerIds.length >= ride.seatCount);
  const jr = ride?.myJoinRequest;
  const openJoin = !!(jr && (jr.status === 'pending' || jr.status === 'negotiating'));
  const canRequestJoin = !!(user && ride && d && accountReady2 && !isDriver && !already && !full && !openJoin);
  const rideUpcoming = ride ? new Date(ride.when).getTime() > Date.now() : false;
  const showRideChat = !!user && accountReady2 && already && !isDriver && !!ride?.chatThreadId && rideUpcoming;

  const submitReview = async () => {
    if (!ride || !ride.driver) return;
    setReviewSubmitting(true);
    try {
      await api.submitReview(ride.id, ride.driver.id, reviewRating, reviewComment.trim());
      await AsyncStorage.setItem(`reviewed_${ride.id}`, '1');
      setHasReviewed(true);
      setShowReview(false);
      Alert.alert('Thanks!', 'Your review has been posted.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('already')) {
        await AsyncStorage.setItem(`reviewed_${ride.id}`, '1');
        setHasReviewed(true);
        setShowReview(false);
      } else {
        Alert.alert('Could not submit', msg || 'Try again.');
      }
    } finally { setReviewSubmitting(false); }
  };

  const handleStartRide = async () => {
    if (!ride) return;
    Alert.alert('Start ride?', 'Passengers will be notified and you\'ll begin sharing your location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start', onPress: async () => {
          setRideActionBusy(true);
          try {
            const updated = await api.startRide(ride.id);
            setRide(updated);
          } catch (e) { Alert.alert('Failed', e instanceof Error ? e.message : 'Try again'); }
          finally { setRideActionBusy(false); }
        },
      },
    ]);
  };

  const handleEndRide = async () => {
    if (!ride) return;
    Alert.alert('End ride?', 'Location sharing will stop and passengers will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End ride', style: 'destructive', onPress: async () => {
          setRideActionBusy(true);
          try {
            const updated = await api.endRide(ride.id);
            setRide(updated);
            setLiveDriverLoc(null);
            if (trackingIntervalRef.current) { clearInterval(trackingIntervalRef.current); trackingIntervalRef.current = null; }
          } catch (e) { Alert.alert('Failed', e instanceof Error ? e.message : 'Try again'); }
          finally { setRideActionBusy(false); }
        },
      },
    ]);
  };

  const submitJoinRequest = async () => {
    if (!user || !ride) { Alert.alert('Sign in', 'Sign in to request a seat.'); return; }
    if (!accountReady2) {
      Alert.alert('Verification required', 'Finish verification before requesting a seat.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Verify', onPress: () => router.push('/verify-account') },
      ]); return;
    }
    const n = parseFloat(fareOffer.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) { Alert.alert('Fare', 'Enter a positive fare (e.g. 500).'); return; }
    setSubmitting(true);
    try {
      const created = await api.createJoinRequest(ride.id, n);
      setRide((prev) => (prev ? { ...prev, myJoinRequest: created } : prev));
      setFareOffer('');
      Alert.alert('Request sent', 'The driver will see your offer in their Inbox.');
    } catch (e) { Alert.alert('Could not request', e instanceof Error ? e.message : 'Try again'); }
    finally { setSubmitting(false); }
  };

  const runRiderAction = async (action: 'accept' | 'reject' | 'counter' | 'withdraw', counterFare?: number) => {
    if (!jr) return;
    setSubmitting(true);
    try {
      const updated = await api.riderJoinAction(jr.id, action, counterFare);
      await load();
      if (updated.chatThreadId) { await refreshThreads(); openThread(updated.chatThreadId); }
      if (action === 'accept') Alert.alert("You're in!", 'Chat is now open below.');
    } catch (e) { Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again'); }
    finally { setSubmitting(false); }
  };

  const submitCounter = async () => {
    const n = parseFloat(counterValue.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) { Alert.alert('Fare', 'Enter a valid positive amount.'); return; }
    setCounterModal(false);
    await runRiderAction('counter', n);
  };

  const openChat = async () => {
    if (ride?.chatThreadId) { await refreshThreads(); openThread(ride.chatThreadId); }
  };

  if (loading) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={Neon.accent} />
          <Text style={styles.loaderText}>Loading ride…</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!ride) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <View style={styles.loaderWrap}>
          <Text style={styles.notFoundIcon}>🚫</Text>
          <Text style={styles.notFoundText}>Ride not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Go back</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  const taken = ride.passengerIds.length;
  const fillPct = Math.round((taken / ride.seatCount) * 100);

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />

      {/* DRIVER PROFILE MODAL */}
      {d && (
        <DriverProfileModal
          driverId={showDriverProfile ? d.id : null}
          driverName={d.name}
          driverAvatarUrl={d.avatarUrl}
          ratingAvg={d.ratingAvg}
          ratingCount={d.ratingCount}
          onClose={() => setShowDriverProfile(false)}
        />
      )}

      {/* POST-RIDE REVIEW MODAL */}
      <Modal visible={showReview} transparent animationType="slide" onRequestClose={() => setShowReview(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>How was your ride?</Text>
            <Text style={styles.modalSub}>
              {ride?.from} → {ride?.to}
            </Text>
            {/* STARS */}
            <View style={styles.reviewStarsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setReviewRating(s)} hitSlop={8}>
                  <Text style={[styles.reviewStar, s <= reviewRating && styles.reviewStarOn]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.reviewRatingLabel}>
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][reviewRating]}
            </Text>
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Add a comment (optional)"
              placeholderTextColor={Neon.muted}
              style={styles.reviewInput}
              multiline
              maxLength={300}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => { setShowReview(false); AsyncStorage.setItem(`reviewed_${ride?.id ?? ''}`, '1'); setHasReviewed(true); }}
                style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Skip</Text>
              </Pressable>
              <Pressable onPress={submitReview} disabled={reviewSubmitting} style={styles.modalConfirm}>
                <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalConfirmGrad}>
                  {reviewSubmitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.modalConfirmText}>POST REVIEW</Text>}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* COUNTER MODAL */}
      <Modal visible={counterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Counter Offer</Text>
            <Text style={styles.modalSub}>Enter your fare in PKR</Text>
            <TextInput
              value={counterValue}
              onChangeText={setCounterValue}
              keyboardType="decimal-pad"
              placeholder="e.g. 600"
              placeholderTextColor={Neon.muted}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCounterModal(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitCounter} style={styles.modalConfirm}>
                <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalConfirmGrad}>
                  <Text style={styles.modalConfirmText}>Send Counter</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* BACK */}
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Rides</Text>
        </Pressable>

        {/* LIVE RIDE BANNER (passenger) */}
        {already && !isDriver && isActive && (
          <View style={styles.liveBanner}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBannerText}>RIDE IN PROGRESS — driver location updating live</Text>
          </View>
        )}

        {/* DRIVER TRACKING BANNER */}
        {isDriver && isActive && (
          <View style={[styles.liveBanner, styles.liveBannerDriver]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBannerText}>SHARING LOCATION with passengers</Text>
          </View>
        )}

        {/* ROUTE HERO */}
        <View style={styles.routeHero}>
          <View style={styles.routeHeroInner}>
            <View style={styles.routePoint}>
              <View style={styles.routeDotGreen} />
              <Text style={styles.routeCity} numberOfLines={2}>{ride.from}</Text>
            </View>
            <View style={styles.routeConnector}>
              <View style={styles.routeConnectorLine} />
              <View style={styles.routeTimePill}>
                <Text style={styles.routeTimeText}>
                  {isActive ? 'LIVE' : rideStatus === 'completed' ? 'DONE' : timeUntil(ride.when)}
                </Text>
              </View>
              <View style={styles.routeConnectorLine} />
            </View>
            <View style={styles.routePoint}>
              <View style={styles.routeDotRed} />
              <Text style={styles.routeCity} numberOfLines={2}>{ride.to}</Text>
            </View>
          </View>
          <Text style={styles.whenText}>{formatWhen(ride.when)}</Text>
        </View>

        {/* SEAT STATUS */}
        <View style={styles.seatCard}>
          <View style={styles.seatRow}>
            <Text style={styles.seatTitle}>CAPACITY</Text>
            <Text style={styles.seatFraction}>{taken} / {ride.seatCount} seats filled</Text>
          </View>
          <View style={styles.seatTrack}>
            <LinearGradient
              colors={full ? ['#ef4444', '#dc2626'] : [Neon.accent, '#ff6b6b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.seatFill, { width: `${fillPct}%` as any }]}
            />
          </View>
          <View style={styles.dotRow}>
            {Array.from({ length: ride.seatCount }).map((_, i) => (
              <View key={i} style={[styles.dot, i < taken ? styles.dotFilled : styles.dotEmpty]} />
            ))}
          </View>
          {isDriver && <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>YOU ARE DRIVING</Text></View>}
          {already && !isDriver && <View style={[styles.roleBadge, styles.roleBadgeJoined]}><Text style={styles.roleBadgeText}>YOU'RE ON THIS RIDE ✓</Text></View>}
          {full && !already && !isDriver && <View style={[styles.roleBadge, styles.roleBadgeFull]}><Text style={styles.roleBadgeText}>RIDE IS FULL</Text></View>}
        </View>

        {/* MAP */}
        {IS_MAP && region && ride.fromLat != null && ride.fromLng != null && (
          <View style={styles.mapSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>{isActive ? 'LIVE TRACKING' : 'ROUTE MAP'}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.mapWrap}>
              <MapView
                style={styles.map}
                region={region}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              >
                {/* static pickup marker */}
                <Marker coordinate={{ latitude: ride.fromLat, longitude: ride.fromLng }} title="Pickup" pinColor="#4ade80" />
                {/* static dropoff marker */}
                {ride.toLat != null && ride.toLng != null && (
                  <>
                    <Marker coordinate={{ latitude: ride.toLat, longitude: ride.toLng }} title="Drop-off" pinColor={Neon.accent} />
                    <Polyline
                      coordinates={[
                        { latitude: ride.fromLat, longitude: ride.fromLng },
                        { latitude: ride.toLat, longitude: ride.toLng },
                      ]}
                      strokeColor={isActive ? 'rgba(232,33,39,0.3)' : Neon.accent}
                      strokeWidth={3}
                    />
                  </>
                )}
                {/* live driver location marker */}
                {isActive && liveDriverLoc && (
                  <Marker
                    coordinate={{ latitude: liveDriverLoc.lat, longitude: liveDriverLoc.lng }}
                    title="Driver"
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.carMarker}>
                      <Text style={styles.carMarkerIcon}>🚗</Text>
                    </View>
                  </Marker>
                )}
              </MapView>
              <View style={styles.mapLegend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} /><Text style={styles.legendText}>Pickup</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Neon.accent }]} /><Text style={styles.legendText}>Drop-off</Text></View>
                {isActive && liveDriverLoc && (
                  <View style={styles.legendItem}><Text style={styles.legendCarIcon}>🚗</Text><Text style={styles.legendText}>Driver</Text></View>
                )}
              </View>
              {isActive && !liveDriverLoc && (
                <View style={styles.mapOverlay}>
                  <ActivityIndicator size="small" color={Neon.accent} />
                  <Text style={styles.mapOverlayText}>Waiting for driver location…</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* DRIVER CARD */}
        <View style={styles.driverSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>DRIVER</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.driverCard}>
            <View style={styles.driverCardTop}>
              {d?.avatarUrl
                ? <Image source={{ uri: d.avatarUrl }} style={styles.driverAvatar} />
                : <View style={styles.driverAvatarPh}><Text style={styles.driverInitial}>{d?.name?.[0] ?? '?'}</Text></View>}
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{d?.name ?? 'Unknown'}</Text>
                <View style={styles.driverBadges}>
                  <View style={styles.driverBadge}><Text style={styles.driverBadgeText}>✓ Verified</Text></View>
                  {d?.ratingAvg != null
                    ? <View style={styles.driverBadge}><Text style={styles.driverBadgeText}>★ {d.ratingAvg.toFixed(1)} ({d.ratingCount})</Text></View>
                    : <View style={styles.driverBadge}><Text style={styles.driverBadgeText}>★ New</Text></View>}
                </View>
                <Pressable onPress={() => setShowDriverProfile(true)} style={styles.viewProfileBtn}>
                  <Text style={styles.viewProfileBtnText}>View Profile & Reviews ›</Text>
                </Pressable>
              </View>
            </View>

            {!user ? (
              <View style={styles.contactLocked}>
                <Text style={styles.contactLockedIcon}>🔒</Text>
                <Text style={styles.contactLockedText}>Sign in to view contact details</Text>
              </View>
            ) : !!(user && d && (d.phone || d.email)) ? (
              <View style={styles.contactGrid}>
                {d?.phone && (
                  <Pressable onPress={() => Linking.openURL(telUrl(d.phone!))} style={styles.contactBtn}>
                    <Text style={styles.contactBtnIcon}>📞</Text>
                    <Text style={styles.contactBtnLabel}>Call</Text>
                    <Text style={styles.contactBtnVal} numberOfLines={1}>{d.phone}</Text>
                  </Pressable>
                )}
                {d?.email && (
                  <Pressable onPress={() => Linking.openURL(`mailto:${d.email}`)} style={[styles.contactBtn, styles.contactBtnAlt]}>
                    <Text style={styles.contactBtnIcon}>✉️</Text>
                    <Text style={styles.contactBtnLabel}>Email</Text>
                    <Text style={styles.contactBtnVal} numberOfLines={1}>{d.email}</Text>
                  </Pressable>
                )}
                {d?.cnic && (
                  <View style={styles.cnicRow}>
                    <Text style={styles.cnicLabel}>🪪 CNIC (verified)</Text>
                    <Text style={styles.cnicVal}>{d.cnic}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.contactUnavailable}>Contact details unavailable</Text>
            )}
          </View>
        </View>

        {/* CHAT BUTTON */}
        {showRideChat && (
          <Pressable onPress={openChat} style={styles.chatBtn}>
            <LinearGradient colors={['rgba(129,140,248,0.25)', 'rgba(129,140,248,0.1)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatBtnGrad}>
              <Text style={styles.chatBtnIcon}>💬</Text>
              <Text style={styles.chatBtnText}>OPEN RIDE CHAT</Text>
              <Text style={styles.chatBtnArrow}>›</Text>
            </LinearGradient>
          </Pressable>
        )}
        {ride.chatThreadId && !rideUpcoming && already && !isDriver && (
          <View style={styles.chatClosed}><Text style={styles.chatClosedText}>Chat closed — ride has departed</Text></View>
        )}

        {/* DRIVER CONTROLS */}
        {isDriver && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxIcon}>🚗</Text>
              <Text style={styles.infoBoxText}>Manage join requests and fares in your Inbox tab.</Text>
            </View>

            {/* START RIDE button */}
            {!ride.cancelled && rideStatus === 'scheduled' && taken > 0 && (
              <Pressable onPress={handleStartRide} disabled={rideActionBusy} style={styles.startRideBtn}>
                <LinearGradient colors={['#16a34a', '#15803d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startRideBtnGrad}>
                  {rideActionBusy
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.startRideBtnText}>▶  START RIDE</Text>}
                </LinearGradient>
              </Pressable>
            )}

            {/* END RIDE button */}
            {rideStatus === 'active' && (
              <Pressable onPress={handleEndRide} disabled={rideActionBusy} style={styles.endRideBtn}>
                {rideActionBusy
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Text style={styles.endRideBtnText}>⏹  END RIDE</Text>}
              </Pressable>
            )}

            {rideStatus === 'completed' && (
              <View style={styles.completedBadge}>
                <Text style={styles.completedBadgeText}>✓ RIDE COMPLETED</Text>
              </View>
            )}

            {!ride.cancelled && rideStatus === 'scheduled' && (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Cancel this ride?',
                    'All pending join requests will be rejected and riders will be notified.',
                    [
                      { text: 'Keep ride', style: 'cancel' },
                      {
                        text: 'Cancel ride',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await api.cancelRide(ride.id);
                            Alert.alert('Ride cancelled', 'Your ride has been removed.', [
                              { text: 'OK', onPress: () => router.back() },
                            ]);
                          } catch (e) {
                            Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
                          }
                        },
                      },
                    ]
                  )
                }
                style={styles.cancelRideBtn}>
                <Text style={styles.cancelRideBtnText}>✕  WITHDRAW RIDE</Text>
              </Pressable>
            )}
            {ride.cancelled && (
              <View style={styles.cancelledBadge}>
                <Text style={styles.cancelledBadgeText}>RIDE WITHDRAWN</Text>
              </View>
            )}
          </>
        )}

        {/* VERIFY CTA */}
        {user && !accountReady && !isDriver && !already && !full && (
          <Pressable onPress={() => router.push('/verify-account')} style={styles.verifyBanner}>
            <Text style={styles.verifyBannerIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyBannerTitle}>Verify your account</Text>
              <Text style={styles.verifyBannerSub}>Required before requesting a seat</Text>
            </View>
            <Text style={styles.verifyBannerArrow}>›</Text>
          </Pressable>
        )}

        {/* JOIN REQUEST SECTION */}
        {canRequestJoin && (
          <View style={styles.joinSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>REQUEST A SEAT</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.joinCard}>
              <Text style={styles.joinHint}>
                Offer a fare — the driver can accept or counter until you both agree.
              </Text>
              <View style={styles.fareRow}>
                <Text style={styles.fareCurrency}>PKR</Text>
                <TextInput
                  value={fareOffer}
                  onChangeText={setFareOffer}
                  keyboardType="decimal-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={Neon.muted}
                  style={styles.fareInput}
                />
              </View>
              <Pressable
                onPress={submitJoinRequest}
                disabled={submitting}
                style={({ pressed }) => [styles.joinBtn, pressed && styles.joinBtnPressed]}>
                <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.joinBtnGrad}>
                  <Text style={styles.joinBtnText}>{submitting ? 'SENDING…' : 'SEND JOIN REQUEST'}</Text>
                  {!submitting && <Text style={styles.joinBtnArrow}>›</Text>}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}

        {/* NEGOTIATION BOX */}
        {jr && openJoin && !isDriver && (
          <View style={styles.negSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>YOUR REQUEST</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.negCard}>
              <View style={styles.negMetaRow}>
                <View style={styles.negMetaItem}>
                  <Text style={styles.negMetaLabel}>STATUS</Text>
                  <Text style={styles.negMetaVal}>{jr.status.toUpperCase()}</Text>
                </View>
                <View style={styles.negMetaDivider} />
                <View style={styles.negMetaItem}>
                  <Text style={styles.negMetaLabel}>FARE</Text>
                  <Text style={[styles.negMetaVal, styles.negMetaValAccent]}>PKR {jr.currentFare}</Text>
                </View>
                <View style={styles.negMetaDivider} />
                <View style={styles.negMetaItem}>
                  <Text style={styles.negMetaLabel}>LAST MOVE</Text>
                  <Text style={styles.negMetaVal}>{jr.proposedBy.toUpperCase()}</Text>
                </View>
              </View>

              {jr.proposedBy === 'driver' ? (
                <>
                  <Text style={styles.negHint}>Driver proposed a fare. Accept or counter.</Text>
                  <View style={styles.negActions}>
                    <Pressable disabled={submitting} onPress={() => runRiderAction('accept')} style={styles.negAccept}>
                      <LinearGradient colors={['#16a34a', '#15803d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.negBtnGrad}>
                        <Text style={styles.negBtnText}>✓ ACCEPT</Text>
                      </LinearGradient>
                    </Pressable>
                    <Pressable disabled={submitting} onPress={() => { setCounterValue(''); setCounterModal(true); }} style={styles.negCounter}>
                      <Text style={styles.negCounterText}>↔ COUNTER</Text>
                    </Pressable>
                    <Pressable disabled={submitting} onPress={() => runRiderAction('withdraw')} style={styles.negWithdraw}>
                      <Text style={styles.negWithdrawText}>✗</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.negWaiting}>
                  <ActivityIndicator size="small" color={Neon.accent} />
                  <Text style={styles.negWaitingText}>Waiting for driver to respond…</Text>
                </View>
              )}
            </View>
          </View>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loaderText: { color: Neon.muted, fontSize: 14 },
  notFoundIcon: { fontSize: 48 },
  notFoundText: { color: Neon.text, fontSize: 18, fontWeight: '700' },
  backBtn: { marginTop: 16 },
  backBtnText: { color: Neon.accentSoft, fontWeight: '600', fontSize: 15 },

  scroll: { paddingBottom: 140 },

  /* BACK */
  backRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  backArrow: { color: Neon.accent, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  backLabel: { color: Neon.accentSoft, fontSize: 15, fontWeight: '600' },

  /* LIVE BANNERS */
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: 'rgba(74,222,128,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
  },
  liveBannerDriver: {
    backgroundColor: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.3)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  liveBannerText: { color: '#4ade80', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, flex: 1 },

  /* ROUTE HERO */
  routeHero: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.2)',
    borderRadius: 20, padding: 20,
  },
  routeHeroInner: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  routePoint: { flex: 1, alignItems: 'center', gap: 8 },
  routeDotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4ade80', borderWidth: 2, borderColor: 'rgba(74,222,128,0.3)' },
  routeDotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: Neon.accent, borderWidth: 2, borderColor: 'rgba(232,33,39,0.3)' },
  routeCity: { color: Neon.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  routeConnector: { flex: 1, alignItems: 'center', gap: 4 },
  routeConnectorLine: { flex: 1, height: 1, backgroundColor: 'rgba(232,33,39,0.3)', width: '100%' },
  routeTimePill: {
    backgroundColor: 'rgba(232,33,39,0.15)', borderWidth: 1,
    borderColor: 'rgba(232,33,39,0.3)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  routeTimeText: { color: Neon.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  whenText: { color: Neon.muted, fontSize: 13, textAlign: 'center' },

  /* SEAT CARD */
  seatCard: {
    marginHorizontal: 20, marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 16, padding: 16,
  },
  seatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  seatTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  seatFraction: { color: Neon.accentSoft, fontSize: 12, fontWeight: '600' },
  seatTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  seatFill: { height: '100%', borderRadius: 4 },
  dotRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotFilled: { backgroundColor: Neon.accent },
  dotEmpty: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  roleBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(161,161,170,0.3)', backgroundColor: 'rgba(161,161,170,0.1)',
  },
  roleBadgeJoined: { borderColor: 'rgba(74,222,128,0.4)', backgroundColor: 'rgba(74,222,128,0.1)' },
  roleBadgeFull: { borderColor: 'rgba(113,113,122,0.3)', backgroundColor: 'rgba(113,113,122,0.08)' },
  roleBadgeText: { color: Neon.accentSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },

  /* MAP */
  mapSection: { marginBottom: 20 },
  mapWrap: { marginHorizontal: 20, height: 240, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLegend: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', gap: 12,
    backgroundColor: 'rgba(13,13,15,0.85)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Neon.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Neon.accentSoft, fontSize: 11, fontWeight: '600' },
  legendCarIcon: { fontSize: 14 },
  mapOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13,13,15,0.85)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Neon.border,
  },
  mapOverlayText: { color: Neon.muted, fontSize: 11 },
  carMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Neon.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  carMarkerIcon: { fontSize: 18 },

  /* SECTION HEADER */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 12 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  /* DRIVER CARD */
  driverSection: { marginBottom: 20 },
  driverCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 18, overflow: 'hidden',
  },
  driverCardTop: { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'center' },
  driverAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(232,33,39,0.4)' },
  driverAvatarPh: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(232,33,39,0.12)',
    borderWidth: 2, borderColor: 'rgba(232,33,39,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  driverInitial: { color: Neon.accent, fontSize: 24, fontWeight: '900' },
  driverInfo: { flex: 1, gap: 6 },
  driverName: { color: Neon.text, fontSize: 18, fontWeight: '800' },
  driverBadges: { flexDirection: 'row', gap: 6 },
  driverBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)' },
  driverBadgeText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },
  contactLocked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  contactLockedIcon: { fontSize: 18 },
  contactLockedText: { color: Neon.muted, fontSize: 14 },
  contactGrid: { padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: 'rgba(232,33,39,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.2)',
  },
  contactBtnAlt: { backgroundColor: 'rgba(129,140,248,0.08)', borderColor: 'rgba(129,140,248,0.2)' },
  contactBtnIcon: { fontSize: 18 },
  contactBtnLabel: { color: Neon.muted, fontSize: 11, fontWeight: '600', width: 36 },
  contactBtnVal: { flex: 1, color: Neon.text, fontSize: 14, fontWeight: '600' },
  cnicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  cnicLabel: { color: Neon.muted, fontSize: 12, fontWeight: '600' },
  cnicVal: { color: Neon.accentSoft, fontSize: 13, fontWeight: '600' },
  contactUnavailable: { color: Neon.muted, fontSize: 14, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },

  /* CHAT */
  chatBtn: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(129,140,248,0.3)' },
  chatBtnGrad: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  chatBtnIcon: { fontSize: 18 },
  chatBtnText: { flex: 1, color: '#818cf8', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  chatBtnArrow: { color: '#818cf8', fontSize: 22, fontWeight: '700' },
  chatClosed: { marginHorizontal: 20, marginBottom: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: Neon.border },
  chatClosedText: { color: Neon.muted, fontSize: 13, textAlign: 'center' },

  /* INFO BOX */
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, borderWidth: 1, borderColor: Neon.border,
  },
  infoBoxIcon: { fontSize: 20 },
  infoBoxText: { flex: 1, color: Neon.muted, fontSize: 14, lineHeight: 20 },

  /* START / END RIDE */
  startRideBtn: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  startRideBtnGrad: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  startRideBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
  endRideBtn: {
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 50,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  endRideBtnText: { color: '#ef4444', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },

  /* COMPLETED */
  completedBadge: {
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 12,
    borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)',
    backgroundColor: 'rgba(74,222,128,0.1)',
  },
  completedBadgeText: { color: '#4ade80', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },

  /* VERIFY BANNER */
  verifyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    backgroundColor: 'rgba(232,33,39,0.08)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.3)',
  },
  verifyBannerIcon: { fontSize: 20 },
  verifyBannerTitle: { color: Neon.accent, fontWeight: '800', fontSize: 14 },
  verifyBannerSub: { color: Neon.muted, fontSize: 12, marginTop: 2 },
  verifyBannerArrow: { color: Neon.accent, fontSize: 22, fontWeight: '700' },

  /* JOIN SECTION */
  joinSection: { marginBottom: 20 },
  joinCard: { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: Neon.border, borderRadius: 18, padding: 18 },
  joinHint: { color: Neon.muted, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  fareRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 14, paddingHorizontal: 16, marginBottom: 14, overflow: 'hidden',
  },
  fareCurrency: { color: Neon.accent, fontWeight: '800', fontSize: 16, marginRight: 8 },
  fareInput: { flex: 1, paddingVertical: 14, color: Neon.text, fontSize: 22, fontWeight: '700' },
  joinBtn: { borderRadius: 14, overflow: 'hidden' },
  joinBtnPressed: { opacity: 0.88 },
  joinBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 6 },
  joinBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },
  joinBtnArrow: { color: '#fff', fontSize: 22, fontWeight: '900' },

  /* NEGOTIATION */
  negSection: { marginBottom: 20 },
  negCard: { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: Neon.border, borderRadius: 18, padding: 16 },
  negMetaRow: { flexDirection: 'row', marginBottom: 14 },
  negMetaItem: { flex: 1, alignItems: 'center', gap: 4 },
  negMetaDivider: { width: 1, backgroundColor: Neon.border },
  negMetaLabel: { color: Neon.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  negMetaVal: { color: Neon.text, fontSize: 13, fontWeight: '800' },
  negMetaValAccent: { color: Neon.accent },
  negHint: { color: Neon.muted, fontSize: 13, marginBottom: 14 },
  negActions: { flexDirection: 'row', gap: 8 },
  negAccept: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  negBtnGrad: { paddingVertical: 12, alignItems: 'center' },
  negBtnText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  negCounter: {
    flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Neon.border, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  negCounterText: { color: Neon.accentSoft, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  negWithdraw: {
    width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)',
  },
  negWithdrawText: { color: '#ef4444', fontSize: 16, fontWeight: '800' },
  negWaiting: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  negWaitingText: { color: Neon.muted, fontSize: 13 },

  cancelRideBtn: {
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  cancelRideBtnText: { color: '#ef4444', fontWeight: '900', fontSize: 13, letterSpacing: 1.2 },
  cancelledBadge: {
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 12,
    borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(113,113,122,0.3)',
    backgroundColor: 'rgba(113,113,122,0.08)',
  },
  cancelledBadgeText: { color: Neon.muted, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },

  viewProfileBtn: { marginTop: 6 },
  viewProfileBtnText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },

  /* REVIEW MODAL */
  reviewStarsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 },
  reviewStar: { fontSize: 36, color: 'rgba(255,255,255,0.15)' },
  reviewStarOn: { color: '#facc15' },
  reviewRatingLabel: { color: Neon.muted, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 14 },
  reviewInput: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 14, padding: 12, color: Neon.text, fontSize: 14,
    minHeight: 72, textAlignVertical: 'top', marginBottom: 18,
  },

  /* MODAL */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: Neon.bgElevated, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)' },
  modalTitle: { color: Neon.text, fontWeight: '900', fontSize: 18, marginBottom: 4 },
  modalSub: { color: Neon.muted, fontSize: 13, marginBottom: 16 },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 14, padding: 14, color: Neon.text, fontSize: 20, fontWeight: '700', marginBottom: 18,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: Neon.border },
  modalCancelText: { color: Neon.muted, fontWeight: '700' },
  modalConfirm: { flex: 2, borderRadius: 14, overflow: 'hidden' },
  modalConfirmGrad: { paddingVertical: 14, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
});
