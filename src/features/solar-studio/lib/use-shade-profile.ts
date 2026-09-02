// React binding for the shade profile cache: re-render when a profile lands.
import { useEffect, useState } from 'react';
import { shadeProfileVersion, subscribeShadeProfile } from './shade-profile-cache';

export function useShadeProfileVersion(): number {
  const [v, setV] = useState(shadeProfileVersion());
  useEffect(() => subscribeShadeProfile(() => setV(shadeProfileVersion())), []);
  return v;
}
