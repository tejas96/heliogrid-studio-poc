'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/features/solar-studio/store/store';

export default function HomePage() {
  const router = useRouter();
  const { state } = useStore();

  useEffect(() => {
    router.replace(state.user ? '/projects' : '/login');
  }, [router, state.user]);

  return null;
}
