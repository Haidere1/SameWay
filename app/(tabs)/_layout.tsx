import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Neon } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Neon.accent,
        tabBarInactiveTintColor: Neon.muted,
        headerShown: false,
        tabBarButton: (props: BottomTabBarButtonProps) => <HapticTab {...props} />,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rides',
          tabBarIcon: ({ color }: { color: string }) => (
            <IconSymbol size={26} name="car.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="offer"
        options={{
          title: 'Offer',
          tabBarIcon: ({ color }: { color: string }) => (
            <IconSymbol size={26} name="plus.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }: { color: string }) => (
            <IconSymbol size={26} name="tray.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }: { color: string }) => (
            <IconSymbol size={26} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Neon.bgElevated,
    borderTopColor: Neon.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontWeight: '600',
    fontSize: 11,
  },
});
