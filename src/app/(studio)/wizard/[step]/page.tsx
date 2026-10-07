'use client';

import { useParams } from 'next/navigation';
import { Wizard } from '@/features/solar-studio/screens/Wizard';
import { STEP_COUNT } from '@/features/solar-studio/lib/steps';

export default function WizardPage() {
  const params = useParams();
  const step = Math.max(1, Math.min(STEP_COUNT, Number(params.step) || 1));
  return <Wizard step={step} />;
}
