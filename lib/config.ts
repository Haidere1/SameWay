import Constants from 'expo-constants';
import { getExpoGoProjectConfig } from 'expo';
import { Platform } from 'react-native';

const env = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

/**
 * Hostname of the machine running Metro + your API.
 * Expo Go on a phone cannot use localhost — that is the phone itself.
 */
function getDevApiHost(): string {
  if (!__DEV__) {
    return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  }

  const go = getExpoGoProjectConfig();
  const dbg = go?.debuggerHost;
  if (dbg) {
    const host = dbg.split(':')[0]?.trim();
    if (host && host !== '127.0.0.1' && host !== '0.0.0.0') {
      const isTunnel =
        host.includes('.exp.') || host.includes('ngrok') || host.includes('tunnel');
      if (!isTunnel) {
        return host;
      }
      console.warn(
        '[SameWay] Tunnel mode does not expose your API. Add to project .env: EXPO_PUBLIC_API_URL=http://<PC_LAN_IP>:3000 (ipconfig / ifconfig), then restart Expo. Or run: npx expo start --lan'
      );
    }
  }

  const uri = Constants.expoConfig?.hostUri;
  if (uri) {
    const host = uri.split(':')[0]?.trim();
    if (
      host &&
      host !== '127.0.0.1' &&
      host !== '0.0.0.0' &&
      host !== 'localhost'
    ) {
      return host;
    }
  }

  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

export const API_BASE = env ?? `http://${getDevApiHost()}:3000`;

if (__DEV__) {
  console.log('[SameWay] API_BASE =', API_BASE);
}
