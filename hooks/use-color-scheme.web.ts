import type { ColorSchemeName } from 'react-native';

/** SameWay: lock web to dark neon theme (matches native). */
export function useColorScheme(): NonNullable<ColorSchemeName> {
  return 'dark';
}
