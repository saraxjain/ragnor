# Ragnor: DevFest hackathon plan (full)

Single source of truth for the team. Track: **Best Startup Potential** (one track per project).
Pitch deck: [`docs/Ragnor-pitch-deck.pdf`](Ragnor-pitch-deck.pdf) · Setup: [`docs/SETUP.md`](SETUP.md) · Devpost draft: [`docs/DEVPOST.md`](DEVPOST.md) · Video script: [`docs/VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md)

## Ragnor in two sentences

**Ragnor turns the wearables athletes already own into an athletic trainer for the many high schools that don't have one: a 60-second daily check-in, Fitbit / Pixel Watch HRV and sleep, and a 10-second phone video of a jump landing become a plain-language risk flag with its likely cause and what to do.** **After any hit, Ragnor phones the athlete every day for a week, checks symptoms against their own baseline, and drafts an alert for a trainer or parent. It flags risk early but never diagnoses or clears anyone.**

Tagline: *Wearables collect the data. Ragnor turns it into a decision.*

## Event rules (GDG UC Santa Cruz DevFest 2026)

- **Devpost deadline: Sun Nov 15, 8:30 AM PST** (the kickoff slides said 11:00; Devpost is earlier, so plan for 8:30). **Submit by 8:00.**
- Demo video: **2 minutes or less**, uploaded to Devpost.
- Judging is science-fair style at our table (live demo, slides and/or video). Expect technical questions.
- Students only, above the legal age of majority. Add every teammate to the Devpost project.
- Theme: "Build, Secure, Scale: Developers and Builders in the Agentic Era." HitWatch is the agent story; the guardrails are the security story.
- Credits: g.dev/credits/devfest-santa-cruz (personal Google account; not compatible with AI Studio billing, so use Antigravity).

**Best Startup Potential criteria** (from Devpost) and our answer:

| Criterion | Ragnor |
| --- | --- |
| Real problem for a specific, named user | Athletic directors, trainers and coaches at high schools; most public high schools have no full-time athletic trainer |
| Know how you're different | Preventative and daily, explains every flag, follows up after hits; existing tools are after-the-fact (ImPACT, ATS) or pro-priced (Catapult ~$28K/team) |
| Plan to reach users | Founder network of athletes, trainers and coaches → free pilots → school / conference deals |
| Evidence of demand | Published data (below) |
| Rough business model | $20 per athlete per season (high schools), $40 (universities, park districts), custom for pro |

## The problem

- **Injuries are predictable; the warning signs go unread.** Strength and neuromuscular training cut sports injuries substantially (Lauersen et al., Br J Sports Med 2014), and concussions are about 8.9% of high school sports injuries (Gessel et al., J Athl Train 2007).
- **No one to read them:** only about 37% of US public high schools have a full-time athletic trainer, and about 31% have no trainer access at all ([NATA / KSI ATLAS](https://www.athleticbusiness.com/high-school/one-third-of-high-schools-operating-without-athletic-trainer.html)).
- **Concussions go unreported:** roughly 4 in 10 possible concussions in high school athletes never reach a coach or medical professional ([Register-Mihalik et al. 2013](https://concussions.smart-teams.org/?p=1820)).
- **ACL tears are screenable:** female athletes in jumping and cutting sports tear their ACL several times more often than male athletes ([Grindstaff et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1748422)). The LESS landing screen needs a trained rater ([Hanzlíková & Hébert-Losier 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7040940)).
- Founder story (Chelsi): *"Five concussions taught me the warning signs were there. Nobody was reading them."*

## The solution: Log → Predict → Act (from the deck), plus what makes it ours

1. **Log (60 seconds):** sleep, soreness on a body map, practice and workouts, food. Tap-based, or talk for 20 seconds and Gemini fills it in. Fitbit / Pixel Watch adds HRV, resting heart rate and sleep automatically.
2. **Predict:** a versioned rules engine (moving to a trained model as labeled outcomes accumulate) spots risk patterns against each athlete's own baseline.
3. **Act:** each flag shows its likely cause and one thing to do ("Got it" / "Tell my trainer"). Trainers and coaches see team-wide flags and a weekly report.

Differentiators added for the hackathon:
- **HitWatch:** after a hit (logged, or from a sensor mouthguard), an AI voice agent calls the athlete daily for 7 days, compares symptoms and HRV to their baseline, and drafts an alert a human approves. Built from the founder's delayed-symptom concussion.
- **LandingCheck + FixPlan:** Gemini scores a phone video of a drop jump for ACL-linked landing errors with timestamps, then builds a 10-minute warm-up.
- **Season report** for athletic directors (documentation for concussion protocols lowers liability).

## Wearables: why this is medtech's future

Medtech is moving from the clinic onto the body. Wearables already collect the signals that matter (HRV, resting HR, sleep, head impacts), but almost nobody turns them into a decision. Ragnor is that interpretation layer.

| Wearable | Signal | Use in Ragnor | Status |
| --- | --- | --- | --- |
| Fitbit / Pixel Watch via the [Google Health API](https://developers.google.com/health/about) | HRV, resting HR, sleep | Personal baseline; "not back to baseline" flags | Built (OAuth + sync). The old Fitbit Web API is turned off; scopes are Restricted, so add teammates as test users |
| Sensor mouthguards (e.g. Prevent Biometrics) | Impact force | >60 g auto-starts HitWatch | Simulated webhook |
| Phone camera | Movement | LandingCheck | Built |

Evidence wording for the pitch: HRV drops after concussion and recovers with symptoms but lags and **can't diagnose** ([Anderson et al. 2020](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8240878/)), so Ragnor only ever says "not back to baseline yet."

## How Gemini, ElevenLabs and Google services are used

| Feature | Technology |
| --- | --- |
| LandingCheck | Gemini video understanding + structured JSON output (one field per landing error, timestamp, confidence) |
| Check-in (voice) | Gemini audio → structured fields |
| HitWatch | ElevenLabs voice + **Google Agent Development Kit (ADK)** agent on Gemini with tools `log_symptoms`, `compare_to_baseline`, `draft_alert`, `schedule_followup` (fallback: plain function calling, then offline rules) |
| FixPlan, coach briefing | Gemini structured output |
| Wearables | Google Health API |
| Data | Firebase / Firestore mirror |

## Safety guardrails (put on a slide)

- The rules engine decides every risk level; AI only extracts and explains.
- A filter blocks "diagnosis," "cleared," "safe to play," "you're fine" from every AI output.
- Red-flag answers show a fixed "get medical care now" message.
- No alert reaches a parent, coach or clinician without a human approving it.
- Every flag stores its inputs, rule version and reason (audit log).
- Demo data is fictional; real pilots need parental consent and a FERPA / HIPAA review.

## Market and business model (matches the deck)

| Segment | Math | Size |
| --- | --- | --- |
| Beachhead: US high school athletes | 8,266,244 (NFHS 2024–25) × $20/season | $165.3M |
| + NCAA athletes | 554,298 × $40/season | $22.2M |
| + Park districts | 1,668 × ~1,000 athletes (estimate) × $40 | $66.7M |
| **SAM** | | **$254.2M** |
| TAM: global sports technology | MarketsandMarkets 2025 | $34.25B |

Institutions pay per athlete per season; free for athletes. Why they pay: it saves trainers hours of tracking, and the paper trail for concussion protocols lowers liability. Our $20–$40 sits between student tools (Volt ~$900–1,400/yr, TeamBuildr ~$90/mo, ImPACT ~$500/school) and pro tools (Catapult >$28K/team/yr).

## Competition (brief acknowledgment in the pitch)

"Apps that screen a landing and coaches that read your watch exist. None are preventative, explain risk daily, and follow through for a team without a trainer."

For judge questions: Hurtblocker (McGill ACL video screen, single test), Fitbit's Gemini health coach (individual adult wellness), XLNTBrain / concussion software (starts after a trainer opens a case), Prevent Biometrics (alerts at impact only), Catapult / Kinexon / Kitman (pro budgets), TeamBuildr / Volt (training logs), ImPACT (after the hit), ATS (after the injury).

## Proof of demand (published data, no interviews)

- Hurtblocker reached 4,000 downloads in two months, with 12 universities signing on ([CTV](https://www.ctvnews.ca/montreal/article/muhc-develops-app-to-predict-and-prevent-acl-injuries/)).
- Google launched a Gemini-powered Fitbit health coach in 2025 ([Android Authority](https://www.androidauthority.com/google-personal-health-coach-preview-launch-3610243/)).
- Schools already pay for safety tech: a Texas booster club paid about $150 per sensor mouthguard ([FOX 4](https://www.fox4news.com/news/coppell-high-school-invests-in-high-tech-mouthguards-for-football-players)).

## Team

| Person | Owns |
| --- | --- |
| Chelsi Vaghela | Co-founder; founder story; access to student-athletes, trainers, coaches |
| Sara Jain | Co-founder, data and models |
| Haatim Ali | Co-founder, partnerships and pilots |
| + teammates | Video (LandingCheck), agent (HitWatch), wearables, app, pitch / Devpost |

## Timeline to the 8:30 AM deadline

1. **Sat afternoon:** add API keys (`docs/SETUP.md`), set up the ElevenLabs agent, test Google Health API with a teammate's watch, film 10+ drop-jump clips.
2. **Sat 4:00–6:15:** full run-through on the live app; push to GitHub.
3. **Sat evening (home) to ~1 AM:** tune prompts on real clips, deploy (Cloud Run, one instance), write the Devpost page.
4. **Sleep 1:00–5:30.**
5. **Sun 5:30–7:30:** code freeze at 6:30; record and edit the ≤2-minute video.
6. **Sun 7:30–8:00:** upload and **submit by 8:00**.
7. **Sun 9:00–11:30:** set up the table (live app, looping video, deck), rehearse. **11:30 judging.**

## Table pitch (90 seconds)

| Time | Beat |
| --- | --- |
| 0:00–0:15 | "Five concussions taught me the warning signs were there. Nobody was reading them." Most high schools have no full-time trainer. |
| 0:15–0:30 | "Ragnor turns the wearables athletes already own into a trainer: one daily check-in reads the warning signs." |
| 0:30–1:05 | **Live HitWatch:** the phone rings; the athlete mentions a headache; the coach view shows HRV below baseline and an alert waiting for approval. |
| 1:05–1:20 | LandingCheck on a clip: "left knee caves in at 1.4 s," plus the fix. |
| 1:20–1:30 | "$20 per athlete per season. Never diagnoses; a human approves every alert. Wearables collect the data; Ragnor turns it into a decision." |

## Risks and backups

| Risk | Backup |
| --- | --- |
| Gemini video results inconsistent | Tune on real clips; "Use the sample result" button |
| Phone call doesn't connect | Browser call, then the scripted demo call (all in the app) |
| Wi-Fi fails | Backup video + phone hotspot |
| Medical-claim questions | "Wellness and triage, not diagnosis; human approves every alert; validation with a sports-medicine partner is next." |
| Out of time | Cut voice check-in first; HitWatch + LandingCheck + coach view carry the demo |
