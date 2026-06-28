import { Redis } from "@upstash/redis";

// Constructed lazily so the module loads even if env vars aren't set yet
// (helpful during local dev / CI).
let _client = null;
function client() {
  if (_client) return _client;
  _client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _client;
}

// =============================================================================
// RATE LIMITING — webhook-layer cap. This is the audit's whole point.
// Returns { allowed: boolean, count: number, capMessage?: string }.
// =============================================================================
export async function checkAndIncrement(key, limit, windowSeconds) {
  const r = client();
  const count = await r.incr(key);
  if (count === 1) {
    // First message in the window — set the TTL so the counter expires.
    await r.expire(key, windowSeconds);
  }
  return {
    allowed: count <= limit,
    count,
  };
}

// =============================================================================
// CONVERSATION HISTORY — keep last N turns per session so context is cheap.
// =============================================================================
const HISTORY_TTL_SECONDS = 4 * 60 * 60; // 4 hours
const MAX_TURNS = 12; // ~6 user + 6 assistant messages; plenty for a 3-question flow

export async function getHistory(sessionKey) {
  const r = client();
  const raw = await r.get(sessionKey);
  if (!raw) return [];
  // Upstash auto-parses JSON
  return Array.isArray(raw) ? raw : [];
}

export async function appendHistory(sessionKey, role, content) {
  const r = client();
  const history = await getHistory(sessionKey);
  history.push({ role, content });
  const trimmed = history.slice(-MAX_TURNS);
  await r.set(sessionKey, trimmed, { ex: HISTORY_TTL_SECONDS });
  return trimmed;
}
