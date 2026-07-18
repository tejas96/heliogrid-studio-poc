'use client';

import { useParams } from 'next/navigation';
import { ShareViewer } from '@/features/solar-studio/screens/ShareViewer';

export default function SharePage() {
  const params = useParams();
  return <ShareViewer shareId={String(params.shareId ?? '')} />;
}
