import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.js";

let _client = null;
function client() {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Model is configurable so you can swap to Haiku later if you want to cut cost
// further. Sonnet is the audit's recommendation for the demo.
const MODEL = process.env.MAYA_MODEL || "claude-sonnet-4-5";

// =============================================================================
// Call Claude with the bare-bones prompt + accumulated history.
// Returns plain text. Errors bubble up so callers can decide how to surface.
// =============================================================================
export async function ask(history, userMessage) {
  const messages = [...history];
  if (userMessage && userMessage !== "__start__") {
    messages.push({ role: "user", content: userMessage });
  }

  // For the cold-start "__start__" sentinel from the web simulator, we want
  // Maya to emit the opening message without a prior user turn. Anthropic
  // requires at least one user message, so we synthesize a benign one.
  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hi" });
  }

  const result = await client().messages.create({
    model: MODEL,
    max_tokens: 200, // SMS-length responses, hard ceiling on output cost
    system: SYSTEM_PROMPT,
    messages,
  });

  const text = result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, usage: result.usage };
}
