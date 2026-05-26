import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Neon } from '@/constants/theme';
import * as api from '@/lib/api';
import type { Review } from '@/lib/types';

type Props = {
  driverId: string | null;
  driverName: string;
  driverAvatarUrl: string | null;
  ratingAvg?: number | null;
  ratingCount?: number;
  onClose: () => void;
};

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? '#facc15' : 'rgba(255,255,255,0.15)' }}>
          ★
        </Text>
      ))}
    </View>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'Today';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function DriverProfileModal({ driverId, driverName, driverAvatarUrl, ratingAvg, ratingCount, onClose }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    api.fetchUserReviews(driverId)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [driverId]);

  const avg = ratingAvg ?? (reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null);
  const count = ratingCount ?? reviews.length;

  return (
    <Modal visible={!!driverId} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          <LinearGradient colors={['#1a0f2e', '#111216']} style={styles.sheetInner}>

            {/* HANDLE */}
            <View style={styles.handle} />

            {/* HEADER */}
            <View style={styles.header}>
              {driverAvatarUrl
                ? <Image source={{ uri: driverAvatarUrl }} style={styles.avatar} />
                : <View style={styles.avatarPh}><Text style={styles.avatarInitial}>{driverName?.[0] ?? '?'}</Text></View>}
              <View style={styles.headerInfo}>
                <Text style={styles.driverName}>{driverName}</Text>
                <View style={styles.verifiedRow}>
                  <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ CNIC Verified</Text></View>
                </View>
                {avg != null ? (
                  <View style={styles.ratingRow}>
                    <StarRow rating={avg} size={16} />
                    <Text style={styles.ratingNum}>{avg.toFixed(1)}</Text>
                    <Text style={styles.ratingCount}>({count} {count === 1 ? 'review' : 'reviews'})</Text>
                  </View>
                ) : (
                  <Text style={styles.noRatingText}>No ratings yet</Text>
                )}
              </View>
            </View>

            {/* DIVIDER */}
            <View style={styles.divider} />
            <Text style={styles.reviewsTitle}>PASSENGER REVIEWS</Text>

            {/* REVIEWS */}
            <ScrollView style={styles.reviewList} showsVerticalScrollIndicator={false}>
              {loading ? (
                <View style={styles.loader}>
                  <ActivityIndicator size="small" color={Neon.accent} />
                </View>
              ) : reviews.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyIcon}>💬</Text>
                  <Text style={styles.emptyText}>No reviews yet</Text>
                  <Text style={styles.emptySubText}>Be the first to ride and review!</Text>
                </View>
              ) : (
                reviews.map((rv) => (
                  <View key={rv.id} style={styles.reviewCard}>
                    <View style={styles.reviewTop}>
                      <View style={styles.reviewerRow}>
                        <View style={styles.reviewerAvatar}>
                          {rv.reviewer?.avatarUrl
                            ? <Image source={{ uri: rv.reviewer.avatarUrl }} style={styles.reviewerAvatarImg} />
                            : <Text style={styles.reviewerInitial}>{rv.reviewer?.name?.[0] ?? '?'}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reviewerName}>{rv.reviewer?.name ?? 'Rider'}</Text>
                          {rv.ride && (
                            <Text style={styles.reviewRoute} numberOfLines={1}>
                              {rv.ride.from} → {rv.ride.to}
                            </Text>
                          )}
                        </View>
                        <View style={styles.reviewMeta}>
                          <StarRow rating={rv.rating} size={12} />
                          <Text style={styles.reviewTime}>{timeAgo(rv.createdAt)}</Text>
                        </View>
                      </View>
                    </View>
                    {!!rv.comment && <Text style={styles.reviewComment}>"{rv.comment}"</Text>}
                  </View>
                ))
              )}
              <View style={{ height: 32 }} />
            </ScrollView>

            {/* CLOSE */}
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  backdropTouch: { flex: 1 },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetInner: { flex: 1 },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },

  header: { flexDirection: 'row', gap: 16, paddingHorizontal: 22, marginBottom: 20, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: 'rgba(232,33,39,0.5)' },
  avatarPh: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(232,33,39,0.15)',
    borderWidth: 2, borderColor: 'rgba(232,33,39,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: Neon.accent, fontSize: 28, fontWeight: '900' },
  headerInfo: { flex: 1, gap: 6 },
  driverName: { color: Neon.text, fontSize: 20, fontWeight: '900' },
  verifiedRow: { flexDirection: 'row', gap: 6 },
  verifiedBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
  },
  verifiedText: { color: '#4ade80', fontSize: 10, fontWeight: '800' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingNum: { color: '#facc15', fontSize: 15, fontWeight: '900' },
  ratingCount: { color: Neon.muted, fontSize: 12 },
  noRatingText: { color: Neon.muted, fontSize: 13 },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 22, marginBottom: 16 },
  reviewsTitle: { color: Neon.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginHorizontal: 22, marginBottom: 12 },

  reviewList: { flex: 1, paddingHorizontal: 22 },
  loader: { paddingTop: 32, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { color: Neon.text, fontSize: 16, fontWeight: '700' },
  emptySubText: { color: Neon.muted, fontSize: 13 },

  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 14, marginBottom: 10,
  },
  reviewTop: { marginBottom: 6 },
  reviewerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(232,33,39,0.15)',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.25)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  reviewerAvatarImg: { width: 34, height: 34, borderRadius: 17 },
  reviewerInitial: { color: Neon.accent, fontSize: 14, fontWeight: '800' },
  reviewerName: { color: Neon.text, fontSize: 13, fontWeight: '700' },
  reviewRoute: { color: Neon.muted, fontSize: 11, marginTop: 1 },
  reviewMeta: { alignItems: 'flex-end', gap: 3 },
  reviewTime: { color: Neon.muted, fontSize: 10 },
  reviewComment: { color: Neon.accentSoft, fontSize: 13, lineHeight: 20, fontStyle: 'italic', marginTop: 4 },

  closeBtn: {
    marginHorizontal: 22, marginBottom: 32, marginTop: 8,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  closeBtnText: { color: Neon.muted, fontWeight: '700', fontSize: 14 },
});
