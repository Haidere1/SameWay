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

import { AnimatedBackground } from '@/components/AnimatedBackground';
import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import * as api from '@/lib/api';
import { rideDetailHref } from '@/lib/rideHref';
import type { JoinRequestSummary } from '@/lib/types';

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#facc15',
  negotiating: '#60a5fa',
  accepted: '#4ade80',
  rejected: '#f87171',
};

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
    if (!user?.accountReady) { setList([]); setLoading(false); return; }
    setLoading(true);
    try { const data = await api.fetchDriverJoinRequests(); setList(data); }
    catch { setList([]); }
    finally { setLoading(false); }
  }, [user?.accountReady]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const act = async (jr: JoinRequestSummary, action: 'accept' | 'reject' | 'counter', fare?: number) => {
    setBusyId(jr.id);
    try {
      const updated = await api.driverJoinAction(jr.id, action, fare);
      await load();
      if (updated.chatThreadId) { await refreshThreads(); openThread(updated.chatThreadId); }
      if (action === 'accept') Alert.alert('Accepted', 'They are now on this ride.');
    } catch (e) { Alert.alert('Failed', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusyId(null); }
  };

  const submitCounter = async () => {
    if (!counterModal) return;
    const n = parseFloat(counterVal.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) { Alert.alert('Fare', 'Enter a valid amount.'); return; }
    const jr = counterModal.jr;
    setCounterModal(null);
    await act(jr, 'counter', n);
  };

  if (!user) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📬</Text>
          <Text style={styles.emptyTitle}>Sign in to view Inbox</Text>
          <Text style={styles.emptySub}>Join requests for your rides appear here.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.emptyBtn}>
            <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBtnGrad}>
              <Text style={styles.emptyBtnText}>SIGN IN</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  if (!user.accountReady) {
    return (
      <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>Verification Required</Text>
          <Text style={styles.emptySub}>Complete account verification to manage join requests.</Text>
          <Pressable onPress={() => router.push('/verify-account')} style={styles.emptyBtn}>
            <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyBtnGrad}>
              <Text style={styles.emptyBtnText}>VERIFY NOW</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[Neon.gradientStart, Neon.gradientMid, Neon.gradientEnd]} style={styles.bg}>
      <AnimatedBackground />

      {/* COUNTER MODAL */}
      <Modal visible={!!counterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Counter Offer</Text>
            <Text style={styles.modalSub}>Enter your fare in PKR</Text>
            <View style={styles.fareRow}>
              <Text style={styles.fareCurrency}>PKR</Text>
              <TextInput
                value={counterVal}
                onChangeText={setCounterVal}
                keyboardType="decimal-pad"
                placeholder="e.g. 650"
                placeholderTextColor={Neon.muted}
                style={styles.fareInput}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCounterModal(null)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submitCounter} style={styles.modalConfirm}>
                <LinearGradient colors={[Neon.accent, '#c01920']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalConfirmGrad}>
                  <Text style={styles.modalConfirmText}>SEND COUNTER</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerLabel}>DRIVER INBOX</Text>
              <Text style={styles.headerTitle}>Join Requests</Text>
            </View>
            {list.length > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{list.length}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSub}>Accept, counter, or reject passenger fare offers.</Text>
        </View>

        {/* DIVIDER */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Text style={styles.sectionTitle}>
            {loading ? 'LOADING' : list.length === 0 ? 'ALL CLEAR' : `${list.length} OPEN`}
          </Text>
          <View style={styles.sectionLine} />
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={Neon.accent} />
            <Text style={styles.loaderText}>Fetching requests…</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyListWrap}>
            <Text style={styles.emptyListIcon}>🎉</Text>
            <Text style={styles.emptyListTitle}>No open requests</Text>
            <Text style={styles.emptyListSub}>When riders offer a fare on your ride, it will appear here.</Text>
          </View>
        ) : (
          list.map((jr) => {
            const busy = busyId === jr.id;
            const statusColor = STATUS_COLOR[jr.status] ?? Neon.muted;
            const route = jr.ride ? `${jr.ride.from} → ${jr.ride.to}` : 'Ride';
            const waitingOnMe = jr.proposedBy === 'rider';

            return (
              <View key={jr.id} style={[styles.card, waitingOnMe && styles.cardActive]}>

                {/* CARD HEADER */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>{jr.status.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.cardTime}>{timeAgo((jr as any).updatedAt ?? (jr as any).createdAt)}</Text>
                </View>

                {/* ROUTE */}
                <Text style={styles.cardRoute} numberOfLines={2}>{route}</Text>

                {/* RIDER + FARE ROW */}
                <View style={styles.cardMeta}>
                  <View style={styles.riderChip}>
                    <View style={styles.riderAvatar}>
                      <Text style={styles.riderAvatarText}>{jr.rider?.name?.[0] ?? '?'}</Text>
                    </View>
                    <Text style={styles.riderName}>{jr.rider?.name ?? 'Rider'}</Text>
                  </View>
                  <View style={styles.fareChip}>
                    <Text style={styles.fareLabel}>PKR</Text>
                    <Text style={styles.fareVal}>{jr.currentFare}</Text>
                  </View>
                </View>

                {/* WHO'S TURN */}
                <View style={styles.turnRow}>
                  <Text style={styles.turnText}>
                    {waitingOnMe ? '⏳ Waiting on YOU (driver)' : '⏳ Waiting on rider'}
                  </Text>
                  <Pressable onPress={() => jr.ride && router.push(rideDetailHref(jr.ride.id))} style={styles.viewRideBtn}>
                    <Text style={styles.viewRideBtnText}>View ride ›</Text>
                  </Pressable>
                </View>

                {/* ACTIONS */}
                {waitingOnMe ? (
                  <View style={styles.actions}>
                    <Pressable disabled={busy} onPress={() => act(jr, 'accept')} style={styles.acceptBtn}>
                      <LinearGradient colors={['#16a34a', '#15803d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionGrad}>
                        <Text style={styles.actionBtnText}>{busy ? '…' : '✓  ACCEPT'}</Text>
                      </LinearGradient>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => { setCounterVal(''); setCounterModal({ jr }); }}
                      style={styles.counterBtn}>
                      <Text style={styles.counterBtnText}>↔  COUNTER</Text>
                    </Pressable>
                    <Pressable disabled={busy} onPress={() => act(jr, 'reject')} style={styles.rejectBtn}>
                      <Text style={styles.rejectBtnText}>✗</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.waitingRow}>
                    <ActivityIndicator size="small" color={Neon.accent} />
                    <Text style={styles.waitingText}>Waiting for rider to respond to your counter…</Text>
                  </View>
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

  /* EMPTY STATE */
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyIcon: { fontSize: 56, marginBottom: 8 },
  emptyTitle: { color: Neon.text, fontSize: 20, fontWeight: '800' },
  emptySub: { color: Neon.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { marginTop: 8, borderRadius: 14, overflow: 'hidden', width: '60%' },
  emptyBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  emptyBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },

  /* SCROLL */
  scroll: { paddingBottom: 120 },

  /* HEADER */
  header: { paddingTop: 64, paddingHorizontal: 22, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  headerLabel: { color: Neon.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  headerTitle: { color: Neon.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  headerBadge: {
    backgroundColor: Neon.accent, minWidth: 36, height: 36,
    borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, marginTop: 4,
  },
  headerBadgeText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  headerSub: { color: Neon.muted, fontSize: 14, lineHeight: 20 },

  /* SECTION */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 22, marginBottom: 16 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Neon.border },
  sectionTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  /* LOADER */
  loaderWrap: { alignItems: 'center', paddingTop: 48, gap: 14 },
  loaderText: { color: Neon.muted, fontSize: 14 },

  /* EMPTY LIST */
  emptyListWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40, gap: 10 },
  emptyListIcon: { fontSize: 48 },
  emptyListTitle: { color: Neon.text, fontSize: 18, fontWeight: '700' },
  emptyListSub: { color: Neon.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  /* CARD */
  card: {
    marginHorizontal: 22, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: Neon.border,
    borderRadius: 20, overflow: 'hidden',
    padding: 16,
  },
  cardActive: { borderColor: 'rgba(232,33,39,0.35)', backgroundColor: 'rgba(232,33,39,0.04)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  cardTime: { color: Neon.muted, fontSize: 11, fontWeight: '600' },

  cardRoute: { color: Neon.text, fontSize: 16, fontWeight: '800', marginBottom: 12, lineHeight: 22 },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  riderChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    borderWidth: 1, borderColor: Neon.border,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  riderAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(232,33,39,0.15)',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  riderAvatarText: { color: Neon.accent, fontSize: 12, fontWeight: '900' },
  riderName: { color: Neon.accentSoft, fontSize: 13, fontWeight: '700', flex: 1 },
  fareChip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
    backgroundColor: 'rgba(232,33,39,0.1)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  fareLabel: { color: Neon.accent, fontSize: 10, fontWeight: '800' },
  fareVal: { color: Neon.accent, fontSize: 18, fontWeight: '900' },

  turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  turnText: { color: Neon.muted, fontSize: 12, fontWeight: '600' },
  viewRideBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  viewRideBtnText: { color: Neon.accentSoft, fontSize: 12, fontWeight: '700' },

  /* ACTIONS */
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  actionGrad: { paddingVertical: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.8 },
  counterBtn: {
    flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Neon.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  counterBtnText: { color: Neon.accentSoft, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  rejectBtn: {
    width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  rejectBtnText: { color: '#ef4444', fontSize: 16, fontWeight: '800' },

  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  waitingText: { color: Neon.muted, fontSize: 12, flex: 1 },

  /* MODAL */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: Neon.bgElevated, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)' },
  modalTitle: { color: Neon.text, fontWeight: '900', fontSize: 18, marginBottom: 4 },
  modalSub: { color: Neon.muted, fontSize: 13, marginBottom: 16 },
  fareRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: Neon.border,
    borderRadius: 14, paddingHorizontal: 14, marginBottom: 18, overflow: 'hidden',
  },
  fareCurrency: { color: Neon.accent, fontWeight: '800', fontSize: 16, marginRight: 8 },
  fareInput: { flex: 1, paddingVertical: 14, color: Neon.text, fontSize: 22, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: Neon.border },
  modalCancelText: { color: Neon.muted, fontWeight: '700' },
  modalConfirm: { flex: 2, borderRadius: 14, overflow: 'hidden' },
  modalConfirmGrad: { paddingVertical: 14, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
});
