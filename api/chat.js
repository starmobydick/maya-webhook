import { checkAndIncrement, getHistory, appendHistory } from "../lib/redis.js";
import { ask } from "../lib/llm.js";
import { CAP_REACHED_MESSAGE } from "../lib/prompt.js";

const WEB_LIMIT_PER_DAY = 20;         // higher than SMS — no carrier cost
const WEB_WINDOW_SECONDS = 24 * 3600;

// =============================================================================
// Web simulator endpoint — called by the Hyperagent-hosted iPhone-Messages page.
//
// Request:  { sessionId: string, message: string }
// Response: { reply: string, ended?: boolean }
//
// CORS: the simulator is published on Hyperagent's artifact domain; we set
// permissive CORS so the page can call this endpoint. If you want to lock it
// down, replace "*" with your specific artifact origin.
// =============================================================================
export default async function handler(req, res) {
  // ---- CORS preflight -------------------------------------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { sessionId, message } = req.body || {};
  if (!sessionId || typeof message !== "string") {
    return res.status(400).json({ error: "Missing sessionId or message" });
  }

  // Rate limit by IP (don't trust the client-supplied sessionId for abuse caps).
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const rlKey = `webrl:${ip}`;
  const { allowed } = await checkAndIncrement(rlKey, WEB_LIMIT_PER_DAY, WEB_WINDOW_SECONDS);

  if (!allowed) {
    return res.status(200).json({ reply: CAP_REACHED_MESSAGE, ended: true });
  }

  const sessionKey = `convo:web:${sessionId}`;
  const history = await getHistory(sessionKey);

  let reply;
  try {
    const { text } = await ask(history, message);
    reply = text;
  } catch (err) {
    console.error("LLM error:", err);
    return res.status(502).json({ reply: "Connection hiccup — try once more." });
  }

  // Don't store the cold-start sentinel
  if (message !== "__start__") {
    await appendHistory(sessionKey, "user", message);
  }
  await appendHistory(sessionKey, "assistant", reply);

  // Naive end-detection: closing message contains the booking link.
  const ended = reply.includes("calendly.com/duy-heatbooker");
  return res.status(200).json({ reply, ended });
}
