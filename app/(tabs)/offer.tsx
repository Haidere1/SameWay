import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import * as api from '@/lib/api';

type Mode = 'pickup' | 'dropoff';
const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';

function defaultDeparture(): Date {
  const d = new Date(); d.setSeconds(0, 0); d.setMinutes(0); d.setHours(d.getHours() + 2); return d;
}
function mergeDatePart(base: Date, picked: Date): Date {
  const n = new Date(base); n.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate()); return n;
}
function mergeTimePart(base: Date, picked: Date): Date {
  const n = new Date(base); n.setHours(picked.getHours(), picked.getMinutes(), 0, 0); return n;
}
function startOfToday(): Date { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function formatWhenLabel(d: Date): string {
  try { return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d.toISOString(); }
}
function toDatetimeLocalString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function reverseLabel(lat: number, lng: number): Promise<string> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const parts = [a.street, a.streetNumber, a.district, a.city, a.region].filter(Boolean);
    if (parts.length) return parts.join(', ');
  } catch { /* ignore */ }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export default function OfferScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('pickup');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departure, setDeparture] = useState(defaultDeparture);
  const [whenWeb, setWhenWeb] = useState(() => toDatetimeLocalString(defaultDeparture()));
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  const [seats, setSeats] = useState('3');
  const [submitting, setSubmitting] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive || status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const p = { lat, lng }, d = { lat: lat + 0.04, lng: lng + 0.04 };
        setPickup(p); setDropoff(d);
        const [la, lb] = await Promise.all([reverseLabel(p.lat, p.lng), reverseLabel(d.lat, d.lng)]);
        if (alive) { setFrom(la); setTo(lb); }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const region = useMemo(() => {
    if (pickup) return { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 };
    return { latitude: 24.86, longitude: 67.0, latitudeDelta: 0.3, longitudeDelta: 0.3 };
  }, [pickup]);

  const onMapPress = async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (mode === 'pickup') { setPickup({ lat: latitude, lng: longitude }); setFrom(await reverseLabel(latitude, longitude)); }
    else { setDropoff({ lat: latitude, lng: longitude }); setTo(await reverseLabel(latitude, longitude)); }
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'You need an account to offer a ride.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Sign in', onPress: () => router.push('/login') },
      ]); return;
    }
    if (user.accountReady === false) {
      Alert.alert('Verification required', 'Finish verification before offering a ride.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Verify', onPress: () => router.push('/verify-account') },
      ]); return;
    }
    if (!pickup || !dropoff) { Alert.alert('Map required', 'Set pickup and drop-off pins on the map.'); return; }
    if (!from.trim() || !to.trim()) { Alert.alert('Missing fields', 'Fill in from and to addresses.'); return; }
    const n = parseInt(seats, 10);
    let d: Date;
    if (Platform.OS === 'web') {
      d = new Date(whenWeb.trim());
      if (Number.isNaN(d.getTime())) { Alert.alert('Invalid date', 'Pick a valid date and time.'); return; }
      if (d.getTime() <= Date.now()) { Alert.alert('Time error', 'Choose a future date and time.'); return; }
    } else {
      d = departure;
      if (d.getTime() <= Date.now()) { Alert.alert('Time error', 'Choose a future date and time.'); return; }
    }
    if (!Number.isFinite(n) || n < 1) { Alert.alert('Seats', 'Enter at least 1 passenger seat.'); return; }
    setSubmitting(true);
    try {
      await api.createRide({ from: from.trim(), to: to.trim(), when: d.toISOString(), seatCount: n, fromLat: pickup.lat, fromLng: pickup.lng, toLat: dropoff.lat, toLng: dropoff.lng });
      setDeparture(defaultDeparture());
      if (Platform.OS === 'web') setWhenWeb(toDatetimeLocalString(defaultDeparture()));
      setSeats('3');
      Alert.alert('Ride posted', 'Your ride is now live on the map.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/verification|CNIC|ACCOUNT_INCOMPLETE/i.test(msg)) {
        Alert.alert('Verification required', msg, [{ text: 'OK', onPress: () => router.push('/verify-account') }]);
      } else { Alert.alert('Error', msg || 'Could not create ride'); }
    } finally { setSubmitting(false); }
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: departure, mode: 'date', display: 'calendar', minimumDate: startOfToday(), onChange: (e, date) => { if (e.type !== 'set' || !date) return; setDeparture((prev) => mergeDatePart(prev, date)); } });
      return;
    }
    if (Platform.OS === 'ios') setIosPicker('date');
  };
  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: departure, mode: 'time', is24Hour: false, onChange: (e, date) => { if (e.type !== 'set' || !date) return; setDeparture((prev) => mergeTimePart(prev, date)); } });
      return;
    }
    if (Platform.OS === 'ios') setIosPicker('time');
  };
  const onIosPickerChange = (_: unknown, date?: Date) => {
    if (!date) return;
    setDeparture((prev) => (iosPicker === 'time' ? mergeTimePart(prev, date) : mergeDatePart(prev, date)));
  };

  const canPost = !!(from.trim() && to.trim() && pickup && dropoff && parseInt(seats, 10) >= 1);

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.headerLabel}>DRIVER MODE</Text>
            <Text style={styles.headerTitle}>OFFER A <Text style={styles.headerAccent}>RIDE</Text></Text>
            <Text style={styles.headerSub}>Pin your route, set a time, and let riders come to you.</Text>
          </View>

          {/* MAP SECTION */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>ROUTE MAP</Text>
            <View style={styles.sectionLine} />
          </View>

          {IS_MAP && pickup ? (
            <View style={styles.mapWrap}>
              <MapView
                style={styles.map}
                initialRegion={region}
                region={region}
                onMapReady={() => setMapReady(true)}
                onPress={mapReady ? onMapPress : undefined}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                showsUserLocation>
                <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" pinColor="#4ade80" />
                {dropoff && <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} title="Drop-off" pinColor={Neon.accent} />}
                {pickup && dropoff && (
                  <Polyline
                    coordinates={[{ latitude: pickup.lat, longitude: pickup.lng }, { latitude: dropoff.lat, longitude: dropoff.lng }]}
                    strokeColor={Neon.accent} strokeWidth={3}
                  />
                )}
              </MapView>
              <View style={styles.mapOverlay}>
                <View style={styles.mapLegendRow}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} /><Text style={styles.legendText}>Pickup</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Neon.accent }]} /><Text style={styles.legendText}>Drop-off</Text></View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.mapFallbackIcon}>🗺</Text>
              <Text style={styles.mapFallbackText}>Map available on iOS & Android</Text>
            </View>
          )}

          {/* PIN MODE TOGGLE */}
          <View style={styles.modeRow}>
            <Pressable onPress={() => setMode('pickup')} style={[styles.modeBtn, mode === 'pickup' && styles.modeBtnActive]}>
              <View style={[styles.modeDot, { backgroundColor: '#4ade80' }]} />
              <Text style={[styles.modeBtnText, mode === 'pickup' && styles.modeBtnTextActive]}>PICKUP PIN</Text>
              {mode === 'pickup' && <View style={styles.modeActiveLine} />}
            </Pressable>
            <Pressable onPress={() => setMode('dropoff')} style={[styles.modeBtn, mode === 'dropoff' && styles.modeBtnActive]}>
              <View style={[styles.modeDot, { backgroundColor: Neon.accent }]} />
              <Text style={[styles.modeBtnText, mode === 'dropoff' && styles.modeBtnTextActive]}>DROP-OFF PIN</Text>
              {mode === 'dropoff' && <View style={[styles.modeActiveLine, { backgroundColor: Neon.accent }]} />}
            </Pressable>
          </View>

          {/* ROUTE FIELDS */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>ROUTE DETAILS</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.routeCard}>
            <View style={styles.routeInputRow}>
              <View style={styles.routeIconCol}>
                <View style={styles.routeDotGreen} />
                <View style={styles.routeVertLine} />
                <View style={styles.routeDotRed} />
              </View>
              <View style={styles.routeInputCol}>
                <View style={styles.routeInputWrap}>
                  <Text style={styles.routeInputLabel}>FROM</Text>
                  <TextInput
                    value={from} onChangeText={setFrom}
                    placeholder="Pickup location"
                    placeholderTextColor={Neon.muted}
                    style={styles.routeInput}
                  />
                </View>
                <View style={styles.routeInputDivider} />
                <View style={styles.routeInputWrap}>
                  <Text style={styles.routeInputLabel}>TO</Text>
                  <TextInput
                    value={to} onChangeText={setTo}
                    placeholder="Drop-off destination"
                    placeholderTextColor={Neon.muted}
                    style={styles.routeInput}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* DEPARTURE */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>DEPARTURE</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.depCard}>
            <Text style={styles.depValue}>{formatWhenLabel(departure)}</Text>
            {Platform.OS === 'web' ? (
              <TextInput
                // @ts-expect-error RN Web forwards type to DOM
                type="datetime-local"
                value={whenWeb}
                onChangeText={setWhenWeb}
                placeholderTextColor={Neon.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : (
              <View style={styles.depBtnRow}>
                <Pressable onPress={openDatePicker} style={({ pressed }) => [styles.depBtn, pressed && styles.depBtnPressed]}>
                  <Text style={styles.depBtnIcon}>📅</Text>
                  <Text style={styles.depBtnText}>DATE</Text>
                </Pressable>
                <Pressable onPress={openTimePicker} style={({ pressed }) => [styles.depBtn, pressed && styles.depBtnPressed]}>
                  <Text style={styles.depBtnIcon}>🕐</Text>
                  <Text style={styles.depBtnText}>TIME</Text>
                </Pressable>
              </View>
            )}
          </View>

          {Platform.OS === 'ios' && iosPicker ? (
            <Modal transparent animationType="slide" visible onRequestClose={() => setIosPicker(null)}>
              <View style={styles.pickerRoot}>
                <Pressable style={styles.pickerBackdrop} onPress={() => setIosPicker(null)} />
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerHeader}>
                    <View style={styles.pickerPill} />
                    <Text style={styles.pickerTitle}>{iosPicker === 'date' ? 'Select Date' : 'Select Time'}</Text>
                    <Pressable onPress={() => setIosPicker(null)} style={styles.pickerDoneBtn}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={departure} mode={iosPicker}
                    display={iosPicker === 'date' ? 'inline' : 'spinner'}
                    minimumDate={iosPicker === 'date' ? startOfToday() : undefined}
                    onChange={onIosPickerChange} themeVariant="dark"
                  />
                </View>
              </View>
            </Modal>
          ) : null}

          {/* SEATS */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>PASSENGER SEATS</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.seatsCard}>
            <View style={styles.seatsRow}>
              {['1', '2', '3', '4', '5', '6'].map((n) => (
                <Pressable key={n} onPress={() => setSeats(n)} style={[styles.seatChip, seats === n && styles.seatChipOn]}>
                  <Text style={[styles.seatChipText, seats === n && styles.seatChipTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={seats} onChangeText={setSeats}
              keyboardType="number-pad"
              placeholder="Or type custom number"
              placeholderTextColor={Neon.muted}
              style={styles.seatsInput}
            />
          </View>

          {/* SUBMIT */}
          <Pressable
            onPress={submit}
            disabled={submitting || !canPost}
            style={({ pressed }) => [styles.submitBtn, (!canPost || submitting) && styles.submitBtnDisabled, pressed && canPost && styles.submitBtnPressed]}>
            <LinearGradient
              colors={canPost && !submitting ? [Neon.accent, '#c01920'] : ['#3f3f46', '#27272a']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.submitGrad}>
              <Text style={styles.submitText}>{submitting ? 'POSTING RIDE…' : 'POST RIDE'}</Text>
              {!submitting && canPost && <Text style={styles.submitArrow}>›</Text>}
            </LinearGradient>
          </Pressable>

          {!canPost && !submitting && (
            <Text style={styles.submitHint}>Set both map pins and fill in all fields to post.</Text>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingBottom: 120 },

  header: { paddingTop: 64, paddingHorizontal: 22, paddingBottom: 24 },
  headerLabel: { color: Neon.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 40, fontWeight: '900', color: Neon.text, letterSpacing: -1, lineHeight: 44, marginBottom: 8 },
  headerAccent: { color: Neon.accent },
  headerSub: { color: Neon.muted, fontSize: 14, lineHeight: 20 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, marginBottom: 12, marginTop: 8 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  /* MAP */
  mapWrap: {
    marginHorizontal: 22, height: 250, borderRadius: 18,
    overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.3)',
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  mapLegendRow: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(13,13,15,0.85)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Neon.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Neon.accentSoft, fontSize: 11, fontWeight: '600' },
  mapFallback: {
    marginHorizontal: 22, height: 100, borderRadius: 18,
    borderWidth: 1, borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
  },
  mapFallbackIcon: { fontSize: 24 },
  mapFallbackText: { color: Neon.muted, fontSize: 13 },

  /* MODE TOGGLE */
  modeRow: { flexDirection: 'row', marginHorizontal: 22, marginBottom: 20, gap: 10 },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden',
  },
  modeBtnActive: { borderColor: 'rgba(232,33,39,0.4)', backgroundColor: 'rgba(232,33,39,0.08)' },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modeBtnText: { color: Neon.muted, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  modeBtnTextActive: { color: Neon.text },
  modeActiveLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: '#4ade80' },

  /* ROUTE CARD */
  routeCard: {
    marginHorizontal: 22, marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border, borderRadius: 18, overflow: 'hidden',
  },
  routeInputRow: { flexDirection: 'row', padding: 16, gap: 14 },
  routeIconCol: { alignItems: 'center', paddingTop: 18, gap: 0 },
  routeDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.4)' },
  routeVertLine: { width: 1.5, flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },
  routeDotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: Neon.accent, borderWidth: 1.5, borderColor: 'rgba(232,33,39,0.4)' },
  routeInputCol: { flex: 1 },
  routeInputWrap: { paddingVertical: 10 },
  routeInputLabel: { color: Neon.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  routeInput: { color: Neon.text, fontSize: 15, fontWeight: '600' },
  routeInputDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },

  /* DEPARTURE */
  depCard: {
    marginHorizontal: 22, marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border, borderRadius: 18, padding: 16,
  },
  depValue: { color: Neon.text, fontSize: 16, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  depBtnRow: { flexDirection: 'row', gap: 10 },
  depBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)',
    backgroundColor: 'rgba(232,33,39,0.06)',
  },
  depBtnPressed: { opacity: 0.8 },
  depBtnIcon: { fontSize: 16 },
  depBtnText: { color: Neon.accentSoft, fontWeight: '800', fontSize: 12, letterSpacing: 1 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: Neon.text, fontSize: 15,
  },

  /* iOS PICKER MODAL */
  pickerRoot: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: {
    backgroundColor: Neon.bgElevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 30, borderWidth: 1, borderColor: 'rgba(232,33,39,0.2)',
  },
  pickerHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  pickerPill: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 14 },
  pickerTitle: { color: Neon.text, fontWeight: '900', fontSize: 16, marginBottom: 4, textAlign: 'center' },
  pickerDoneBtn: { alignSelf: 'flex-end', marginTop: -28 },
  pickerDoneText: { color: Neon.accent, fontWeight: '700', fontSize: 16 },

  /* SEATS */
  seatsCard: {
    marginHorizontal: 22, marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border, borderRadius: 18, padding: 16,
  },
  seatsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  seatChip: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Neon.border, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  seatChipOn: { borderColor: Neon.accent, backgroundColor: 'rgba(232,33,39,0.15)' },
  seatChipText: { color: Neon.muted, fontWeight: '800', fontSize: 16 },
  seatChipTextOn: { color: Neon.accent },
  seatsInput: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12, color: Neon.muted, fontSize: 13,
  },

  /* SUBMIT */
  submitBtn: { marginHorizontal: 22, borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnPressed: { opacity: 0.9 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 17, gap: 8 },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1.5 },
  submitArrow: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 26 },
  submitHint: { color: Neon.muted, fontSize: 12, textAlign: 'center', marginHorizontal: 22 },
});
