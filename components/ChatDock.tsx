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

export function ChatDock() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { threads, activeThreadId, activeThread, expanded, setExpanded, sendMessage, refreshActive, openThread } =
    useChat();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (expanded && !activeThread && threads[0]) {
      openThread(threads[0].id);
    }
  }, [expanded, activeThread, threads, openThread]);

  const onSend = useCallback(async () => {
    const t = draft.trim();
    if (!t || !activeThread) return;
    setSending(true);
    try {
      await sendMessage(t);
      setDraft('');
      await refreshActive();
    } finally {
      setSending(false);
    }
  }, [draft, sendMessage, refreshActive, activeThread]);

  if (user?.accountReady !== true) return null;
  if (threads.length === 0 && !activeThreadId) return null;

  const title =
    activeThread?.ride != null
      ? `${activeThread.ride.from.slice(0, 18)}… → ${activeThread.ride.to.slice(0, 14)}…`
      : 'Ride chat';

  const collapsedHeight = 52 + insets.bottom;
  const expandedH = Math.round(Dimensions.get('window').height * 0.48);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      style={[styles.wrap, { height: expanded ? expandedH : collapsedHeight }]}>
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={styles.barInner}
          hitSlop={8}>
          <Text style={styles.barTitle} numberOfLines={1}>
            {expanded ? '▼ ' : '▲ '}
            {title}
          </Text>
          <Text style={styles.badge}>{threads.length}</Text>
        </Pressable>
        {threads.length > 1 ? (
          <FlatList
            horizontal
            data={threads}
            keyExtractor={(t) => t.id}
            style={styles.threadPick}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openThread(item.id)}
                style={[styles.threadChip, activeThread?.id === item.id && styles.threadChipOn]}>
                <Text style={styles.threadChipText} numberOfLines={1}>
                  {item.ride?.from ?? 'Chat'}
                </Text>
              </Pressable>
            )}
          />
        ) : null}
      </View>
      {expanded && activeThread ? (
        <View style={styles.body}>
          <FlatList
            style={{ flex: 1 }}
            data={activeThread.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            renderItem={({ item }: { item: ChatMessage }) => {
              const mine = item.fromId === user.id;
              return (
                <View style={[styles.bubbleRow, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <View style={[styles.bubble, mine ? styles.bubbleBgMine : styles.bubbleBgOther]}>
                    <Text style={styles.bubbleText}>{item.body}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={styles.compose}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={Neon.muted}
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={onSend}
              disabled={sending || !draft.trim()}
              style={[styles.send, (!draft.trim() || sending) && styles.sendOff]}>
              <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    backgroundColor: Neon.bgElevated,
    borderTopWidth: 1,
    borderColor: Neon.border,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Neon.border,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  barTitle: { flex: 1, color: Neon.text, fontWeight: '700', fontSize: 15 },
  badge: {
    marginLeft: 8,
    backgroundColor: Neon.accent,
    color: Neon.onAccent,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  threadPick: { maxHeight: 40, marginTop: 6 },
  threadChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Neon.border,
    maxWidth: 140,
  },
  threadChipOn: { borderColor: Neon.accent, backgroundColor: 'rgba(168,85,247,0.2)' },
  threadChipText: { color: Neon.muted, fontSize: 12 },
  body: { flex: 1 },
  msgList: { padding: 12, gap: 8, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row', marginBottom: 6 },
  bubbleMine: { justifyContent: 'flex-end' },
  bubbleOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleBgMine: { backgroundColor: 'rgba(168,85,247,0.45)' },
  bubbleBgOther: { backgroundColor: 'rgba(255,255,255,0.08)' },
  bubbleText: { color: Neon.text, fontSize: 15 },
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderColor: Neon.border,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Neon.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Neon.text,
    fontSize: 15,
  },
  send: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Neon.accent,
  },
  sendOff: { opacity: 0.45 },
  sendText: { color: Neon.onAccent, fontWeight: '800' },
});
