import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as api from '@/lib/api';
import type { SignupFields, SignupResponse } from '@/lib/api';
import type { User } from '@/lib/types';

const TOKEN_KEY = 'sameway_token';
const USER_KEY = 'sameway_user';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (fields: SignupFields) => Promise<SignupResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, uJson] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (cancelled) return;
        if (t && uJson) {
          setToken(t);
          setUser(JSON.parse(uJson) as User);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (t: string, u: User) => {
    setToken(t);
    setUser(u);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, t],
      [USER_KEY, JSON.stringify(u)],
    ]);
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    try {
      const u = await api.fetchMe();
      setUser(u);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      return u;
    } catch {
      return null;
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: tok, user: usr } = await api.login(email, password);
      await persist(tok, usr);
      return usr;
    },
    [persist],
  );

  const signup = useCallback(
    async (fields: SignupFields) => {
      const res = await api.signupMultipart(fields);
      await persist(res.token, res.user);
      return res;
    },
    [persist],
  );

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      signup,
      logout,
      refreshUser,
    }),
    [user, token, loading, login, signup, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
