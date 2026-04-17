import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const accountReady = user?.accountReady === true;

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api.fetchRide(id);
    setRide(data);
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

  const region = useMemo(() => {
    if (!ride?.fromLat || !ride?.fromLng) return null;
    const lat = (ride.fromLat + (ride.toLat ?? ride.fromLat)) / 2;
    const lng = (ride.fromLng + (ride.toLng ?? ride.fromLng)) / 2;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.15, longitudeDelta: 0.15 };
  }, [ride]);

  const d = ride?.driver;
  const canContact = !!(user && d && (d.phone || d.email));
  const isDriver = !!(user && ride && d && user.id === d.id);
  const already = !!(user && ride && ride.passengerIds.includes(user.id));
  const full = !!(ride && ride.passengerIds.length >= ride.seatCount);
  const jr = ride?.myJoinRequest;
  const openJoin = !!(jr && (jr.status === 'pending' || jr.status === 'negotiating'));
  const canRequestJoin = !!(user && ride && d && accountReady && !isDriver && !already && !full && !openJoin);
  const rideUpcoming = ride ? new Date(ride.when).getTime() > Date.now() : false;
  const showRideChat = !!user && accountReady && already && !isDriver && !!ride?.chatThreadId && rideUpcoming;

  const submitJoinRequest = async () => {
    if (!user || !ride) { Alert.alert('Sign in', 'Sign in to request a seat.'); return; }
    if (!accountReady) {
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
      if (action === 'accept') Alert.alert("You're in" ,'Chat is now open below.');
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
                <Text style={styles.routeTimeText}>{timeUntil(ride.when)}</Text>
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
              <Text style={styles.sectionTitle}>ROUTE MAP</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.mapWrap}>
              <MapView
                style={styles.map}
                initialRegion={region}
                region={region}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}>
                <Marker coordinate={{ latitude: ride.fromLat, longitude: ride.fromLng }} title="Pickup" pinColor="#4ade80" />
                {ride.toLat != null && ride.toLng != null && (
                  <>
                    <Marker coordinate={{ latitude: ride.toLat, longitude: ride.toLng }} title="Drop-off" pinColor={Neon.accent} />
                    <Polyline
                      coordinates={[
                        { latitude: ride.fromLat, longitude: ride.fromLng },
                        { latitude: ride.toLat, longitude: ride.toLng },
                      ]}
                      strokeColor={Neon.accent}
                      strokeWidth={3}
                    />
                  </>
                )}
              </MapView>
              <View style={styles.mapLegend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} /><Text style={styles.legendText}>Pickup</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Neon.accent }]} /><Text style={styles.legendText}>Drop-off</Text></View>
              </View>
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
                  <View style={styles.driverBadge}><Text style={styles.driverBadgeText}>★ 5.0</Text></View>
                </View>
              </View>
            </View>

            {!user ? (
              <View style={styles.contactLocked}>
                <Text style={styles.contactLockedIcon}>🔒</Text>
                <Text style={styles.contactLockedText}>Sign in to view contact details</Text>
              </View>
            ) : canContact ? (
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

        {/* DRIVER INFO BOX + CANCEL */}
        {isDriver && (
          <>
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxIcon}>🚗</Text>
              <Text style={styles.infoBoxText}>Manage join requests and fares in your Inbox tab.</Text>
            </View>
            {!ride.cancelled && (
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
  mapWrap: { marginHorizontal: 20, height: 220, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)' },
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
