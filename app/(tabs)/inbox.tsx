import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import * as api from '@/lib/api';
import { rideDetailHref } from '@/lib/rideHref';
import type { JoinRequestSummary } from '@/lib/types';

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { openThread, refreshThreads } = useChat();
  const [list, setList] = useState<JoinRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterModal, setCounterModal] = useState<{ jr: JoinRequestSummary } | null>(null);
  const [counterVal, setCounterVal] = useState('');

  const load = useCallback(async () => {
    if (!user?.accountReady) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.fetchDriverJoinRequests();
      setList(data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [user?.accountReady]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const act = async (jr: JoinRequestSummary, action: 'accept' | 'reject' | 'counter', fare?: number) => {
    setBusyId(jr.id);
    try {
      const updated = await api.driverJoinAction(jr.id, action, fare);
      await load();
      if (updated.chatThreadId) {
        await refreshThreads();
        openThread(updated.chatThreadId);
      }
      if (action === 'accept') {
        Alert.alert('Accepted', 'They are now on this ride.');
      }
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const submitCounter = async () => {
    if (!counterModal) return;
    const n = parseFloat(counterVal.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Fare', 'Enter a valid amount.');
      return;
    }
    const jr = counterModal.jr;
    setCounterModal(null);
    await act(jr, 'counter', n);
  };

  if (!user) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <Text style={styles.muted}>Sign in to see join requests for your rides.</Text>
      </LinearGradient>
    );
  }

  if (!user.accountReady) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <Text style={styles.muted}>Complete account verification to manage join requests.</Text>
        <Pressable onPress={() => router.push('/verify-account')} style={styles.link}>
          <Text style={styles.linkText}>Go to verification</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <Modal visible={!!counterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Your counter (PKR)</Text>
            <TextInput
              value={counterVal}
              onChangeText={setCounterVal}
              keyboardType="decimal-pad"
              placeholder="e.g. 650"
              placeholderTextColor={Neon.muted}
              style={styles.modalInput}
            />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setCounterModal(null)} style={styles.modalGhost}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitCounter} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Inbox</Text>
        <Text style={styles.sub}>People requesting a seat on your rides — accept, counter, or reject.</Text>
        {loading ? (
          <ActivityIndicator size="large" color={Neon.accent} style={styles.loader} />
        ) : list.length === 0 ? (
          <Text style={styles.muted}>No open join requests. When someone offers a fare, it will show here.</Text>
        ) : (
          list.map((jr) => {
            const busy = busyId === jr.id;
            const route = jr.ride ? `${jr.ride.from} → ${jr.ride.to}` : 'Ride';
            return (
              <View key={jr.id} style={styles.card}>
                <Text style={styles.route}>{route}</Text>
                <Text style={styles.meta}>
                  {jr.rider?.name ?? 'Rider'} · PKR {jr.currentFare} ·{' '}
                  {jr.proposedBy === 'rider' ? 'Waiting on you (driver)' : 'Waiting on rider'}
                </Text>
                <Text style={styles.status}>Status: {jr.status}</Text>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => jr.ride && router.push(rideDetailHref(jr.ride.id))}
                    style={styles.linkChip}>
                    <Text style={styles.linkChipText}>View ride</Text>
                  </Pressable>
                </View>
                {jr.proposedBy === 'rider' ? (
                  <View style={styles.row}>
                    <Pressable
                      disabled={busy}
                      onPress={() => act(jr, 'accept')}
                      style={styles.btn}>
                      <Text style={styles.btnText}>{busy ? '…' : 'Accept'}</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        setCounterVal('');
                        setCounterModal({ jr });
                      }}
                      style={styles.btnAlt}>
                      <Text style={styles.btnAltText}>Counter</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => act(jr, 'reject')} style={styles.btnGhost}>
                      <Text style={styles.btnGhostText}>Reject</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.wait}>Waiting for the rider to respond to your counter.</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { padding: 20, paddingTop: 56, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '800', color: Neon.text, marginBottom: 8 },
  sub: { color: Neon.muted, fontSize: 15, lineHeight: 22, marginBottom: 20 },
  loader: { marginTop: 40 },
  muted: { color: Neon.muted, fontSize: 16, padding: 20 },
  link: { padding: 16 },
  linkText: { color: Neon.accentBlue, fontWeight: '700' },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  route: { color: Neon.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
  meta: { color: Neon.accentSoft, marginBottom: 4 },
  status: { color: Neon.muted, fontSize: 13, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Neon.accent,
  },
  btnText: { color: Neon.onAccent, fontWeight: '800' },
  btnAlt: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
    backgroundColor: 'rgba(168,85,247,0.25)',
  },
  btnAltText: { color: Neon.text, fontWeight: '700' },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
  },
  btnGhostText: { color: Neon.muted, fontWeight: '600' },
  wait: { color: Neon.muted, marginTop: 8, fontSize: 14 },
  linkChip: { alignSelf: 'flex-start', marginBottom: 4 },
  linkChipText: { color: Neon.accentBlue, fontWeight: '600' },
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
  modalTitle: { color: Neon.text, fontWeight: '800', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 12,
    padding: 14,
    color: Neon.text,
    marginBottom: 16,
  },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalGhost: { padding: 10 },
  modalGhostText: { color: Neon.muted },
  modalBtn: { backgroundColor: Neon.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  modalBtnText: { color: Neon.onAccent, fontWeight: '800' },
});
