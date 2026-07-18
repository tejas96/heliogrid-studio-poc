'use client';

// ─── Next.js router adapter (same API as the former hash router) ─────────────
import { useEffect, useMemo } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';

export interface Route {
  name: 'login' | 'projects' | 'wizard' | 'share' | 'bom' | 'proposal';
  step?: number;
  shareId?: string;
}

type NavigateFn = (path: string) => void;
let navigateFn: NavigateFn | null = null;

export function bindNavigate(fn: NavigateFn) {
  navigateFn = fn;
}

export function navigate(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (navigateFn) navigateFn(p);
  else if (typeof window !== 'undefined') window.location.assign(p);
}

export function useRoute(): Route {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    bindNavigate((p) => router.push(p));
  }, [router]);

  return useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'share') {
      const shareId = String(params.shareId ?? parts[1] ?? '');
      if (shareId) return { name: 'share', shareId };
    }
    if (parts[0] === 'wizard') {
      const step = Math.max(
        1,
        Math.min(10, Number(params.step ?? parts[1]) || 1),
      );
      return { name: 'wizard', step };
    }
    if (parts[0] === 'projects') return { name: 'projects' };
    if (parts[0] === 'bom') return { name: 'bom' };
    if (parts[0] === 'proposal') return { name: 'proposal' };
    if (parts[0] === 'login') return { name: 'login' };
    return { name: 'login' };
  }, [pathname, params.shareId, params.step]);
}
