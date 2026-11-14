# Setup: running Ragnor and turning on each integration

Ragnor runs end to end with **no keys at all**: every feature falls back to demo mode on the fictional Westbrook High roster. Add keys one at a time; the coach dashboard's status pills show what's live.

## 1. Run it

```bash
npm install
cp .env.example .env.local     # fill in what you have
npm run dev                    # http://localhost:3000
npm test                       # rules engine + guardrail tests
```

Node 22.18+ is required.

| Page | What it's for |
| --- | --- |
| `/` | Landing page for schools: problem, features, pricing, pilot sign-up |
| `/coach` | Coach dashboard: alert approval queue, ranked roster, Gemini briefing |
| `/coach/athlete/[id]` | Athlete detail: why they're flagged (rule ids), HRV / resting HR / sleep vs baseline, audit log |
| `/athlete` | Athlete app (mobile): today's status ring, wearable tiles, actions |
| `/athlete/checkin` | Voice or typed check-in (Gemini audio) |
| `/athlete/landing` | LandingCheck video screen + FixPlan |
| `/report` | Season report for athletic directors (printable) |

**Reset the demo** any time with the "Reset demo" button on `/coach` (or `POST /api/demo/reset`).

## 2. Gemini (do this first)

1. Get a key at Google AI Studio, or use event credits (organizers say to use Antigravity rather than AI Studio billing).
2. Set `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL` (needs video input + function calling).

That turns on: real video scoring in LandingCheck, voice check-ins (audio → structured JSON), and Gemini-written FixPlans and briefings.

Videos are sent inline (keep them under 18 MB / ~10 seconds).

## 3. Google Health API (Fitbit / Pixel Watch)

The legacy Fitbit Web API was turned off in fall 2026; Ragnor uses its replacement, the Google Health API (`https://health.googleapis.com/v4`).

1. Google Cloud console → enable the Google Health API → OAuth consent screen (testing) → **add every teammate as a test user** (all Google Health scopes are Restricted).
2. Create an OAuth client (Web). Authorized redirect URI: `${APP_URL}/api/health/callback`.
3. Set `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `APP_URL`.
4. On `/athlete`, tap **Connect with Google**. Ragnor reads `daily-heart-rate-variability`, `daily-resting-heart-rate` and `sleep` for the last 31 days, uses the older days as the baseline and the last 7 as "recent."

Scopes requested: `googlehealth.health_metrics_and_measurements.readonly`, `googlehealth.sleep.readonly`.
The payload field names for the daily HRV / resting-HR types weren't fully documented when we built this, so `lib/googleHealth.ts` parses them defensively. If values come back empty, log one raw response and adjust `findNumber` keys.

## 4. Firebase (optional)

Create a service account with Firestore access and set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep the `\n`s). Every write (alerts, check-ins, landing screens, sign-ups, audit log) is mirrored to Firestore. The in-memory store stays the source of truth for the demo.

## 5. Deploy (Cloud Run suggested, it's a Google event)

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
- Alerts are only drafted; a coach approves on `/coach` before anything is sent.
- Every flag and decision is in the audit log with the rules version.
