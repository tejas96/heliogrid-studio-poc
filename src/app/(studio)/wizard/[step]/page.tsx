'use client';

import { useParams } from 'next/navigation';
import { Wizard } from '@/features/solar-studio/screens/Wizard';

export default function WizardPage() {
  const params = useParams();
  const step = Math.max(1, Math.min(10, Number(params.step) || 1));
  return <Wizard step={step} />;
}
