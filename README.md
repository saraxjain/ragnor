# Ragnor

**The clinical intelligence layer for consumer wearables.**

97% of physicians say they would review wearable data, but no more than 6% have it in their workflow (AMA, 2026). The blockers are trust (is this reading real, and has it been validated for someone like this patient?), noise (too many alerts) and the EHR. Ragnor sits between the watch and the clinician:

1. **Trust layer.** Every reading from the Google Health API gets a trust score (wear time, motion artifact, cross-device agreement, validation coverage for this person). Unverified readings are excluded before any model or rule sees them.
2. **Risk model + rules.** A validated 7-day injury-risk model and a versioned rules engine run on trusted data only.
3. **Agent debate (Google ADK + Gemini).** Signal-quality, baseline and clinical-relevance agents analyze in parallel; a skeptic agent argues every finding is noise; a lead agent writes a short pre-visit brief: discuss, watch, or ruled out as noise.
4. **Safety + sign-off.** Code-level guardrails (no diagnosis or clearance language, nothing built on unverified data), then a clinician signs and the brief is filed as a FHIR R4 DiagnosticReport with a trust score on every Observation.

Athletes are the first users (school athletes with watches, their coaches and team physicians). The app has a tab for each audience: **Athlete app**, **Coach view**, **Clinician**, and **Behind the scenes**, which runs the whole pipeline live.

Built at GDG UC Santa Cruz DevFest 2026 (theme: "Build, Secure, Scale"), submitted to the **Best Startup Potential** track.

> **Status: working app.** Runs end to end in demo mode with no keys; add Gemini, Google Health API and Firebase keys to go live. See [`docs/SETUP.md`](docs/SETUP.md).

## Run it on your laptop

You need **Node.js 22.18 or newer** (check with `node -v`; install from https://nodejs.org if needed) and **git**.

```bash
git clone https://github.com/saraxjain/ragnor.git
cd ragnor
npm install                 # first time only, takes a minute
cp .env.example .env.local  # creates your private keys file
npm run dev                 # starts the app
```

Open **http://localhost:3000**. Stop it with `Ctrl + C`. Next time, just `cd ragnor` and `npm run dev`.

### Adding API keys

Open `.env.local` (in the `ragnor` folder) in any editor, e.g. `code .env.local` or `open -e .env.local` on a Mac, and paste each key right after its `=`, with no spaces or quotes:

```
GEMINI_API_KEY=AIzaSy...your-key...
```

Save, then restart the app (`Ctrl + C`, `npm run dev`). The status pills on `/coach` turn green for each live service. `.env.local` is git-ignored: **never commit keys or paste them in Discord.** Full details per service: [`docs/SETUP.md`](docs/SETUP.md).

**Demo path (60 seconds):** open `/coach` and look at the ranked roster and morning briefing → open an athlete to see HRV vs their baseline → `/athlete/landing?id=ath_02` → **Use the sample result** → **Build my FixPlan** → `/report`.

## Features (planned)

| Feature | What it does | Powered by |
| --- | --- | --- |
| **LandingCheck** | Scores a phone video of a drop-jump landing against LESS-style errors (e.g., knees collapsing inward), with timestamps | Gemini video understanding + structured output |
| **FixPlan** | A warm-up built for the errors found, plus a weekly before/after landing comparison | Gemini |
| **Wearable layer** | Pulls resting HR, HRV and sleep from Pixel Watch / Fitbit | Google Health API |
| **Coach view** | "Who to look at today" roster, each with a reason and a source | Gemini + grounding with Google Search |

## Safety guardrails

- Never shows "cleared," "you're fine," "diagnosis" or "safe to play."
- A human approves every alert before it reaches a coach, parent or clinician.
- A rules engine decides the risk level; Gemini only extracts and explains.
- Every flag is logged with its inputs, rule version and reason.

## Stack

- Next.js 16 + TypeScript (one app: landing page, athlete app, coach dashboard, AD report, API routes), Material 3 / Fitbit-style UI, Firebase / Firestore mirror
- Gemini API (video, audio, structured output, function calling)
- Google Health API (Fitbit / Pixel Watch data)

**Team docs:** full plan [`docs/PLAN.md`](docs/PLAN.md) · pitch deck [`docs/Ragnor-pitch-deck.pdf`](docs/Ragnor-pitch-deck.pdf) · Devpost draft [`docs/DEVPOST.md`](docs/DEVPOST.md) · video script [`docs/VIDEO_SCRIPT.md`](docs/VIDEO_SCRIPT.md) · setup [`docs/SETUP.md`](docs/SETUP.md)

## Team

| Role | Owns |
| --- | --- |
| Video lead | LandingCheck, FixPlan comparison |
| Wearables lead | Google Health API sync, baselines |
| App lead | Next.js app, Firestore, rules engine, coach view, guardrails |
| Pitch lead | Market evidence, deck, demo script, Devpost (incl. business section), demo video |
