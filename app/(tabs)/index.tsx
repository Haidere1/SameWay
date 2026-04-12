import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { RideCard } from '@/components/RideCard';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';
import { rideDetailHref } from '@/lib/rideHref';
import type { Ride } from '@/lib/types';

const IS_MAP = Platform.OS === 'ios' || Platform.OS === 'android';

export default function RidesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);

  const load = useCallback(async (coords: { lat: number; lng: number } | null) => {
    const data = coords
      ? await api.fetchRides(coords.lat, coords.lng)
      : await api.fetchRides();
    setRides(data);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let coords: { lat: number; lng: number } | null = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setLocNote('Location off — showing all upcoming rides. Enable location for “near you” sorting.');
      } else {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (alive) setLoc(coords);
        } catch {
          if (alive) {
            setLocNote('Could not read GPS. Showing all upcoming rides.');
          }
        }
      }
      try {
        await load(coords);
      } catch (e) {
        if (alive) {
          Alert.alert('Error', e instanceof Error ? e.message : 'Could not load rides');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      let coords = loc;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLoc(coords);
      }
      await load(coords);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load rides');
    } finally {
      setRefreshing(false);
    }
  }, [load, loc]);

  const mapRegion = useMemo(() => {
    if (loc) {
      return {
        latitude: loc.lat,
        longitude: loc.lng,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      };
    }
    const first = rides.find((r) => r.fromLat != null && r.fromLng != null);
    if (first?.fromLat != null && first?.fromLng != null) {
      return {
        latitude: first.fromLat,
        longitude: first.fromLng,
        latitudeDelta: 0.2,
        longitudeDelta: 0.2,
      };
    }
    return {
      latitude: 24.86,
      longitude: 67.0,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    };
  }, [loc, rides]);

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Neon.accent} />
        }>
        <Text style={styles.title}>SameWay</Text>
        <Text style={styles.tagline}>Share the road. Split the cost.</Text>
        <Text style={styles.intro}>
          Upcoming rides near you — open a ride to offer a fare; the driver is notified and can accept or counter in
          Inbox. After you agree, chat opens from the bottom bar.
        </Text>
        {locNote ? <Text style={styles.locNote}>{locNote}</Text> : null}
        {loading ? (
          <ActivityIndicator size="large" color={Neon.accent} style={styles.loader} />
        ) : (
          <>
            {IS_MAP ? (
              <View style={styles.mapWrap}>
                <MapView
                  style={styles.map}
                  initialRegion={mapRegion}
                  region={mapRegion}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  showsUserLocation={!!loc}>
                  {rides
                    .filter((r) => r.fromLat != null && r.fromLng != null)
                    .map((r) => (
                      <Marker
                        key={r.id}
                        coordinate={{ latitude: r.fromLat!, longitude: r.fromLng! }}
                        title={r.from}
                        description={`→ ${r.to}`}
                        onCalloutPress={() => router.push(rideDetailHref(r.id))}
                      />
                    ))}
                </MapView>
              </View>
            ) : (
              <Text style={styles.webMapNote}>Map is available on iOS and Android in Expo Go.</Text>
            )}
            <Text style={styles.sectionTitle}>Upcoming rides</Text>
            {rides.length === 0 ? (
              <Text style={styles.empty}>No rides yet. Offer one from the Offer tab.</Text>
            ) : (
              rides.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  currentUserId={user?.id ?? null}
                  onJoin={() => router.push(rideDetailHref(ride.id, { join: true }))}
                  onOpenDetail={() => router.push(rideDetailHref(ride.id))}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Neon.text,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 17,
    color: Neon.accentSoft,
    fontWeight: '600',
    marginBottom: 12,
  },
  intro: {
    fontSize: 15,
    color: Neon.muted,
    lineHeight: 22,
    marginBottom: 12,
  },
  locNote: {
    color: Neon.accent,
    fontSize: 13,
    marginBottom: 12,
  },
  loader: {
    marginTop: 48,
  },
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  webMapNote: {
    color: Neon.muted,
    marginBottom: 16,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Neon.text,
    marginBottom: 12,
  },
  empty: {
    color: Neon.muted,
    fontSize: 16,
    marginTop: 8,
  },
});
