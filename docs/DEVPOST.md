# Ragnor — Devpost draft

**Track:** Best Startup Potential
**Tagline:** Wearable data doctors can actually trust.

## Inspiration
Our teammate Chelsi has had five concussions playing sports. She and most of her teammates wore smartwatches the whole time, and none of that data ever reached a doctor in a form they could use.

That turns out to be the norm. In a 2026 AMA / Medscape survey of 2,222 physicians, 97% said they would review a patient's wearable data, but no more than 6% had it in their workflow. The reasons they gave:
- the data doesn't reach the health record
- they aren't sure it's accurate
- they worry about liability

Accuracy is a real concern. Wrist sensors vary with skin tone, sex, age and BMI, manufacturers often don't publish validation, and teens are barely studied. Remote-monitoring programs already drown clinicians in alerts.

We stopped asking "how do we show more data?" and asked a different question: what would it take for a doctor to trust this data and act on it?

## What it does
Ragnor is the layer between the watch and the clinician.

1. **Trust-scores every reading.** Fitbit and Pixel Watch data arrive through the Google Health API. Each night's HRV, resting heart rate and sleep gets a 0–100 trust score based on:
   - wear time
   - motion artifact
   - cross-device agreement
   - whether that metric has been validated for someone like this person (for example, wrist HRV in teens)

   Readings under 50 are excluded before any model or rule sees them, and the reason is shown.
2. **Compares to the person's own normal.** A 7-day injury-risk model and a versioned rules engine run on trusted data only, alongside 20-second check-ins and a phone-video landing screen. The model is validated on held-out simulated athletes: it catches 83% of injuries vs 74% for rules alone.
3. **Lets AI agents argue.** Built with Google's Agent Development Kit on Gemini:
   - three analyst agents (signal quality, baseline, clinical relevance) work in parallel
   - a **skeptic agent** argues every finding is noise
   - a lead agent writes the brief

   Findings are sorted into *discuss*, *watch* or *ruled out as noise*, each with the skeptic's challenge and the response.
4. **Gives the clinician a brief they can sign.** Code-level safety checks run first: no diagnosis or clearance language, and nothing built on unverified readings. Then one click files the brief into the EHR as a FHIR R4 DiagnosticReport, with a trust score on every Observation.
5. **Closes the loop for athletes and coaches.** Athletes get plain-language feedback ("your watch was loose Saturday, wear it snug") and choose what to share with their doctor. Coaches get one list of who to look at today, plus an AI case review. Nothing is sent without a person approving it.

**Demo moment:** Ava's raw data looks alarming (HRV −11%, resting heart rate up). Ragnor finds her watch was worn only about 3.5 hours on those nights. The skeptic drops both findings, and her risk falls from 4.0% to 1.7%: a false alarm the doctor never has to see. Maya's drop shows up on trusted nights and is confirmed by her check-ins, so it survives the skeptic and becomes two items to discuss.

## How we built it
- **App:** Next.js 16 / React 19 / TypeScript. One codebase serves the athlete app, coach view, clinician view and a live "Behind the scenes" pipeline.
- **Google Health API** (Fitbit Web API successor) for wearable data; OAuth and webhooks are ready, and the demo uses sample data.
- **Google Agent Development Kit + Gemini:**
  - ParallelAgent analysts → skeptic → lead, with structured output schemas
  - a coach case conference where specialists vote and object, with a revision round
  - an ADK check-in agent that asks a follow-up instead of guessing
  - Gemini for voice and typed check-ins and landing-video analysis
- **Trust layer, feature engineering, logistic risk model** (L2, class-weighted, calibrated) and a versioned rules engine in TypeScript, with an evaluation harness (AUROC, calibration, sensitivity vs a rules baseline).
- **Safety:**
  - a guardrail filter on every AI output
  - fixed emergency text, never generated
  - human sign-off on everything
  - an audit log
  - a 30-scenario check-in safety eval run on every change
- **FHIR R4** export (DiagnosticReport, Observations with LOINC codes and trust extensions); Firebase for persistence.
- Every AI step has a deterministic offline fallback, so the demo works even when the API is busy.

## Challenges we ran into
- **Deciding what "trust" means for a single reading.** We combined signal quality, cross-source agreement and published validation coverage, and we show "unknown" rather than guess where no evidence exists.
- **Getting agents to disagree usefully.** The skeptic is only valuable if some findings don't survive it.
- **Gemini quota and high-demand errors mid-hackathon.** We added retries, timeouts and offline fallbacks.
- **Merging five people's work** across many branches overnight.

## Accomplishments we're proud of
- A false alarm visibly filtered out before it reaches a doctor.
- Honest validation and safety numbers, including where we don't win (precision is similar to the rules baseline).
- Output that drops into real health-record systems through a standard, rather than another dashboard.

## What we learned
More data isn't the bottleneck in wearables; trust is. And showing where a model *doesn't* know something builds more credibility than a confident score.

## What's next
- **Spring 2027 pilots:** high school and club programs plus the sports-medicine clinics that see their athletes.
- **Real data:** calibrate trust thresholds against reference devices, and replace simulated validation with real outcomes.
- **Expansion:** add more Google Health API data types (ECG, irregular rhythm notifications, skin temperature) and expand to remote-monitoring programs beyond athletes.

## Business model (planned)
- **Free** for athletes.
- **Sports-medicine clinics:** $12 per patient sharing data, per month.
- **Schools and clubs:** $20 per athlete per season ($40 for universities).
- **Wearable and EHR partners:** usage-based licensing of the trust-score API and FHIR feed.

## Built with
nextjs, react, typescript, gemini, google-agent-development-kit, google-health-api, fitbit, firebase, fhir

## Honesty notes
All athletes and wearable data in the demo are fictional. The risk model is validated on simulated data. Ragnor is decision support: it never diagnoses or clears anyone to play.

**Sources:**
- AMA / Medscape physician survey, 2026: https://www.axios.com/2026/07/08/doctors-cant-harness-wearables
- JMIR mHealth 2026, validation-study representation: https://mhealth.jmir.org/2026/1/e87324
- Google Health API: https://developers.google.com/health/about
