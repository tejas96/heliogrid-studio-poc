// ─── Post-processing: ambient occlusion + anti-aliasing + tone mapping ──────
// Ground-truth realism is cheap here: N8AO darkens the creases where a module
// meets its rail and a leg meets the deck (the "floating table" look is mostly
// missing occlusion), SMAA replaces MSAA (which the composer cannot use), and
// ACES tone mapping moves into the chain so the composer's output matches what
// the bare renderer produced before.
import { useMemo } from 'react';
import { HalfFloatType } from 'three';
import { useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

const POST_MODE: 'smaa' | 'full' = 'full';
const TONE_MAP_EFFECT = true;

// HalfFloat frame buffers keep HDR light above 1.0 until the tone-mapper — an
// 8-bit buffer clips the sun-lit roof to white before ACES ever sees it.

/** A modest GPU (mobile, integrated) gets anti-aliasing only. */
function lowPower(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile || cores <= 4;
}

export function ScenePost() {
  const size = useThree((s) => s.size);
  const low = useMemo(lowPower, []);
  // very large canvases at 1.5× dpr: half-resolution AO keeps the frame budget
  const halfRes = low || size.width * size.height > 2_200_000;
  if (low || POST_MODE === 'smaa') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={HalfFloatType}>
        <SMAA />
        {TONE_MAP_EFFECT && <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />}
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={1.1} distanceFalloff={0.8} intensity={2.2} quality="medium" halfRes={halfRes} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
