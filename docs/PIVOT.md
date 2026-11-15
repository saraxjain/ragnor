# Ragnor: positioning (updated Nov 14, 6 PM)

**One line:** Ragnor is the clinical intelligence layer for consumer wearables: it decides which readings to trust, lets AI agents argue about what matters, and hands the clinician a short brief they can sign into the EHR.

**Problem (AMA / Medscape survey of 2,222 physicians, 2026):** 97% would review wearable data; no more than 6% have integrated it. Blockers: EHR integration, accuracy concerns, liability. AMA asks vendors for FHIR-based ingestion and to show where algorithms are validated and where performance is unknown. Wrist PPG accuracy varies by skin tone, sex, age and BMI, and teens are under-represented in validation studies. Remote monitoring programs drown in alerts.

**What we built (all in the app):**
- Trust layer (`lib/trust.ts`): per-reading trust score; unverified readings excluded upstream of the risk model and rules engine.
- Pre-visit brief (`lib/brief.ts`): Google ADK agents (signal-quality, baseline, clinical-relevance in parallel, then skeptic, then lead), offline fallback, code safety checks, clinician sign-off, FHIR R4 DiagnosticReport.
- Risk model with validation, check-in safety evals, AI case conference for coaches (from earlier today).

**Demo path (2 min):**
1. Behind the scenes → choose **Ava** → Run the pipeline. Raw data says HRV −11% and resting HR up; the trust layer finds the watch was worn ~3.5 h on those nights; the skeptic drops both findings; risk falls from 4.0% to 1.7%. "That's a false alarm a clinician never has to see."
2. Switch to **Maya** → real recovery problem: HRV down on trusted nights, sleep debt confirmed by check-ins → 2 items to discuss, 1 to watch.
3. Clinician tab → Maya → Sign & send to EHR → FHIR bundle with a trust score on every Observation.
4. Athlete app → "Your watch data this week" card and "Share a summary with my doctor".

**Who pays:** sports-medicine clinics and team physicians (beachhead), then remote-monitoring programs and EHR / wearable partners via API. Schools keep the coach product ($20 / $40 per athlete per season).

**Honesty notes for judges:** all athletes and wearable data are fictional; the risk model is validated on simulated data; trust thresholds are a starting point to be tuned against reference devices in pilots.
