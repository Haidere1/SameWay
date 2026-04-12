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

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';

type Mode = 'pickup' | 'dropoff';

const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';

function defaultDeparture(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(d.getHours() + 2);
  return d;
}

function mergeDatePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return n;
}

function mergeTimePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return n;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function formatWhenLabel(d: Date): string {
  try {
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

function toDatetimeLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function reverseLabel(lat: number, lng: number): Promise<string> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const parts = [a.street, a.streetNumber, a.district, a.city, a.region].filter(Boolean);
    if (parts.length) return parts.join(', ');
  } catch {
    /* ignore */
  }
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
  /** Web-only editable datetime (native uses pickers). */
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
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const p = { lat, lng };
        const d = { lat: lat + 0.04, lng: lng + 0.04 };
        setPickup(p);
        setDropoff(d);
        const [la, lb] = await Promise.all([reverseLabel(p.lat, p.lng), reverseLabel(d.lat, d.lng)]);
        if (alive) {
          setFrom(la);
          setTo(lb);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const region = useMemo(() => {
    if (pickup) {
      return {
        latitude: pickup.lat,
        longitude: pickup.lng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      };
    }
    return {
      latitude: 24.86,
      longitude: 67.0,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    };
  }, [pickup]);

  const onMapPress = async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    if (mode === 'pickup') {
      setPickup({ lat: latitude, lng: longitude });
      setFrom(await reverseLabel(latitude, longitude));
    } else {
      setDropoff({ lat: latitude, lng: longitude });
      setTo(await reverseLabel(latitude, longitude));
    }
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Sign in', 'You need an account to offer a ride.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    if (user.accountReady === false) {
      Alert.alert('Verification', 'Finish email, phone, and CNIC card steps before offering a ride.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: () => router.push('/verify-account') },
      ]);
      return;
    }
    if (!pickup || !dropoff) {
      Alert.alert('Map', 'Set pickup and drop-off on the map (tap where each should be).');
      return;
    }
    const n = parseInt(seats, 10);
    if (!from.trim() || !to.trim()) {
      Alert.alert('Missing fields', 'Fill in from and to (map updates addresses — you can edit text).');
      return;
    }
    let d: Date;
    if (Platform.OS === 'web') {
      d = new Date(whenWeb.trim());
      if (Number.isNaN(d.getTime())) {
        Alert.alert('Invalid date', 'Use the date/time field (local format) or pick date on iOS/Android.');
        return;
      }
      if (d.getTime() <= Date.now()) {
        Alert.alert('When', 'Choose a date and time in the future.');
        return;
      }
    } else {
      d = departure;
      if (d.getTime() <= Date.now()) {
        Alert.alert('When', 'Choose a date and time in the future.');
        return;
      }
    }
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('Seats', 'Enter at least 1 passenger seat.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createRide({
        from: from.trim(),
        to: to.trim(),
        when: d.toISOString(),
        seatCount: n,
        fromLat: pickup.lat,
        fromLng: pickup.lng,
        toLat: dropoff.lat,
        toLng: dropoff.lng,
      });
      setDeparture(defaultDeparture());
      if (Platform.OS === 'web') setWhenWeb(toDatetimeLocalString(defaultDeparture()));
      setSeats('3');
      Alert.alert('Ride posted', 'Others can see it on the home map and list.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/verification|CNIC|ACCOUNT_INCOMPLETE/i.test(msg)) {
        Alert.alert('Verification required', msg, [
          { text: 'OK', onPress: () => router.push('/verify-account') },
        ]);
      } else {
        Alert.alert('Error', msg || 'Could not create ride');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: departure,
        mode: 'date',
        display: 'calendar',
        minimumDate: startOfToday(),
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return;
          setDeparture((prev) => mergeDatePart(prev, date));
        },
      });
      return;
    }
    if (Platform.OS === 'ios') setIosPicker('date');
  };

  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: departure,
        mode: 'time',
        is24Hour: false,
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return;
          setDeparture((prev) => mergeTimePart(prev, date));
        },
      });
      return;
    }
    if (Platform.OS === 'ios') setIosPicker('time');
  };

  const onIosPickerChange = (_: unknown, date?: Date) => {
    if (!date) return;
    setDeparture((prev) => (iosPicker === 'time' ? mergeTimePart(prev, date) : mergeDatePart(prev, date)));
  };

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Offer a ride</Text>
          <Text style={styles.hint}>
            Tap the map to place pickup (green) or drop-off (violet). Switch mode below, then tap.
          </Text>
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
                {dropoff ? (
                  <Marker
                    coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
                    title="Drop-off"
                    pinColor="#c084fc"
                  />
                ) : null}
                {pickup && dropoff ? (
                  <Polyline
                    coordinates={[
                      { latitude: pickup.lat, longitude: pickup.lng },
                      { latitude: dropoff.lat, longitude: dropoff.lng },
                    ]}
                    strokeColor={Neon.accent}
                    strokeWidth={3}
                  />
                ) : null}
              </MapView>
            </View>
          ) : (
            <Text style={styles.webNote}>Map placement works on iOS/Android in Expo Go.</Text>
          )}
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setMode('pickup')}
              style={[styles.modeBtn, mode === 'pickup' && styles.modeBtnOn]}>
              <Text style={[styles.modeText, mode === 'pickup' && styles.modeTextOn]}>Pickup pin</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('dropoff')}
              style={[styles.modeBtn, mode === 'dropoff' && styles.modeBtnOn]}>
              <Text style={[styles.modeText, mode === 'dropoff' && styles.modeTextOn]}>Drop-off pin</Text>
            </Pressable>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>From (pickup)</Text>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="Address or area"
              placeholderTextColor={Neon.muted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>To (destination)</Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="Address or area"
              placeholderTextColor={Neon.muted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>When</Text>
            {Platform.OS === 'web' ? (
              <TextInput
                // @ts-expect-error RN Web forwards `type` to the DOM input for a browser calendar.
                type="datetime-local"
                value={whenWeb}
                onChangeText={setWhenWeb}
                placeholder="2026-04-15T09:00"
                placeholderTextColor={Neon.muted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : (
              <>
                <Text style={styles.whenSummary}>{formatWhenLabel(departure)}</Text>
                <View style={styles.whenRow}>
                  <Pressable onPress={openDatePicker} style={({ pressed }) => [styles.whenBtn, pressed && styles.whenBtnPressed]}>
                    <Text style={styles.whenBtnText}>📅 Date</Text>
                  </Pressable>
                  <Pressable onPress={openTimePicker} style={({ pressed }) => [styles.whenBtn, pressed && styles.whenBtnPressed]}>
                    <Text style={styles.whenBtnText}>🕐 Time</Text>
                  </Pressable>
                </View>
                <Text style={styles.whenHint}>Pick a day on the calendar, then set the time.</Text>
              </>
            )}
          </View>
          {Platform.OS === 'ios' && iosPicker ? (
            <Modal transparent animationType="fade" visible onRequestClose={() => setIosPicker(null)}>
              <View style={styles.modalRoot}>
                <Pressable style={styles.modalBackdrop} onPress={() => setIosPicker(null)} />
                <View style={styles.modalSheet}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{iosPicker === 'date' ? 'Select date' : 'Select time'}</Text>
                    <Pressable onPress={() => setIosPicker(null)} hitSlop={12}>
                      <Text style={styles.modalDoneLink}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={departure}
                    mode={iosPicker}
                    display={iosPicker === 'date' ? 'inline' : 'spinner'}
                    minimumDate={iosPicker === 'date' ? startOfToday() : undefined}
                    onChange={onIosPickerChange}
                    themeVariant="dark"
                  />
                </View>
              </View>
            </Modal>
          ) : null}
          <View style={styles.field}>
            <Text style={styles.label}>Passenger seats</Text>
            <TextInput
              value={seats}
              onChangeText={setSeats}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={Neon.muted}
              style={styles.input}
            />
          </View>
          <Pressable
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}>
            <Text style={styles.submitText}>{submitting ? 'Posting…' : 'Post ride'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Neon.text,
    marginBottom: 8,
  },
  hint: {
    color: Neon.muted,
    fontSize: 14,
    marginBottom: 14,
    lineHeight: 20,
  },
  mapWrap: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  map: { ...StyleSheet.absoluteFillObject },
  webNote: { color: Neon.muted, marginBottom: 16 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modeBtnOn: {
    borderColor: Neon.accent,
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  modeText: { color: Neon.muted, fontWeight: '600' },
  modeTextOn: { color: Neon.text },
  field: { marginBottom: 16 },
  label: {
    color: Neon.accentSoft,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Neon.text,
    fontSize: 16,
  },
  whenSummary: {
    color: Neon.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  whenHint: { color: Neon.muted, fontSize: 13, marginTop: 8, lineHeight: 18 },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  whenBtnPressed: { opacity: 0.88 },
  whenBtnText: { color: Neon.accentSoft, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: Neon.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 4,
  },
  modalTitle: { color: Neon.text, fontWeight: '800', fontSize: 17 },
  modalDoneLink: { color: Neon.accentBlue, fontWeight: '700', fontSize: 16 },
  submit: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: Neon.accent,
  },
  submitPressed: { opacity: 0.92 },
  submitText: {
    color: Neon.onAccent,
    fontWeight: '800',
    fontSize: 17,
  },
});
