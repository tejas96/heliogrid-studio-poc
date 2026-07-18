// ─── Server-side Solar API key resolution ───────────────────────────────────
// The Solar endpoints are PAID — the key must not ship in the client bundle
// (the old client-side fetch exposed it in the JS and in network logs).
// Preferred: a dedicated GOOGLE_SOLAR_API_KEY restricted to the Solar API.
// Dev fallback: the public Maps key, so local setups keep working — but
// production should split the keys and API-restrict both (see .env.example).
export function serverSolarKey(): string | undefined {
  return process.env.GOOGLE_SOLAR_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}
