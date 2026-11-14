# Ragnor app notes

App documentation for the Next.js app (the team README and `docs/PLAN.md` are the spec). Everything runs in **demo mode** with zero configuration: an in-memory store seeded with clearly labelled fictional athletes (initials only), mock wearables, scripted AI examples and a scripted HitWatch.

## Run
`npm install`, `npm run dev`, open http://localhost:3000. Pick a demo role. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.

## What is real, mock, planned

| Piece | State |
| --- | --- |
| Rules engine, flags with inputs/rule version/reason, audit log, consent gate for minors | Built and tested |
| Human approval queue (rules create pending alerts; the reviewer approves or dismisses; only approved alerts reach coach/parent) | Built and tested |
| Coach view "Who to look at today" (approved alerts: reason + source; never raw data) | Built and tested |
| Shared JSON shapes (`landing`, `checkin`, `hitwatch`) + ingest endpoints | Built and tested |
| Wearable layer: mock provider (default), baselines (median of previous 14 days, unvalidated), deltas | Built and tested |
| Google Health API provider + OAuth routes | Built from the docs; **never run** (needs your Google Cloud project). Mock stays the default |
| Simulated mouthguard impact webhook (secret, validated, idempotent) and "Simulate impact" button | Built and tested |
| HitWatch server side (agent tools, keyword red-flag second check, 7-day timeline, missed days, due today) | Built and tested |
| HitWatch scripted 7-day demo | Built and tested |
| HitWatch voice agent (ElevenLabs), in-browser talk, outbound call trigger | Code written from the docs; **never run**. Needs your ElevenLabs agent: `docs/HITWATCH_SETUP.md` |
| Gemini debate panel | Code written from the docs; **never run** (no key). Scripted example is the default and is always labelled |
| Search grounding for the coach-view source | Stub (`src/lib/grounding.ts`); no citation is ever attached |
| Firestore data layer (`firebase-admin`, server-only, deny-all `firestore.rules`) | Type-checked; **never run** (no project or emulator) |
| Real sign-in, notifications/SMS, LandingCheck/FixPlan video pipeline | Not built (teammates / later) |

## Safety rules (from the team README) and where they are enforced
1. Never shows "cleared", "you're fine", "diagnosis" or "safe to play" (our scan is stricter): `tests/banned-phrases.test.ts` scans every user-facing string in `src/app`, `src/components`, `src/lib`; the same check runs at runtime on panel text and HitWatch summaries.
2. A human approves every alert before it reaches a coach, parent or clinician: alerts are created `pending`; `GuardedDataAccess` lets only a trainer (the "reviewer") decide; coaches/parents can only read approved alerts. The athlete sees their own urgent "see a clinician now" guidance immediately (it is theirs, not sent to a third party). Every queue action is audit-logged.
3. A rules engine decides the risk level; Gemini only extracts and explains: the panel's guardrail sets `final level = rules level` always and records any level a model states as overridden.
4. Every flag is logged with its inputs, rule version and reason (`replay()` reproduces it).
Also: red-flag symptoms always give urgent + a top-priority pending alert; missing data is labelled low confidence, never guessed; minors need guardian consent before any health data is submitted (PLAN.md says participants are adults, but the product targets high-schoolers, so the gate stays).

