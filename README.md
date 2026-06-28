# Maya Webhook

Bare-bones Twilio + web-simulator backend for the Apex HVAC TikTok demo funnel. Built per the cost-protection audit.

## What this is

A ~200-line Vercel serverless app that:

1. Handles inbound SMS from Twilio (`/api/sms`)
2. Handles inbound web chat from the iPhone-style simulator (`/api/chat`)
3. Enforces a Redis-backed rate limit at the webhook layer (4 SMS/phone/24h, 20 web/IP/24h)
4. Calls Claude Sonnet directly with a ~250-token system prompt — bypassing Hyperagent's runtime to keep token cost minimal

## Why it exists

The Hyperagent-hosted Maya agent loads ~30k tokens of platform scaffolding per turn. Fine for paying clients, expensive at TikTok scale. This webhook is the production hot path for public demo traffic; Hyperagent Maya Demo stays as the staging mirror.

See `DEPLOY.md` for end-to-end setup.

## Layout

```
maya-webhook/
├── api/
│   ├── sms.js       # Twilio webhook
│   ├── chat.js      # Web simulator endpoint
│   └── health.js    # Liveness probe
├── lib/
│   ├── prompt.js    # System prompt — single source of truth for Maya's logic
│   ├── claude.js    # Anthropic SDK wrapper
│   └── redis.js     # Upstash rate-limit + conversation state
├── vercel.json
├── package.json
└── .env.example
```

## Environment variables

| Var | Source |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `UPSTASH_REDIS_REST_URL` | Upstash DB → REST API tab |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash DB → REST API tab |
| `TWILIO_AUTH_TOKEN` | Twilio console → Account → API keys |
| `MAYA_MODEL` (optional) | Defaults to `claude-sonnet-4-5` |

## Local dev

```bash
npm install
cp .env.example .env.local && # edit
npx vercel dev
```
