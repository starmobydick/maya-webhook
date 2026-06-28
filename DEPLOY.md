# Maya Webhook — Deploy Guide

End-to-end setup for the bare-bones Twilio + web-simulator webhook. Total time: **~25 minutes**.

You'll wire up:

- **Upstash Redis** — rate-limit counter + conversation state (free tier, 10k cmds/day)
- **Vercel** — serverless host for the webhook (free tier, plenty for TikTok traffic)
- **Groq API key** — Llama 3.3 70B for the LLM calls (free tier, no credit card)
- **Twilio** — point your existing number's webhook at the new endpoint
- **Hyperagent simulator artifact** — paste the Vercel `/chat` URL into the simulator's `BACKEND_URL` constant and republish

---

## 1. Upstash Redis (5 min, $0)

1. Go to <https://upstash.com> → sign in with GitHub or Google.
2. **Create Database** → name: `maya-webhook` → Type: **Regional** → Region: pick closest to your Vercel deploy region (e.g. `us-east-1`).
3. After creation, open the DB → **REST API** tab. You'll see:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   Copy both. You'll paste them into Vercel in step 3.

---

## 2. Groq API key (2 min, $0)

1. Go to <https://console.groq.com> → sign in with Google or GitHub.
2. **API Keys** → **Create API Key** → name it `maya-webhook-prod`.
3. Copy the key (starts with `gsk_`). No credit card needed.

Free tier: **14,400 requests/day, 30/min** on `llama-3.3-70b-versatile`. That's ~3,600 conversations/day — well above what TikTok will throw at you at launch.

---

## 3. Deploy to Vercel (8 min)

### Option A — CLI (fastest)
```bash
cd maya-webhook
npm install
npx vercel        # follow prompts; pick "Create new project"
npx vercel env add GROQ_API_KEY production
npx vercel env add UPSTASH_REDIS_REST_URL production
npx vercel env add UPSTASH_REDIS_REST_TOKEN production
npx vercel env add TWILIO_AUTH_TOKEN production
npx vercel --prod
```

### Option B — GitHub + Vercel UI
1. Push this folder to a new GitHub repo.
2. <https://vercel.com/new> → import the repo.
3. Settings → Environment Variables → add the four keys above (Production scope).
4. Deploy.

After deploy you'll have three live endpoints:

```
https://YOUR-PROJECT.vercel.app/api/sms      ← Twilio points here
https://YOUR-PROJECT.vercel.app/api/chat     ← Web simulator points here
https://YOUR-PROJECT.vercel.app/api/health   ← Uptime probe
```

Quick smoke test:
```bash
curl https://YOUR-PROJECT.vercel.app/api/health
# → {"ok":true,"service":"maya-webhook","time":"..."}
```

---

## 4. Reconfigure Twilio (3 min)

1. <https://console.twilio.com> → **Phone Numbers → Manage → Active numbers** → click your Maya number.
2. **Messaging Configuration** → "A message comes in" → set to **Webhook**, method **HTTP POST**, URL:
   ```
   https://YOUR-PROJECT.vercel.app/api/sms
   ```
3. Save.

Send yourself a test SMS to verify. You should see Maya's opening message within ~3 seconds.

---

## 5. Wire the web simulator to the backend (2 min)

The simulator (published as a Hyperagent webpage artifact) currently runs a deterministic client-side flow. To route it through the same bare-bones Claude path as SMS:

1. In this thread, ask: *"Point the simulator at `https://YOUR-PROJECT.vercel.app/api/chat`"*.
2. The agent will edit the simulator HTML's `BACKEND_URL` constant and republish.

Or do it manually: edit `maya-simulator.html`, change line:
```js
const BACKEND_URL = "";
```
to:
```js
const BACKEND_URL = "https://YOUR-PROJECT.vercel.app/api/chat";
```
and republish via PublishWebpage with the same `artifactId`.

---

## 6. Verify the rate limiter (1 min)

This is the audit's whole point — confirm the cap works BEFORE going live:

```bash
# Set up: replace +15555550100 with any test phone number string
for i in 1 2 3 4 5; do
  curl -s -X POST https://YOUR-PROJECT.vercel.app/api/sms \
    -d "From=+15555550100" -d "Body=test $i" \
    -H "Content-Type: application/x-www-form-urlencoded"
  echo "--- msg $i done"
done
```

On message 5 you should see Twilio receive back:
```
Demo limit reached. To see more, book a live platform tour here: https://calendly.com/duy-heatbooker/30min
```
…and **the Groq console should show only 4 calls**, not 5. That confirms LLM is skipped on capped users.

> ⚠️ In production, Twilio signature verification will REJECT these curl requests with `403`. Comment out the verification block in `api/sms.js` temporarily for the smoke test, then re-enable.

---

## 7. Pre-launch checklist

Before posting your TikTok bio link:

- [ ] `/api/health` returns 200
- [ ] Real SMS test: text the Twilio number → Maya replies with opener within 3s
- [ ] Real SMS test: complete the 3-question flow → receive Calendly link
- [ ] Spam test: send 5 SMS rapidly → 5th reply is "Demo limit reached"
- [ ] Web simulator: open the published Hyperagent artifact URL → flow works
- [ ] Web simulator: spam 21 messages → 21st reply is cap-reached
- [ ] Groq console shows incoming requests (proves LLM is wired)
- [ ] Upstash dashboard shows commands incrementing (proves Redis is wired)
- [ ] Calendly link in the closing message is correct: `https://calendly.com/duy-heatbooker/30min`
- [ ] Twilio number's SMS webhook URL matches the deployed Vercel URL

---

## Ongoing maintenance

**Updating Maya's behavior**: change `lib/prompt.js` AND the Maya Demo agent's system prompt in Hyperagent. They must stay in sync — Maya Demo is the staging surface, the webhook is production.

**Monitoring**: Vercel dashboard shows per-endpoint latency and error rates. For uptime alerts, point UptimeRobot (free) at `/api/health` with a 5-min check interval.

**Cost ceiling**: with Groq's free tier you pay $0 in LLM costs up to 14,400 req/day. Twilio SMS is $0.0079/msg. If you ever cross the free tier, paid Groq is ~$0.59/M input tokens — roughly $1.50 per 1000 conversations. Even 100k conversations/month stays under $150 LLM.

**Switching LLM providers later**: `lib/llm.js` uses the OpenAI SDK shape, so swapping to OpenAI / Cerebras / Together / any OpenAI-compatible endpoint is just changing `baseURL` and `apiKey` (and the model name). Anthropic SDK shape is different — switching back to Claude requires re-importing `@anthropic-ai/sdk` and using `messages.create` instead.
