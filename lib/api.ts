import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE } from '@/lib/config';
import type { AppNotification, ChatThread, JoinRequestSummary, Ride, User } from '@/lib/types';

const TOKEN_KEY = 'sameway_token';

async function authHeader(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : text.trim().slice(0, 240) || res.statusText;
    throw new Error(msg || 'Request failed');
  }
  if (data === null && text.trim() !== '') {
    throw new Error('Invalid JSON from server — check API URL and that the backend is running.');
  }
  return data as T;
}

export type SignupFields = {
  email: string;
  password: string;
  name: string;
  cnic: string;
  phone: string;
  photoUri: string;
  photoName?: string;
  photoType?: string;
  cnicCardUri: string;
  cnicCardName?: string;
  cnicCardType?: string;
};

export type SignupResponse = {
  token: string;
  user: User;
  devCodes?: { email: string; phone: string };
};

export async function signupMultipart(fields: SignupFields): Promise<SignupResponse> {
  const form = new FormData();
  form.append('email', fields.email.trim());
  form.append('password', fields.password);
  form.append('name', fields.name.trim());
  form.append('cnic', fields.cnic.trim());
  form.append('phone', fields.phone.trim());
  const pName = fields.photoName ?? 'photo.jpg';
  const pType = fields.photoType ?? 'image/jpeg';
  form.append('photo', {
    uri: fields.photoUri,
    name: pName,
    type: pType,
  } as unknown as Blob);
  const cName = fields.cnicCardName ?? 'cnic.jpg';
  const cType = fields.cnicCardType ?? 'image/jpeg';
  form.append('cnicCard', {
    uri: fields.cnicCardUri,
    name: cName,
    type: cType,
  } as unknown as Blob);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      body: form,
    });
  } catch (e) {
    const hint =
      'Cannot reach the API. On a phone, use your PC LAN IP (not localhost). Set EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 in .env and restart Expo.';
    const base = typeof e === 'object' && e !== null && 'message' in e ? String((e as Error).message) : String(e);
    throw new Error(
      /Network request failed|Failed to fetch|ECONNREFUSED/i.test(base)
        ? `${base}\n\n${hint}`
        : base || hint,
    );
  }

  const data = await parseJson<SignupResponse>(res);
  if (!data?.token || !data?.user) {
    throw new Error('Signup response missing token or user. Check server logs and API_BASE in the app.');
  }
  return data;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJson(res);
}

export async function fetchMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function verifyEmailCode(code: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ code }),
  });
  return parseJson(res);
}

export async function verifyPhoneCode(code: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/verify-phone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ code }),
  });
  return parseJson(res);
}

export async function resendEmailCode(): Promise<{ devCode?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/resend-email-code`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function resendPhoneCode(): Promise<{ devCode?: string }> {
  const res = await fetch(`${API_BASE}/api/auth/resend-phone-code`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function fetchRides(lat?: number, lng?: number): Promise<Ride[]> {
  const has =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const q = has ? `?lat=${encodeURIComponent(lat!)}&lng=${encodeURIComponent(lng!)}` : '';
  const res = await fetch(`${API_BASE}/api/rides${q}`);
  return parseJson(res);
}

export async function fetchRide(id: string): Promise<Ride> {
  const res = await fetch(`${API_BASE}/api/rides/${id}`, {
    headers: {
      Accept: 'application/json',
      ...(await authHeader()),
    },
  });
  return parseJson(res);
}

export async function createRide(body: {
  from: string;
  to: string;
  when: string;
  seatCount: number;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}): Promise<Ride> {
  const res = await fetch(`${API_BASE}/api/rides`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function createJoinRequest(rideId: string, offeredFare: number): Promise<JoinRequestSummary> {
  const res = await fetch(`${API_BASE}/api/rides/${rideId}/join-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ offeredFare }),
  });
  return parseJson(res);
}

export async function fetchDriverJoinRequests(): Promise<JoinRequestSummary[]> {
  const res = await fetch(`${API_BASE}/api/me/join-requests`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function driverJoinAction(
  joinRequestId: string,
  action: 'accept' | 'reject' | 'counter',
  counterFare?: number,
): Promise<JoinRequestSummary> {
  const res = await fetch(`${API_BASE}/api/join-requests/${joinRequestId}/driver-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ action, counterFare }),
  });
  return parseJson(res);
}

export async function riderJoinAction(
  joinRequestId: string,
  action: 'accept' | 'reject' | 'counter' | 'withdraw',
  counterFare?: number,
): Promise<JoinRequestSummary> {
  const res = await fetch(`${API_BASE}/api/join-requests/${joinRequestId}/rider-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ action, counterFare }),
  });
  return parseJson(res);
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE}/api/me/notifications`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  await parseJson(res);
}

export async function fetchChatThreads(): Promise<ChatThread[]> {
  const res = await fetch(`${API_BASE}/api/chat/threads`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function fetchChatThread(threadId: string): Promise<ChatThread> {
  const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}`, {
    headers: { Accept: 'application/json', ...(await authHeader()) },
  });
  return parseJson(res);
}

export async function sendChatMessage(threadId: string, text: string): Promise<ChatThread> {
  const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(await authHeader()),
    },
    body: JSON.stringify({ text }),
  });
  return parseJson(res);
}
