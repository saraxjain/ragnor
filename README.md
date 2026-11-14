# Ragnor

**Wearables collect the data. Ragnor turns it into a decision.**

Ragnor turns the wearables athletes already own into an athletic trainer for the many high schools that don't have one. Gemini combines smartwatch heart-rate-variability and sleep data, head-impact sensor alerts and a 10-second phone video of a jump landing to flag ACL and overload risk, with a plain-language reason and a fix. When a hit is logged or a sensor detects an impact, Ragnor phones the athlete every day for a week in an ElevenLabs voice, checks symptoms against the athlete's own wearable baseline, and alerts a trainer or parent. It flags risk early, but never diagnoses or clears anyone.

Built at GDG UC Santa Cruz DevFest 2026 (theme: "Build, Secure, Scale"), submitted to the **Best Startup Potential** track.

> **Status: working app.** Runs end to end in demo mode with no keys; add Gemini, ElevenLabs, Google Health API and Firebase keys to go live. See [`docs/SETUP.md`](docs/SETUP.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # rules engine + guardrails
```

**Demo path (60 seconds):** open `/coach` → **Run the scripted demo call** for Maya → watch the transcript, the four agent tool calls and the same-day alert land in the queue → **Approve** → open Maya to see HRV below her baseline after the hit → `/athlete/landing?id=ath_02` → **Use the sample result** → **Build my FixPlan** → `/report`.

## Features (planned)

| Feature | What it does | Powered by |
| --- | --- | --- |
| **HitWatch** (hero) | After a hit or mouthguard impact, calls the athlete daily for 7 days, compares symptoms and wearable data (HRV, sleep) to their baseline, and queues an alert for a human to approve | ElevenLabs voice agent + Gemini function calling + Google Health API |
| **LandingCheck** | Scores a phone video of a drop-jump landing against LESS-style errors (e.g., knees collapsing inward), with timestamps | Gemini video understanding + structured output |
| **FixPlan** | A warm-up built for the errors found, plus a weekly before/after landing comparison | Gemini |
| **Wearable layer** | Pulls resting HR, HRV and sleep from Pixel Watch / Fitbit; simulated mouthguard impact webhook | Google Health API |
| **Coach view** | "Who to look at today" roster, each with a reason and a source | Gemini + grounding with Google Search |

## Safety guardrails

- Never shows "cleared," "you're fine," "diagnosis" or "safe to play."
- A human approves every alert before it reaches a coach, parent or clinician.
- A rules engine decides the risk level; Gemini only extracts and explains.
- Every flag is logged with its inputs, rule version and reason.

## Stack

- Next.js 16 + TypeScript (one app: landing page, athlete app, coach dashboard, AD report, API routes), Material 3 / Fitbit-style UI, Firebase / Firestore mirror
- Gemini API (video, Live API, function calling, grounding)
- ElevenLabs conversational agent (outbound calls, Gemini as the LLM)
- Google Health API (Fitbit / Pixel Watch data)

See [`docs/PLAN.md`](docs/PLAN.md) for the full plan.

## Team

| Role | Owns |
| --- | --- |
| Video lead | LandingCheck, FixPlan comparison |
| Agent lead | HitWatch |
| Wearables lead | Google Health API sync, baselines, impact webhook |
| App lead | Next.js app, Firestore, rules engine, coach view, guardrails |
| Pitch lead | Market evidence, deck, demo script, Devpost (incl. business section), demo video |
