import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt.js";

// =============================================================================
// LLM ADAPTER — Groq via the OpenAI-compatible API.
//
// Why Groq:
//   - Free tier: 14,400 req/day, 30 req/min on Llama 3.3 70B.
//   - Lowest latency hosted LLM right now (~300-500ms). Critical for SMS feel.
//   - Uses the OpenAI SDK shape — trivial to swap to another provider later
//     by changing baseURL + apiKey.
// =============================================================================

let _client = null;
function client() {
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return _client;
}

const MODEL = process.env.MAYA_MODEL || "llama-3.3-70b-versatile";

// =============================================================================
// Call the LLM with the bare-bones prompt + accumulated history.
// Returns plain text. Errors bubble up so callers can decide how to surface.
// =============================================================================
export async function ask(history, userMessage) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  if (userMessage && userMessage !== "__start__") {
    messages.push({ role: "user", content: userMessage });
  }

  // For the cold-start "__start__" sentinel from the web simulator, the OpenAI
  // schema requires at least one user message, so synthesize a benign one.
  if (messages.length === 1) {
    messages.push({ role: "user", content: "Hi" });
  }

  const result = await client().chat.completions.create({
    model: MODEL,
    max_tokens: 200,   // SMS-length, hard ceiling on output cost
    temperature: 0.4,  // mostly deterministic; small wiggle for variety
    messages,
  });

  const text = (result.choices?.[0]?.message?.content || "").trim();
  return { text, usage: result.usage };
}