## Rules (all thresholds are UNVALIDATED placeholders pending clinician review)
See the "Behind the scenes" page (`/judges`): it is generated from `THRESHOLDS` and the rule objects. Rules: `red-flag`, `post-impact-symptom`, `hitwatch-escalation`, `unconfirmed-red-flag`, `missed-followup`, `sleep-load`, `soreness-persisting`, `hrv-sleep`, `landing-band`, `insufficient-data`. Red-flag list 1 is the CDC HEADS UP danger signs (https://www.cdc.gov/heads-up/signs-symptoms/index.html, accessed 2026-11-14); list 2 (numbness, weakness, swelling, a pop, recurring spasms) is the founders' doc and unvalidated.

## Env vars (all optional; see `.env.example`)
`GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID`, `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_REDIRECT_URI`, `FIREBASE_PROJECT_ID` (+ `GOOGLE_APPLICATION_CREDENTIALS`), and three shared secrets: `INGEST_SECRET`, `IMPACT_WEBHOOK_SECRET`, `HITWATCH_TOOL_SECRET` (an unset secret disables its endpoint with 503; a wrong one is 401). Only booleans derived from keys are ever sent to pages.

## Endpoints (header `x-ragnor-secret` where noted)
- `POST /api/ingest/landing`, `POST /api/ingest/checkin` (INGEST_SECRET): body `{"athlete_id": "...", "landing": {...}}` / `{"athlete_id": "...", "checkin": {...}}`, shapes from `docs/PLAN.md` (`checkin.intensity` and `checkin.note` are optional extensions). A moderate/high landing band becomes a flag (unvalidated rule `landing-band`).
- `POST /api/webhooks/impact` (IMPACT_WEBHOOK_SECRET): `{"event_id","athlete_id","occurred_at","peak_g"?,"device_id"?}`; idempotent on `event_id`; starts the 7-day HitWatch follow-up.
- `POST /api/hitwatch/tools/{context,log,end}` (HITWATCH_TOOL_SECRET): what the ElevenLabs agent's server tools call.
- `POST /api/hitwatch/place-call` (reviewer session): asks ElevenLabs to place today's call. **Never invoked by this repo.**
- `GET /api/hitwatch/signed-url` (athlete session), `GET /api/wearables/google/{connect,callback}`, `POST /api/panel` (judges page, demo only).

## Doc URLs read (accessed 2026-11-14)
- Gemini: https://aistudio.google.com/docs/get-started, /docs/structured-output, /docs/google-search (the ai.google.dev URLs redirect there). The docs now show the Interactions API (`ai.interactions.create`, model `gemini-4-hydrogen`); the client follows that.
- Google Health API: https://developers.google.com/health, /health/get-started, /health/setup.md.txt, /health/reference/rest, https://health.googleapis.com/$discovery/rest?version=v4. Field names inside the daily HRV and resting-HR data points were not in the part of the schema I could read, so those two are parsed defensively and must be verified.
- ElevenLabs: listed in `docs/HITWATCH_SETUP.md` (outbound call, server tools, LLM choice, React SDK, Twilio numbers, dynamic variables).
- Firebase: https://firebase.google.com/docs/admin/setup, /docs/firestore/security/get-started.

## What you must set up yourself
Gemini key; ElevenLabs agent (prompt, 3 tools, Gemini LLM, secrets) and optionally a Twilio-imported phone number; a Google Cloud project with the Google Health API enabled, a Web Server OAuth client, consent screen with test users (unverified clients are capped at 100 users and Testing-mode refresh tokens expire after 7 days); a Firebase project and a service-account key; a tunnel (ngrok/cloudflared) so ElevenLabs can reach localhost; the three shared secrets.

## Privacy
Audio goes to ElevenLabs; text (de-identified case brief) goes to Gemini; the app stores no audio and no full transcripts. Voice and spoken text can contain identifying details. Calling or recording minors needs consent wording and a privacy/legal review before any real athlete uses it. No legal conclusion is made here, including about HIPAA, FERPA or FDA status.

## Conflicts and open points with the team README / PLAN
- PLAN says participants are adults while the product targets high-schoolers: the minor-consent gate is kept.
- README says the coach view has "a reason and a source" while the app's privacy rule is that coaches never see raw health data: reconciled by showing only reviewer-approved alerts (rule id + version as the source).
- README names Gemini "Live API" and "grounding with Google Search"; only structured output is used, grounding is a stub.
- The drafted `checkin` shape has `load_min` but no intensity, so load cannot be computed from it alone; an optional `intensity` extension was added.
- Removed from our old plan per the new direction: Supabase/SQL/PGlite, Anthropic, the voice speech-to-text form helper. The coach view no longer shows training load (it is derived from raw check-ins).
