import type { ColorSchemeName } from 'react-native';

/** SameWay is dark-first; lock UI to dark for consistent neon styling. */
export function useColorScheme(): NonNullable<ColorSchemeName> {
  return 'dark';
}
