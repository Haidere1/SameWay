/**
 * SameWay — Tesla-inspired UI: near-black surfaces, zinc neutrals, Tesla red accent.
 */

import { Platform } from 'react-native';

export const Neon = {
  bg: '#0d0d0f',
  bgElevated: '#17181c',
  text: '#f4f4f5',
  muted: '#71717a',
  /** Primary CTA / Tesla-style red */
  accent: '#e82127',
  /** Secondary actions / links */
  accentBlue: '#a1a1aa',
  accentSoft: '#e4e4e7',
  border: 'rgba(255, 255, 255, 0.1)',
  glow: 'rgba(232, 33, 39, 0.12)',
  gradientStart: '#141416',
  gradientMid: '#0d0d0f',
  gradientEnd: '#050506',
  cardOverlay: 'rgba(255, 255, 255, 0.04)',
  /** Text on primary red buttons */
  onAccent: '#ffffff',
};

export const Colors = {
  light: {
    text: Neon.text,
    background: Neon.bg,
    tint: Neon.accent,
    icon: Neon.muted,
    tabIconDefault: Neon.muted,
    tabIconSelected: Neon.accent,
    link: Neon.accentBlue,
  },
  dark: {
    text: Neon.text,
    background: Neon.bg,
    tint: Neon.accent,
    icon: Neon.muted,
    tabIconDefault: Neon.muted,
    tabIconSelected: Neon.accent,
    link: Neon.accentBlue,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
