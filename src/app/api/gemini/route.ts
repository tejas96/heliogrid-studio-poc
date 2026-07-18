// ─── Gemini vision proxy: roof detection from imagery (structured-only) ─────
// Binding rules (plan §E2 + user accuracy directive): server-side key,
// temperature 0, responseSchema-ENFORCED JSON (no prose can leak through),
// versioned prompt recorded as provenance, and instructions that forbid
// guessing — an empty result is always preferable to an invented roof.
// The client converts pixel output to meters and runs it through the SAME
// validateArtifact + ghost-review doorway as the geometric pipeline.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 25_000;
const MAX_IMAGE_BYTES = 4_000_000; // ~3 MB base64 → well under Gemini's limit

// Next route files may only export handlers — keep internal, echoed in responses
const GEMINI_PROMPT_VERSION = 'roof-detect-v1';

/**
 * The prompt is engineered for precision over recall:
 * explicit pixel-coordinate contract, no-guessing rules, per-entity
 * confidence, and permission to return nothing.
 */
function buildPrompt(widthPx: number, heightPx: number, kind: 'satellite' | 'photo'): string {
  return [
    `You are a precise photogrammetry annotator for rooftop solar design.`,
    kind === 'satellite'
      ? `The image is a top-down satellite view, exactly ${widthPx}×${heightPx} pixels. The property of interest is at the image CENTER.`
      : `The image is a property photograph (possibly oblique), ${widthPx}×${heightPx} pixels.`,
    ``,
    `TASK: outline each CLEARLY VISIBLE roof surface of the central building(s) as a pixel-coordinate polygon, and mark clearly visible rooftop objects (water tanks, solar water heaters, dishes, chimneys, staircase rooms).`,
    ``,
    `RULES — precision beats recall:`,
    `1. Trace only edges you can actually SEE. Never guess occluded, shadowed or ambiguous edges — omit that roof instead.`,
    `2. Pixel coordinates: x rightward 0..${widthPx}, y downward 0..${heightPx}. Every vertex must lie inside the image.`,
    `3. Polygons: 3–24 vertices, ordered along the outline, no self-intersections, no duplicate closing vertex.`,
    `4. confidence (0..1) = how clearly the outline is visible. Below 0.3, omit the entity entirely.`,
    `5. Do NOT include neighbouring properties' roofs unless they physically touch the central building.`,
    `6. Empty arrays are a VALID and correct answer when nothing is clearly visible.`,
    `7. Output ONLY the JSON — no explanations.`,
  ].join('\n');
}

/** Gemini structured-output schema: pixel-space entities. */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    roofs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          polygonPx: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
              required: ['x', 'y'],
            },
          },
          confidence: { type: 'NUMBER' },
        },
        required: ['polygonPx', 'confidence'],
      },
    },
    objects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          centerPx: {
            type: 'OBJECT',
            properties: { x: { type: 'NUMBER' }, y: { type: 'NUMBER' } },
            required: ['x', 'y'],
          },
          widthPx: { type: 'NUMBER' },
          heightPx: { type: 'NUMBER' },
          kind: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
        },
        required: ['centerPx', 'widthPx', 'heightPx', 'confidence'],
      },
    },
  },
  required: ['roofs', 'objects'],
};

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // graceful degradation is a feature: the UI explains instead of erroring
    return NextResponse.json(
      { status: 'unconfigured', message: 'Photo-based detection is not configured (GEMINI_API_KEY)' },
      { status: 200 },
    );
  }

  let body: {
    imageBase64?: string;
    mimeType?: string;
    widthPx?: number;
    heightPx?: number;
    kind?: 'satellite' | 'photo';
    /** satellite mode: server fetches the SAME static tile SatCanvas shows
     *  (CORS-proof, and guarantees the 1:1 pixel mapping the client assumes) */
    latLng?: { lat: number; lng: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid request body' }, { status: 200 });
  }
  const kind = body.kind === 'photo' ? 'photo' : 'satellite';
  let { imageBase64, mimeType, widthPx, heightPx } = body;

  if (kind === 'satellite' && body.latLng) {
    const { lat, lng } = body.latLng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ status: 'error', message: 'Invalid lat/lng' }, { status: 200 });
    }
    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!mapsKey) {
      return NextResponse.json({ status: 'error', message: 'No Maps key for tile fetch' }, { status: 200 });
    }
    // EXACTLY the SatCanvas tile: zoom 20, 640px, scale 1 — pixel-mapping contract
    const tileUrl =
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
      `&zoom=20&size=640x640&scale=1&maptype=satellite&key=${mapsKey}`;
    try {
      const tileRes = await fetch(tileUrl, { cache: 'no-store' });
      if (!tileRes.ok) {
        return NextResponse.json(
          { status: 'error', message: `Tile fetch HTTP ${tileRes.status}` },
          { status: 200 },
        );
      }
      const bytes = Buffer.from(await tileRes.arrayBuffer());
      imageBase64 = bytes.toString('base64');
      mimeType = tileRes.headers.get('content-type') ?? 'image/png';
      widthPx = 640;
      heightPx = 640;
    } catch {
      return NextResponse.json({ status: 'error', message: 'Tile fetch failed' }, { status: 200 });
    }
  }

  if (!imageBase64 || !mimeType || !widthPx || !heightPx) {
    return NextResponse.json({ status: 'error', message: 'Missing image data' }, { status: 200 });
  }
  if (imageBase64.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { status: 'error', message: 'Image too large — downscale before sending' },
      { status: 200 },
    );
  }

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildPrompt(widthPx, heightPx, kind) },
                { inlineData: { mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return NextResponse.json(
        { status: 'error', message: err?.error?.message ?? `Gemini HTTP ${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json(
        { status: 'error', message: 'Gemini returned no content' },
        { status: 200 },
      );
    }
    let detection: unknown;
    try {
      detection = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { status: 'error', message: 'Gemini output was not valid JSON' },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { status: 'ok', detection, promptVersion: GEMINI_PROMPT_VERSION, model },
      { status: 200 },
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'Gemini request timed out' : 'Gemini request failed' },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
