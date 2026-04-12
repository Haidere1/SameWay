import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import React from 'react';
import type { GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/**
 * Forwards ref to the tab bar root (required by React Navigation) and applies
 * press scale inside so layout / measurements stay correct.
 */
export const HapticTab = React.forwardRef<React.ElementRef<typeof PlatformPressable>, BottomTabBarButtonProps>(
  function HapticTab({ children, onPressIn, onPressOut, ...rest }, ref) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <PlatformPressable
        ref={ref}
        {...rest}
        onPressIn={(ev: GestureResponderEvent) => {
          scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
          if (process.env.EXPO_OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onPressIn?.(ev);
        }}
        onPressOut={(ev: GestureResponderEvent) => {
          scale.value = withSpring(1, { damping: 12, stiffness: 200 });
          onPressOut?.(ev);
        }}>
        <Animated.View
          style={[
            {
              flex: 1,
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
            },
            animatedStyle,
          ]}>
          {children}
        </Animated.View>
      </PlatformPressable>
    );
  }
);
