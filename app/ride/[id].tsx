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

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import * as api from '@/lib/api';
import type { Ride } from '@/lib/types';

const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function telUrl(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

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
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        await load();
      } catch (e) {
        if (alive) {
          Alert.alert('Error', e instanceof Error ? e.message : 'Could not load ride');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, load]);

  const region = useMemo(() => {
    if (!ride?.fromLat || !ride?.fromLng) return null;
    const lat = (ride.fromLat + (ride.toLat ?? ride.fromLat)) / 2;
    const lng = (ride.fromLng + (ride.toLng ?? ride.fromLng)) / 2;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    };
  }, [ride]);

  const d = ride?.driver;
  const canContact = !!(user && d && (d.phone || d.email));
  const isDriver = !!(user && ride && d && user.id === d.id);
  const already = !!(user && ride && ride.passengerIds.includes(user.id));
  const full = !!(ride && ride.passengerIds.length >= ride.seatCount);
  const jr = ride?.myJoinRequest;
  const openJoin = !!(jr && (jr.status === 'pending' || jr.status === 'negotiating'));
  const canRequestJoin = !!(
    user &&
    ride &&
    d &&
    accountReady &&
    !isDriver &&
    !already &&
    !full &&
    !openJoin
  );

  const rideUpcoming = ride ? new Date(ride.when).getTime() > Date.now() : false;
  const showRideChat =
    !!user &&
    accountReady &&
    already &&
    !isDriver &&
    !!ride?.chatThreadId &&
    rideUpcoming;

  const submitJoinRequest = async () => {
    if (!user || !ride) {
      Alert.alert('Sign in', 'Sign in to request a seat.');
      return;
    }
    if (!accountReady) {
      Alert.alert('Verification', 'Finish email, phone, and CNIC verification before requesting a seat.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Verify', onPress: () => router.push('/verify-account') },
      ]);
      return;
    }
    const n = parseFloat(fareOffer.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Fare', 'Enter a positive fare you are willing to pay (e.g. 500).');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createJoinRequest(ride.id, n);
      setRide((prev) => (prev ? { ...prev, myJoinRequest: created } : prev));
      setFareOffer('');
      Alert.alert('Request sent', 'The driver will see your offer in their Inbox and can accept or counter.');
    } catch (e) {
      Alert.alert('Could not request', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  const runRiderAction = async (action: 'accept' | 'reject' | 'counter' | 'withdraw', counterFare?: number) => {
    if (!jr) return;
    setSubmitting(true);
    try {
      const updated = await api.riderJoinAction(jr.id, action, counterFare);
      await load();
      if (updated.chatThreadId) {
        await refreshThreads();
        openThread(updated.chatThreadId);
      }
      if (action === 'accept') {
        Alert.alert('You’re in', 'The driver accepted. Chat is open below.');
      }
    } catch (e) {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  const openCounterModal = () => {
    setCounterValue('');
    setCounterModal(true);
  };

  const submitCounter = async () => {
    const n = parseFloat(counterValue.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Fare', 'Enter a valid positive amount.');
      return;
    }
    setCounterModal(false);
    await runRiderAction('counter', n);
  };

  const openChat = async () => {
    if (ride?.chatThreadId) {
      await refreshThreads();
      openThread(ride.chatThreadId);
    }
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <Modal visible={counterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Counter offer (PKR)</Text>
            <TextInput
              value={counterValue}
              onChangeText={setCounterValue}
              keyboardType="decimal-pad"
              placeholder="e.g. 600"
              placeholderTextColor={Neon.muted}
              style={styles.modalInput}
            />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setCounterModal(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitCounter} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator size="large" color={Neon.accent} style={styles.loader} />
      ) : !ride ? (
        <Text style={styles.muted}>Ride not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.route}>
            {ride.from} → {ride.to}
          </Text>
          <Text style={styles.when}>{formatWhen(ride.when)}</Text>
          <Text style={styles.seats}>
            Seats {ride.passengerIds.length}/{ride.seatCount}
          </Text>

          {IS_MAP && region && ride.fromLat != null && ride.fromLng != null ? (
            <View style={styles.mapWrap}>
              <MapView
                style={styles.map}
                initialRegion={region}
                region={region}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}>
                <Marker
                  coordinate={{ latitude: ride.fromLat, longitude: ride.fromLng }}
                  title="Pickup"
                  pinColor="#4ade80"
                />
                {ride.toLat != null && ride.toLng != null ? (
                  <>
                    <Marker
                      coordinate={{ latitude: ride.toLat, longitude: ride.toLng }}
                      title="Drop-off"
                      pinColor="#c084fc"
                    />
                    <Polyline
                      coordinates={[
                        { latitude: ride.fromLat, longitude: ride.fromLng },
                        { latitude: ride.toLat, longitude: ride.toLng },
                      ]}
                      strokeColor={Neon.accent}
                      strokeWidth={3}
                    />
                  </>
                ) : null}
              </MapView>
            </View>
          ) : null}

          <Text style={styles.section}>Driver</Text>
          <View style={styles.driverCard}>
            {d?.avatarUrl ? (
              <Image source={{ uri: d.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]} />
            )}
            <View style={styles.driverText}>
              <Text style={styles.driverName}>{d?.name ?? 'Unknown'}</Text>
              {!user ? (
                <Text style={styles.hint}>Sign in to see phone, email, and CNIC to contact the driver.</Text>
              ) : canContact ? (
                <>
                  {d.phone ? (
                    <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(telUrl(d.phone!))}>
                      <Text style={styles.contactBtnText}>Call {d.phone}</Text>
                    </Pressable>
                  ) : null}
                  {d.email ? (
                    <Pressable
                      style={[styles.contactBtn, styles.contactBtnAlt]}
                      onPress={() => Linking.openURL(`mailto:${d.email}`)}>
                      <Text style={styles.contactBtnTextAlt}>Email driver</Text>
                    </Pressable>
                  ) : null}
                  {d.cnic ? (
                    <Text style={styles.cnic}>CNIC (verified at signup): {d.cnic}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.hint}>Contact details unavailable.</Text>
              )}
            </View>
          </View>

          {isDriver ? (
            <Text style={styles.badge}>
              You are driving this ride. Manage join requests and fares in the Inbox tab.
            </Text>
          ) : null}

          {already && !isDriver ? (
            <>
              <Text style={styles.badge}>You’re on this ride.</Text>
              {showRideChat ? (
                <Pressable onPress={openChat} style={styles.chatBtn}>
                  <Text style={styles.chatBtnText}>Open ride chat</Text>
                </Pressable>
              ) : ride.chatThreadId && !rideUpcoming ? (
                <Text style={styles.hint}>Chat closed — this ride time has passed.</Text>
              ) : !accountReady && ride.chatThreadId ? (
                <Text style={styles.hint}>Verify your account to use ride chat.</Text>
              ) : null}
            </>
          ) : null}

          {full && !already && !isDriver ? <Text style={styles.badge}>This ride is full</Text> : null}

          {canRequestJoin ? (
            <View style={styles.joinBox}>
              <Text style={styles.section}>Request a seat</Text>
              <Text style={styles.hint}>
                Offer a fare. The driver gets a notification and can accept or counter until you both agree.
              </Text>
              <TextInput
                value={fareOffer}
                onChangeText={setFareOffer}
                keyboardType="decimal-pad"
                placeholder="Your fare offer (PKR)"
                placeholderTextColor={Neon.muted}
                style={styles.input}
              />
              <Pressable
                onPress={submitJoinRequest}
                disabled={submitting}
                style={({ pressed }) => [styles.join, pressed && styles.joinPressed]}>
                <Text style={styles.joinText}>{submitting ? 'Sending…' : 'Send join request'}</Text>
              </Pressable>
            </View>
          ) : null}

          {user && !accountReady && !isDriver && !already && !full ? (
            <Pressable onPress={() => router.push('/verify-account')} style={styles.verifyBanner}>
              <Text style={styles.verifyBannerText}>Verify your account to request a seat →</Text>
            </Pressable>
          ) : null}

          {jr && openJoin && !isDriver ? (
            <View style={styles.negBox}>
              <Text style={styles.section}>Your join request</Text>
              <Text style={styles.negMeta}>
                Status: {jr.status} · Current fare: PKR {jr.currentFare} · Last move: {jr.proposedBy}
              </Text>
              {jr.proposedBy === 'driver' ? (
                <>
                  <Text style={styles.hint}>The driver proposed a fare. Accept it or counter.</Text>
                  <View style={styles.row}>
                    <Pressable
                      disabled={submitting}
                      onPress={() => runRiderAction('accept')}
                      style={styles.smallBtn}>
                      <Text style={styles.smallBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      disabled={submitting}
                      onPress={openCounterModal}
                      style={styles.smallBtnAlt}>
                      <Text style={styles.smallBtnAltText}>Counter</Text>
                    </Pressable>
                    <Pressable
                      disabled={submitting}
                      onPress={() => runRiderAction('withdraw')}
                      style={styles.smallBtnGhost}>
                      <Text style={styles.smallBtnGhostText}>Withdraw</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.hint}>Waiting for the driver to accept or counter your offer.</Text>
              )}
            </View>
          ) : null}

          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  loader: { marginTop: 80 },
  muted: { color: Neon.muted, padding: 24 },
  scroll: { padding: 20, paddingTop: 16, paddingBottom: 120 },
  route: { fontSize: 22, fontWeight: '800', color: Neon.text, marginBottom: 8 },
  when: { color: Neon.muted, fontSize: 16, marginBottom: 4 },
  seats: { color: Neon.accentSoft, marginBottom: 16 },
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  map: { ...StyleSheet.absoluteFillObject },
  section: { fontSize: 18, fontWeight: '700', color: Neon.text, marginBottom: 10 },
  driverCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 20,
  },
  avatar: { width: 72, height: 72, borderRadius: 16, borderWidth: 1, borderColor: Neon.border },
  avatarPh: { backgroundColor: 'rgba(168,85,247,0.2)' },
  driverText: { flex: 1 },
  driverName: { fontSize: 18, fontWeight: '700', color: Neon.text, marginBottom: 8 },
  hint: { color: Neon.muted, fontSize: 14, lineHeight: 20 },
  cnic: { color: Neon.muted, fontSize: 13, marginTop: 8 },
  contactBtn: {
    backgroundColor: 'rgba(168,85,247,0.35)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  contactBtnAlt: {
    backgroundColor: 'rgba(129,140,248,0.25)',
  },
  contactBtnText: { color: Neon.text, fontWeight: '700' },
  contactBtnTextAlt: { color: Neon.accentBlue, fontWeight: '700' },
  joinBox: { marginBottom: 20 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Neon.text,
    fontSize: 16,
    marginBottom: 12,
  },
  join: {
    backgroundColor: Neon.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  joinPressed: { opacity: 0.9 },
  joinText: { color: Neon.onAccent, fontWeight: '800', fontSize: 16 },
  badge: { color: Neon.accentSoft, marginBottom: 12, fontWeight: '600', lineHeight: 22 },
  chatBtn: {
    borderWidth: 1,
    borderColor: Neon.border,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(129,140,248,0.2)',
  },
  chatBtnText: { color: Neon.accentBlue, fontWeight: '700' },
  verifyBanner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Neon.accent,
    marginBottom: 16,
  },
  verifyBannerText: { color: Neon.accent, fontWeight: '700', textAlign: 'center' },
  negBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 20,
  },
  negMeta: { color: Neon.muted, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Neon.accent,
  },
  smallBtnText: { color: Neon.onAccent, fontWeight: '800' },
  smallBtnAlt: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(168,85,247,0.25)',
  },
  smallBtnAltText: { color: Neon.text, fontWeight: '700' },
  smallBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  smallBtnGhostText: { color: Neon.muted, fontWeight: '600' },
  back: { marginTop: 8 },
  backText: { color: Neon.accentBlue, fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: Neon.bgElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  modalTitle: { color: Neon.text, fontWeight: '800', fontSize: 17, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 12,
    padding: 14,
    color: Neon.text,
    fontSize: 16,
    marginBottom: 16,
  },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: Neon.muted, fontWeight: '600' },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Neon.accent,
  },
  modalBtnText: { color: Neon.onAccent, fontWeight: '800' },
});
