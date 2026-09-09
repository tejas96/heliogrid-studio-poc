// ─── Post-processing: ambient occlusion + bloom + anti-aliasing + tone mapping ─
// Ground-truth realism is cheap here: N8AO darkens the creases where a module
// meets its rail and a leg meets the deck (the "floating table" look is mostly
// missing occlusion), threshold bloom gives the specular and the sun disc the
// light bleed a camera would record, SMAA replaces MSAA (which the composer
// cannot use), and ACES tone mapping moves into the chain so the composer's
// output matches what the bare renderer produced before.
import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, N8AO, Bloom, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

// The composer's frame buffer is HalfFloat by DEFAULT in
// @react-three/postprocessing (`frameBufferType = HalfFloatType`), so HDR light
// stays above 1.0 until the tone-mapper. That is what makes the threshold below
// mean something: an 8-bit buffer would clip the sun-lit roof to white before
// either bloom or ACES ever saw it, and every bright pixel would bloom equally.

/**
 * Bloom fires only ABOVE this luminance, so it picks out the specular on the
 * module glass and leaves the diffuse roof deck alone.
 *
 * A white roof under a strong sun is bright but it is not a light SOURCE, and a
 * bloom that treats it as one hazes the whole frame — the "everything glows"
 * look that reads as a game, not a photograph.
 *
 * MEASURED on this project at noon, one fixed camera, each threshold compared
 * against the same bloom-off frame (fraction of the frame that moved by more
 * than 6/765, and the mean and peak change):
 *
 *   1.1  →  97.3 % of the frame moved, mean 31.9, peak 317  — washes everything
 *   2.0  →  43.7 %,                    mean 14.3, peak 121  — a restrained lift
 *   5.0  →   0.0 %,                    nothing at all       — above the scene's peak
 *
 * So the whole usable range sits between about 1 and 5, and 2.0 is the value
 * that bleeds the highlights without lifting the deck. Re-measure this if the
 * sun intensity ramp in Scene3D changes: it sets the scale these numbers live on.
 */
const BLOOM_THRESHOLD = 2.0;

/**
 * The frame budget a device must hold to keep ambient occlusion.
 * 22 ms ≈ 45 fps — slower than that and orbiting the model feels worse than the
 * occlusion is worth.
 */
const SLOW_FRAME_MS = 22;
/** Frames to ignore first: shader compiles, texture uploads and the GLB parse land here. */
const WARMUP_FRAMES = 20;
/** Frames to time before deciding. */
const SAMPLE_FRAMES = 45;
/**
 * Frames longer than this are thrown away as stalls, not measurements: a hidden
 * tab waking up, a blocked main thread, a dev-server recompile.
 *
 * It is deliberately GENEROUS. A tighter cut (say 100 ms) would discard every
 * sample from the very devices this is meant to catch — one rendering at 8 fps
 * would never collect a sample and so would never downgrade. The median below
 * is what actually rejects outliers; this only needs to exclude the stalls that
 * are orders of magnitude out.
 */
const STALL_MS = 1000;

/**
 * How heavy a chain this device can actually carry, MEASURED.
 *
 * This used to be guessed from `navigator.userAgent` and
 * `navigator.hardwareConcurrency <= 4`. Neither describes a GPU: an M-series
 * MacBook reports 8 cores and renders the full chain effortlessly, while a
 * desktop with 8 weak cores and integrated graphics reports "not low power" and
 * then crawls. Core count is not a graphics card and a User-Agent is not a
 * benchmark.
 *
 * So: start optimistic, time real frames, and downgrade ONCE if they are slow.
 * The decision is one-way — an upgrade path would oscillate, because dropping
 * AO makes frames fast again, which would argue for turning it back on.
 */
function useMeasuredTier(): 'full' | 'lite' {
  const [tier, setTier] = useState<'full' | 'lite'>('full');
  const samples = useRef<number[]>([]);
  const seen = useRef(0);
  const decided = useRef(false);
  const wasContinuous = useRef(false);

  useFrame((state, delta) => {
    // Only a frame that follows another continuous frame is a measurement.
    // Once the loop is asleep (three/useSceneActivity) the gap between two
    // frames is how long the user paused, not how long the GPU took — and a
    // 400 ms pause would read as a 2 fps device and throw the occlusion away.
    const continuous = state.frameloop === 'always';
    const usable = continuous && wasContinuous.current;
    wasContinuous.current = continuous;
    if (decided.current || !usable) return;
    seen.current += 1;
    if (seen.current <= WARMUP_FRAMES) return;
    const ms = delta * 1000;
    if (ms > STALL_MS) return; // a stall, not a measurement
    samples.current.push(ms);
    if (samples.current.length < SAMPLE_FRAMES) return;
    decided.current = true;
    // the median, not the mean — one garbage-collection spike must not decide this
    const sorted = [...samples.current].sort((a, b) => a - b);
    if (sorted[sorted.length >> 1] > SLOW_FRAME_MS) setTier('lite');
  });

  return tier;
}

/**
 * Above this many pixels, AO runs at half resolution.
 *
 * This is a SIZE fact, not a device guess, so it survives the move to a
 * measured tier: a 2500 px hero render asks for the same work per pixel as a
 * small viewport does, and there are five times as many pixels.
 */
const HALF_RES_PIXELS = 2_200_000;

/**
 * One definition, used by both tiers — the two chains must not drift apart on
 * the setting that decides whether the frame reads as a photograph.
 * `mipmapBlur` is what makes a wide bloom cheap: a few small downsampled passes
 * rather than one big blur at full resolution.
 */
function SpecularBloom() {
  return (
    <Bloom
      intensity={0.6}
      luminanceThreshold={BLOOM_THRESHOLD}
      luminanceSmoothing={0.3}
      mipmapBlur
      radius={0.75}
    />
  );
}

export function ScenePost() {
  const tier = useMeasuredTier();
  const size = useThree((s) => s.size);
  const halfRes = size.width * size.height > HALF_RES_PIXELS;

  if (tier === 'lite') {
    // AO is the expensive one and the first to go. Bloom stays: it is a few
    // small passes, and it is what makes the frame read as a photograph —
    // dropping it would cost most of the realism to save little.
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <SpecularBloom />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={1.1} distanceFalloff={0.8} intensity={2.2} quality="medium" halfRes={halfRes} />
      <SpecularBloom />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
