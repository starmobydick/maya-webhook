import twilio from "twilio";
import { checkAndIncrement, getHistory, appendHistory } from "../lib/redis.js";
import { ask } from "../lib/claude.js";
import { CAP_REACHED_MESSAGE } from "../lib/prompt.js";

const SMS_LIMIT_PER_DAY = 4;          // audit spec: 4 msgs / phone / 24h
const SMS_WINDOW_SECONDS = 24 * 3600;

// =============================================================================
// Twilio SMS webhook — runs on every inbound text to your Maya number.
//
// Flow:
//   1. Verify Twilio signature (prevents spoofed POSTs).
//   2. Redis INCR on the sender's phone number.
//      - Over cap → reply with the cap-reached SMS, NO LLM call.
//      - Under cap → fetch conversation history, call Claude Sonnet,
//                    persist the new turn, reply via TwiML.
// =============================================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  // Vercel parses form-encoded bodies into req.body for serverless functions.
  const body = req.body || {};
  const from = body.From || "";
  const messageBody = (body.Body || "").trim();

  if (!from) return res.status(400).send("Missing From");

  // -------- Twilio signature verification ------------------------------------
  if (process.env.NODE_ENV === "production") {
    const signature = req.headers["x-twilio-signature"];
    const url = `https://${req.headers.host}${req.url}`;
    const valid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      body
    );
    if (!valid) return res.status(403).send("Invalid Twilio signature");
  }

  // -------- Rate limit -------------------------------------------------------
  const rlKey = `smsrl:${from}`;
  const { allowed } = await checkAndIncrement(rlKey, SMS_LIMIT_PER_DAY, SMS_WINDOW_SECONDS);

  if (!allowed) {
    return sendTwiml(res, CAP_REACHED_MESSAGE);
  }

  // -------- LLM call ---------------------------------------------------------
  const sessionKey = `convo:sms:${from}`;
  const history = await getHistory(sessionKey);

  let replyText;
  try {
    const { text } = await ask(history, messageBody);
    replyText = text;
  } catch (err) {
    console.error("Claude error:", err);
    replyText = "Sorry — having a hiccup on my end. Try once more in a sec?";
  }

  // Persist both sides of the turn
  await appendHistory(sessionKey, "user", messageBody);
  await appendHistory(sessionKey, "assistant", replyText);

  return sendTwiml(res, replyText);
}

// TwiML response — Twilio sends this text back as an SMS to the user.
function sendTwiml(res, message) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  res.setHeader("Content-Type", "text/xml");
  return res.status(200).send(twiml);
}
