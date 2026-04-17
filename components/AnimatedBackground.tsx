import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Neon } from '@/constants/theme';

const { width: W, height: H } = Dimensions.get('window');

const ORBS = [
  { x: W * 0.1,  y: H * 0.12, size: 260, delay: 0,    dur: 7000 },
  { x: W * 0.75, y: H * 0.3,  size: 200, delay: 1200, dur: 9000 },
  { x: W * 0.4,  y: H * 0.65, size: 180, delay: 600,  dur: 8000 },
  { x: W * 0.85, y: H * 0.78, size: 140, delay: 2000, dur: 6500 },
];

const GRID_COLS = 8;
const GRID_ROWS = 18;
const COL_W = W / GRID_COLS;
const ROW_H = 52;

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  x: Math.random() * W,
  startY: Math.random() * H,
  size: 1.5 + Math.random() * 2,
  delay: i * 400,
  dur: 6000 + Math.random() * 5000,
  opacity: 0.15 + Math.random() * 0.3,
}));

function Orb({ x, y, size, delay, dur }: (typeof ORBS)[0]) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.06);

  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withTiming(1.18, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true,
    ));
    opacity.value = withDelay(delay, withRepeat(
      withTiming(0.14, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.orb, style, {
        width: size, height: size,
        borderRadius: size / 2,
        left: x - size / 2,
        top: y - size / 2,
      }]}
    />
  );
}

function Particle({ x, startY, size, delay, dur, opacity: op }: (typeof PARTICLES)[0]) {
  const y = useSharedValue(startY);
  const opacity = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(delay, withRepeat(
      withTiming(startY - H * 0.25, { duration: dur, easing: Easing.linear }), -1, false,
    ));
    opacity.value = withDelay(delay, withRepeat(
      withTiming(op, { duration: dur * 0.3, easing: Easing.out(Easing.quad) }), -1, true,
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value - startY }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.particle, style, { width: size, height: size, borderRadius: size / 2, left: x, top: startY }]} />
  );
}

export function AnimatedBackground() {
  const scanY = useSharedValue(-60);

  useEffect(() => {
    scanY.value = withRepeat(
      withTiming(H + 60, { duration: 4500, easing: Easing.linear }), -1, false,
    );
  }, []);

  const scanStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scanY.value }] }));

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* GRID */}
      <View style={styles.grid}>
        {Array.from({ length: GRID_COLS + 1 }).map((_, i) => (
          <View key={`c${i}`} style={[styles.gridLine, styles.gridCol, { left: i * COL_W }]} />
        ))}
        {Array.from({ length: GRID_ROWS + 1 }).map((_, i) => (
          <View key={`r${i}`} style={[styles.gridLine, styles.gridRow, { top: i * ROW_H }]} />
        ))}
      </View>

      {/* ORBS */}
      {ORBS.map((o, i) => <Orb key={i} {...o} />)}

      {/* PARTICLES */}
      {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

      {/* SCAN LINE */}
      <Animated.View style={[styles.scanLine, scanStyle]} />

      {/* CORNER ACCENTS */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(232,33,39,0.04)' },
  gridCol: { width: 1, top: 0, bottom: 0 },
  gridRow: { height: 1, left: 0, right: 0 },
  orb: {
    position: 'absolute',
    backgroundColor: Neon.accent,
  },
  particle: {
    position: 'absolute',
    backgroundColor: Neon.accent,
  },
  scanLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: 60,
    background: undefined,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: 'rgba(232,33,39,0.08)',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: 'rgba(232,33,39,0.25)',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
});
