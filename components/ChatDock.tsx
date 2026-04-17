import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
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

  const title = activeThread?.ride != null
    ? `${activeThread.ride.from.slice(0, 16)} → ${activeThread.ride.to.slice(0, 14)}`
    : 'Ride Chat';

  const collapsedH = 58 + insets.bottom;
  const expandedH = Math.round(Dimensions.get('window').height * 0.52);
  const Shell = Platform.OS === 'web' ? View : BlurView;
  const shellProps = Platform.OS === 'web' ? {} : { intensity: 60, tint: 'dark' as const };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      style={[styles.wrap, { height: expanded ? expandedH : collapsedH }]}>
      <Shell {...shellProps} style={styles.shell}>

        {/* HANDLE BAR */}
        <Pressable onPress={() => setExpanded(!expanded)} style={[styles.handle, { paddingBottom: expanded ? 0 : insets.bottom }]} hitSlop={10}>
          <View style={styles.handlePill} />
          <View style={styles.handleRow}>
            <View style={styles.handleLeft}>
              <View style={styles.activeDot} />
              <Text style={styles.handleTitle} numberOfLines={1}>{title}</Text>
            </View>
            <View style={styles.handleRight}>
              {threads.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{threads.length}</Text>
                </View>
              )}
              <Text style={styles.chevron}>{expanded ? '⌄' : '⌃'}</Text>
            </View>
          </View>
        </Pressable>

        {/* THREAD PICKER */}
        {expanded && threads.length > 1 && (
          <FlatList
            horizontal
            data={threads}
            keyExtractor={(t) => t.id}
            style={styles.threadScroll}
            contentContainerStyle={styles.threadRow}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => openThread(item.id)} style={[styles.threadChip, activeThread?.id === item.id && styles.threadChipOn]}>
                <Text style={[styles.threadChipText, activeThread?.id === item.id && styles.threadChipTextOn]} numberOfLines={1}>
                  {item.ride?.from ?? 'Chat'}
                </Text>
              </Pressable>
            )}
          />
        )}

        {/* MESSAGES */}
        {expanded && activeThread && (
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
            <View style={[styles.compose, { paddingBottom: insets.bottom + 8 }]}>
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
                style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}>
                <Text style={styles.sendIcon}>{sending ? '…' : '↑'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Shell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    zIndex: 2000,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(232,33,39,0.25)',
  },
  shell: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? 'rgba(14,12,20,0.97)' : 'rgba(14,12,20,0.7)',
  },
  /* HANDLE */
  handle: { paddingTop: 10, paddingHorizontal: 16 },
  handlePill: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 10,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  handleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  handleTitle: { color: Neon.text, fontWeight: '700', fontSize: 14, flex: 1 },
  handleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    backgroundColor: Neon.accent,
    borderRadius: 8, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  chevron: { color: Neon.muted, fontSize: 18, fontWeight: '700' },

  /* THREAD PICKER */
  threadScroll: { maxHeight: 40, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  threadRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
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
  msgContent: { padding: 16, gap: 6, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(232,33,39,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(232,33,39,0.3)',
  },
  bubbleAvatarText: { color: Neon.accent, fontSize: 11, fontWeight: '800' },
  bubbleCol: { maxWidth: '78%', gap: 3 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16 },
  bubbleMine: {
    backgroundColor: Neon.accent,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: Neon.accentSoft, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { color: Neon.muted, fontSize: 10, marginLeft: 4 },
  bubbleTimeMine: { textAlign: 'right', marginRight: 4 },

  /* COMPOSE */
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Neon.text,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Neon.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.35 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 24 },
});
