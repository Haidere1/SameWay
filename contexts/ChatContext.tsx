import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/api';
import type { ChatThread } from '@/lib/types';

type ChatContextValue = {
  threads: ChatThread[];
  activeThreadId: string | null;
  activeThread: ChatThread | null;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  openThread: (threadId: string) => void;
  closeDock: () => void;
  refreshThreads: () => Promise<void>;
  refreshActive: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refreshThreads = useCallback(async () => {
    if (!token || user?.accountReady !== true) return;
    try {
      const list = await api.fetchChatThreads();
      const now = Date.now();
      const upcoming = list.filter(
        (t) => !t.ride?.when || new Date(t.ride.when).getTime() > now,
      );
      setThreads(upcoming);
      setActiveThreadId((prev) => {
        if (!prev) return prev;
        return upcoming.some((t) => t.id === prev) ? prev : null;
      });
    } catch {
      setThreads([]);
    }
  }, [token, user?.accountReady]);

  useEffect(() => {
    void refreshThreads();
    const id = setInterval(() => void refreshThreads(), 18000);
    return () => clearInterval(id);
  }, [refreshThreads]);

  useEffect(() => {
    if (threads.length === 1 && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const t = threads.find((x) => x.id === activeThreadId);
    if (t?.ride?.when && new Date(t.ride.when).getTime() <= Date.now()) {
      setExpanded(false);
      setActiveThreadId(null);
    }
  }, [threads, activeThreadId]);

  const refreshActive = useCallback(async () => {
    if (!activeThreadId || user?.accountReady !== true) return;
    try {
      const t = await api.fetchChatThread(activeThreadId);
      setThreads((prev) => {
        const i = prev.findIndex((x) => x.id === t.id);
        if (i === -1) return [...prev, t];
        const next = [...prev];
        next[i] = t;
        return next;
      });
    } catch {
      /* ignore */
    }
  }, [activeThreadId, user?.accountReady]);

  useEffect(() => {
    if (!expanded || !activeThreadId) return;
    const id = setInterval(() => void refreshActive(), 5000);
    return () => clearInterval(id);
  }, [expanded, activeThreadId, refreshActive]);

  const openThread = useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      setExpanded(true);
      void (async () => {
        try {
          const t = await api.fetchChatThread(threadId);
          setThreads((prev) => {
            const i = prev.findIndex((x) => x.id === t.id);
            if (i === -1) return [...prev, t];
            const next = [...prev];
            next[i] = t;
            return next;
          });
        } catch {
          /* ignore */
        }
      })();
    },
    [],
  );

  const closeDock = useCallback(() => {
    setExpanded(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!activeThreadId) return;
      const t = await api.sendChatMessage(activeThreadId, text);
      setThreads((prev) => {
        const i = prev.findIndex((x) => x.id === t.id);
        if (i === -1) return [...prev, t];
        const next = [...prev];
        next[i] = t;
        return next;
      });
    },
    [activeThreadId],
  );

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const value = useMemo(
    () => ({
      threads,
      activeThreadId,
      activeThread,
      expanded,
      setExpanded,
      openThread,
      closeDock,
      refreshThreads,
      refreshActive,
      sendMessage,
    }),
    [
      threads,
      activeThreadId,
      activeThread,
      expanded,
      openThread,
      closeDock,
      refreshThreads,
      refreshActive,
      sendMessage,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return ctx;
}
