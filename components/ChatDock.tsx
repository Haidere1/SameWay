import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Neon } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import type { ChatMessage } from '@/lib/types';

const TAB_BAR_H = Platform.OS === 'ios' ? 80 : 60;
const POPUP_W = Math.min(340, Dimensions.get('window').width - 24);
const POPUP_H = 460;

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export function ChatDock() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { threads, activeThreadId, activeThread, expanded, setExpanded, sendMessage, refreshActive, openThread } = useChat();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (expanded && !activeThread && threads[0]) openThread(threads[0].id);
  }, [expanded, activeThread, threads, openThread]);

  const onSend = useCallback(async () => {
    const t = draft.trim();
    if (!t || !activeThread) return;
    setSending(true);
    try {
      await sendMessage(t);
      setDraft('');
      await refreshActive();
    } finally { setSending(false); }
  }, [draft, sendMessage, refreshActive, activeThread]);

  if (user?.accountReady !== true) return null;
  if (threads.length === 0 && !activeThreadId) return null;

  const fabBottom = TAB_BAR_H + insets.bottom + 10;
  const popupBottom = fabBottom + 68;

  const title = activeThread?.ride != null
    ? `${activeThread.ride.from.slice(0, 16)} → ${activeThread.ride.to.slice(0, 14)}`
    : 'Ride Chat';

  const Shell = Platform.OS === 'web' ? View : BlurView;
  const shellProps = Platform.OS === 'web' ? {} : { intensity: 65, tint: 'dark' as const };

  return (
    <>
      {/* FAB */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={[styles.fab, { bottom: fabBottom }]}
      >
        <MaterialIcons name={expanded ? 'chat' : 'chat-bubble'} size={24} color="#fff" />
        {!expanded && threads.length > 0 && (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{threads.length}</Text>
          </View>
        )}
      </Pressable>

      {/* Chat popup */}
      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* backdrop */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setExpanded(false)} />

          {/* floating card */}
          <Shell
            {...shellProps}
            style={[styles.popup, { bottom: popupBottom, width: POPUP_W, maxHeight: POPUP_H }]}
          >
            {/* HEADER */}
            <View style={styles.popupHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.activeDot} />
                <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
              </View>
              <View style={styles.headerRight}>
                {threads.length > 1 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{threads.length}</Text>
                  </View>
                )}
                <Pressable onPress={() => setExpanded(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={18} color={Neon.muted} />
                </Pressable>
              </View>
            </View>

            {/* THREAD TABS */}
            {threads.length > 1 && (
              <FlatList
                horizontal
                data={threads}
                keyExtractor={(t) => t.id}
                style={styles.threadScroll}
                contentContainerStyle={styles.threadRow}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => openThread(item.id)}
                    style={[styles.threadChip, activeThread?.id === item.id && styles.threadChipOn]}
                  >
                    <Text
                      style={[styles.threadChipText, activeThread?.id === item.id && styles.threadChipTextOn]}
                      numberOfLines={1}
                    >
                      {item.ride?.from ?? 'Chat'}
                    </Text>
                  </Pressable>
                )}
              />
            )}

            {/* MESSAGES */}
            {activeThread ? (
              <View style={styles.body}>
                <FlatList
                  style={styles.msgList}
                  data={activeThread.messages}
                  keyExtractor={(m) => m.id}
                  contentContainerStyle={styles.msgContent}
                  renderItem={({ item }: { item: ChatMessage }) => {
                    const mine = item.fromId === user.id;
                    return (
                      <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
                        {!mine && (
                          <View style={styles.bubbleAvatar}>
                            <Text style={styles.bubbleAvatarText}>{item.fromId?.[0]?.toUpperCase() ?? '?'}</Text>
                          </View>
                        )}
                        <View style={styles.bubbleCol}>
                          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                          </View>
                          {'createdAt' in item && (
                            <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                              {formatTime((item as any).createdAt)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  }}
                />

                {/* COMPOSE */}
                <View style={styles.compose}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Type a message…"
                    placeholderTextColor={Neon.muted}
                    style={styles.input}
                    multiline
                    maxLength={2000}
                    onSubmitEditing={onSend}
                  />
                  <Pressable
                    onPress={onSend}
                    disabled={sending || !draft.trim()}
                    style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
                  >
                    <Text style={styles.sendIcon}>{sending ? '…' : '↑'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.noThread}>
                <Text style={styles.noThreadText}>No active conversation</Text>
              </View>
            )}
          </Shell>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /* FAB */
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Neon.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    elevation: 12,
    shadowColor: Neon.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Neon.accent,
  },
  fabBadgeText: { color: Neon.accent, fontSize: 11, fontWeight: '900' },

  /* MODAL */
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  /* POPUP CARD */
  popup: {
    position: 'absolute',
    right: 12,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(232,33,39,0.28)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(14,12,20,0.97)' : 'rgba(14,12,20,0.75)',
  },

  /* HEADER */
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  headerTitle: { color: Neon.text, fontWeight: '700', fontSize: 13, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    backgroundColor: Neon.accent,
    borderRadius: 8, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  /* THREAD TABS */
  threadScroll: { maxHeight: 40, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  threadRow: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
  threadChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    borderWidth: 1, borderColor: Neon.border, maxWidth: 140,
  },
  threadChipOn: { borderColor: Neon.accent, backgroundColor: 'rgba(232,33,39,0.15)' },
  threadChipText: { color: Neon.muted, fontSize: 12, fontWeight: '600' },
  threadChipTextOn: { color: Neon.accent },

  /* MESSAGES */
  body: { flex: 1 },
  msgList: { flex: 1 },
  msgContent: { padding: 12, gap: 6, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginBottom: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(232,33,39,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.3)',
  },
  bubbleAvatarText: { color: Neon.accent, fontSize: 10, fontWeight: '800' },
  bubbleCol: { maxWidth: '78%', gap: 3 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: Neon.accent, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: Neon.accentSoft, fontSize: 13, lineHeight: 18 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { color: Neon.muted, fontSize: 10, marginLeft: 4 },
  bubbleTimeMine: { textAlign: 'right', marginRight: 4 },

  /* COMPOSE */
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  input: {
    flex: 1,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Neon.text,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Neon.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.35 },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 22 },

  /* NO THREAD */
  noThread: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 120 },
  noThreadText: { color: Neon.muted, fontSize: 13 },
});
