import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Neon } from '@/constants/theme';

type TabConfig = {
  name: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
};

const TABS: TabConfig[] = [
  { name: 'index',   label: 'Rides',   icon: 'directions-car' },
  { name: 'offer',   label: 'Offer',   icon: 'add-circle-outline' },
  { name: 'inbox',   label: 'Inbox',   icon: 'inbox' },
  { name: 'profile', label: 'Profile', icon: 'person-outline' },
];

function TabIcon({ icon, label, focused }: { icon: TabConfig['icon']; label: string; focused: boolean }) {
  return (
    <View style={[tabStyles.item, focused && tabStyles.itemFocused]}>
      <MaterialIcons name={icon} size={18} color={focused ? Neon.accent : Neon.muted} />
      <Text style={[tabStyles.label, focused && tabStyles.labelFocused]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabItem,
        tabBarActiveTintColor: Neon.accent,
        tabBarInactiveTintColor: Neon.muted,
      }}>
      {TABS.map(({ name, label, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon={icon} label={label} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 2,
    width: 64,
  },
  itemFocused: {
    backgroundColor: 'rgba(232,33,39,0.1)',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Neon.muted,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  labelFocused: {
    color: Neon.accent,
    fontWeight: '800',
  },
});

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#111216',
    borderTopColor: 'rgba(232,33,39,0.18)',
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
    paddingTop: 4,
    paddingHorizontal: 0,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
