import type { Href } from 'expo-router';

/** Typed routes may lag until `expo start` regenerates `.expo/types`; cast keeps navigation valid. */
export function rideDetailHref(rideId: string, opts?: { join?: boolean }): Href {
  const q = opts?.join ? '?join=1' : '';
  return `/ride/${rideId}${q}` as Href;
}
