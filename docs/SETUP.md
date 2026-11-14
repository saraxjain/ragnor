# Setup: running Ragnor and turning on each integration

Ragnor runs end to end with **no keys at all**: every feature falls back to demo mode on the fictional Westbrook High roster. Add keys one at a time; the coach dashboard's status pills show what's live.

## 1. Run it

```bash
npm install
cp .env.example .env.local     # fill in what you have
npm run dev                    # http://localhost:3000
npm test                       # rules engine + guardrail tests (17)
```

Node 22.18+ is required.

| Page | What it's for |
| --- | --- |
| `/` | Landing page for schools: problem, features, pricing, pilot sign-up |
| `/coach` | Coach dashboard: alert approval queue, ranked roster, Gemini briefing, HitWatch calls, mouthguard impact simulator |
| `/coach/athlete/[id]` | Athlete detail: why they're flagged (rule ids), HRV / resting HR / sleep vs baseline, HitWatch timeline, audit log |
| `/athlete` | Athlete app (mobile): today's status ring, wearable tiles, actions |
| `/athlete/checkin` | Voice or typed check-in (Gemini audio) |
| `/athlete/landing` | LandingCheck video screen + FixPlan |
| `/athlete/hitwatch` | Athlete side of HitWatch, including the in-browser voice call |
| `/report` | Season report for athletic directors (printable) |

**Reset the demo** any time with the "Reset demo" button on `/coach` (or `POST /api/demo/reset`). It returns to the morning before Maya's day-2 call, so the alert arrives live.

## 2. Gemini (do this first)

1. Get a key at Google AI Studio, or use event credits (organizers say to use Antigravity rather than AI Studio billing).
2. Set `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL` (needs video input + function calling).

That turns on: real video scoring in LandingCheck, voice check-ins (audio → structured JSON), Gemini-written FixPlans and briefings, and the HitWatch agent.

**HitWatch agent engine: Google's Agent Development Kit (ADK).** `lib/hitwatchAdk.ts` builds an ADK `LlmAgent` (Gemini) with four `FunctionTool`s (`log_symptoms`, `compare_to_baseline`, `draft_alert`, `schedule_followup`) and runs it with ADK's `InMemoryRunner`. The tools call the same rules engine and guardrails as everything else.
- Fallback chain, so the demo never breaks: **ADK → plain Gemini function calling → offline rules.**
- Force the plain function-calling loop with `HITWATCH_ENGINE=genai` in `.env.local`.
- `npm run adk:smoke` runs the real ADK loop with a stand-in model (no key needed) to check the wiring.
- The call screen labels which engine ran ("Google ADK agent + Gemini").

Videos are sent inline (keep them under 18 MB / ~10 seconds).

## 3. ElevenLabs (HitWatch voice)

### Create the agent
1. ElevenLabs → Conversational AI → **Create agent**.
2. **LLM:** pick a Gemini model.
3. **System prompt:** paste everything below the `---` in `shared/agent/hitwatch_system_prompt.md`.
4. **First message:** `Hi {{athlete_first_name}}, it's Ragnor, your team's check-in assistant. I'm calling about the hit you took {{hit_description}}. Do you have two minutes for a few quick questions?`
5. **Dynamic variables** (Ragnor sends these): `athlete_first_name`, `athlete_id`, `hit_id`, `day`, `hit_description`, `coach_name`.
6. Set `ELEVENLABS_AGENT_ID` (and `ELEVENLABS_API_KEY`).

### Tools: pick one style
- **Browser calls ("Talk in the browser")** use **client tools**. In the agent, add four client tools named `log_symptoms`, `compare_to_baseline`, `draft_alert`, `schedule_followup` with the parameters from `shared/agent/tools.json`. The browser runs them against `/api/hitwatch/tools/<name>`, so this works on localhost.
- **Phone calls** need **server (webhook) tools**: same four names and parameters, URL `https://<your-deployed-app>/api/hitwatch/tools/<name>`, method POST. If you set `RAGNOR_TOOL_SECRET`, add header `x-ragnor-secret: <value>`. The app must be publicly reachable (deploy it, or use a tunnel).

### Real phone calls
1. Import a Twilio number into ElevenLabs (Phone Numbers) and assign the agent.
2. Set `ELEVENLABS_PHONE_NUMBER_ID` and `DEMO_CALL_TO_NUMBER` (the teammate's phone that rings on stage).
3. "Start today's HitWatch call" now places a real call; the dashboard polls until the agent's tools report back.

If calls aren't configured, the same button falls back to the browser call (agent id only) or the scripted demo call.

## 4. Google Health API (Fitbit / Pixel Watch)

The legacy Fitbit Web API was turned off in fall 2026; Ragnor uses its replacement, the Google Health API (`https://health.googleapis.com/v4`).

1. Google Cloud console → enable the Google Health API → OAuth consent screen (testing) → **add every teammate as a test user** (all Google Health scopes are Restricted).
2. Create an OAuth client (Web). Authorized redirect URI: `${APP_URL}/api/health/callback`.
3. Set `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `APP_URL`.
4. On `/athlete`, tap **Connect with Google**. Ragnor reads `daily-heart-rate-variability`, `daily-resting-heart-rate` and `sleep` for the last 31 days, uses the older days as the baseline and the last 7 as "recent."

Scopes requested: `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.sleep.readonly`.
The payload field names for the daily HRV / resting-HR types weren't fully documented when we built this, so `lib/googleHealth.ts` parses them defensively. If values come back empty, log one raw response and adjust `findNumber` keys.

## 5. Firebase (optional)

Create a service account with Firestore access and set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep the `\n`s). Every write (alerts, HitWatch logs, check-ins, landing screens, sign-ups, audit log) is mirrored to Firestore. The in-memory store stays the source of truth for the demo.

## 6. Deploy (Cloud Run suggested, it's a Google event)

```bash
gcloud run deploy ragnor --source . --region us-west1 --allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --set-env-vars GEMINI_API_KEY=...,APP_URL=https://<service-url>
```

Keep **one instance**: the demo store lives in memory. Vercel works too (same caveat: state resets between cold starts, so hit "Reset demo" before judging).

## Safety rules built into the code

- `shared/lib/rules.ts` decides every risk band; Gemini only extracts and explains.
- `shared/lib/guardrails.ts` strips diagnosis / clearance language from **every** model output (`sanitizeDeep`).
- Red-flag answers show a fixed "get medical care now" message, never model-generated.
- `draft_alert` only drafts; a coach approves on `/coach` before anything is sent.
- Every flag, call and decision is in the audit log with the rules version.
