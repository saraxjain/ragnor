# Devpost submission draft: Ragnor

Track: **Best Startup Potential** (one track only).
Paste each section into the matching Devpost field. Replace anything in [brackets] once the build is final.

---

## Tagline (short description)

Wearables collect the data. Ragnor turns it into a decision: an AI athletic trainer for high schools that don't have one.

## Inspiration

Our co-founder Chelsi is a three-sport athlete who has had five concussions: "the warning signs were there; nobody was reading them." One of them wasn't caught until symptoms showed up two days later, when nobody was checking. That's not rare: high school athletes leave roughly 4 in 10 possible concussions unreported, and only about 37% of US public high schools have a full-time athletic trainer to notice. Meanwhile, athletes already wear smartwatches and some teams already buy sensor mouthguards. The warning signs are being collected. Nobody follows up on them.

## What it does

Ragnor turns the wearables athletes already own into an athletic trainer. One 60-second daily check-in (sleep, soreness on a body map, practice, food), plus Fitbit / Pixel Watch data, becomes a plain-language flag with its likely cause and what to do.

- **HitWatch:** after a hit is logged, or a mouthguard sensor reports a hard impact, Ragnor phones the athlete every day for a week in a natural voice. It asks graded symptom questions, compares the answers and the athlete's overnight HRV, resting heart rate and sleep to their own normal, and drafts an alert to the coach when something changes. A human approves every alert.
- **LandingCheck:** an athlete films a 10-second drop jump on a phone. Gemini watches the video and flags LESS-style landing errors (like a knee caving inward) with the exact timestamp, the movement patterns linked to ACL tears.
- **FixPlan:** a 10-minute warm-up built for the errors found, and a weekly re-film to show improvement.
- **Coach view:** a "who to look at today" list, each athlete with a one-line reason.
- **Season report:** a one-page summary for the athletic director: athletes screened, hits followed up, alerts handled, staff hours saved.

Ragnor flags risk early and gets athletes to a person sooner. It never diagnoses and never clears anyone to play.

## Who it's for (the named user)

**Athletic directors and coaches at the roughly two-thirds of US public high schools without a full-time athletic trainer**, starting with girls' soccer, basketball, volleyball and gymnastics, where ACL risk is several times higher and concussions still happen. The athlete uses the app; the school buys it.

## How we're different

Each piece exists somewhere on its own: apps that screen a jump once, wellness coaches that read your watch, concussion software a trainer fills in, mouthguards that flash at the moment of impact. None of them **follow through for a team without a trainer**. Ragnor connects the warning sign (a bad landing, a hard hit, a dip in HRV) to a human acting on it, and HitWatch starts before anyone has opened a concussion case.

## Evidence of demand

- **Phone-based screening is wanted:** McGill University Health Centre's ACL screening app reached 4,000 downloads in two months, with 12 universities and several pro teams signing on.
- **Big tech is betting on AI that reads wearable data:** Google launched a Gemini-powered Fitbit health coach in October 2025. We bring that idea to teams and injuries.
- **Schools already pay for athlete safety:** a Texas high school booster club paid about $150 per sensor mouthguard; high schools buy concussion-management software today.
- **The gap is measured:** about 34% of US high schools have no athletic trainer access at all, and 8.27 million students played high school sports in 2024–25, a record.

## Plan to reach users

1. **Pilot** with 2–3 high school programs in the Bay Area through our team's athletic network (free for one season).
2. **Booster clubs and athletic directors** as the first buyers: they control small safety budgets and decide fast.
3. **Districts and state athletic associations** once pilots produce season reports. Every state has youth concussion laws, so documented follow-up helps schools show they followed protocol.
4. **Partnerships** with wearable and mouthguard makers, who want clinical usefulness for their data, and with sports-medicine clinics that want a referral pathway.

## Business model (rough)

- **Institutions pay per athlete, per season; free for athletes.** High schools $20, universities and park districts $40, pro teams custom.
- **Why they pay:** it saves athletic trainers hours of tracking, and a documented follow-up trail for concussion protocols lowers liability.
- **Market:** beachhead 8,266,244 US high school athletes × $20 = **$165.3M**; adding NCAA athletes ($22.2M) and park districts ($66.7M) gives a **$254.2M SAM**; global sports technology TAM is $34.25B (2025).
- **Price position:** between student tools (Volt ~$900–1,400/yr, TeamBuildr ~$90/mo, ImPACT ~$500/school) and pro load trackers (Catapult >$28K/team/yr).
- **Moat:** every follow-up and screen is linked to what happened next. Over seasons, that becomes an injury-outcome dataset nobody else has.

## How we built it

- **Google Agent Development Kit (ADK):** the HitWatch agent is an ADK `LlmAgent` on Gemini with four tools (`log_symptoms`, `compare_to_baseline`, `draft_alert`, `schedule_followup`), run by ADK's runner, with a human approval gate on every alert.
- **Gemini API:** native video understanding with structured JSON output for LandingCheck; [Live API for voice check-ins]; [grounding with Google Search for coach briefings].
- **Google Health API:** Pixel Watch / Fitbit HRV, resting heart rate and sleep for personal baselines.
- **Firebase / Firestore:** athletes, check-ins, flags and the alert approval queue.
- **ElevenLabs:** the voice for HitWatch's outbound calls, with Gemini as the agent's brain.
- **Rules engine:** plain, versioned if-then rules decide every risk band; Gemini extracts and explains. Every flag stores its inputs, rule version and reason.
- **Guardrail filter:** every model output is scanned, and any sentence that diagnoses or clears an athlete is replaced before a user sees it.
- [Next.js front end, deployed on ...]

## Challenges we ran into

[Fill in during the build, e.g. getting consistent landing scores from different camera angles; Google Health API test access; timing the outbound call for the demo.]

## Accomplishments that we're proud of

[e.g. A phone call that catches a "day 2" headache and puts an alert in front of a coach in under a minute.]

## What we learned

[Fill in.]

## What's next

- Validation study with a sports-medicine partner to compare LandingCheck with clinician LESS scoring.
- Parental consent flows and a FERPA/HIPAA review before any real minors' data.
- Real mouthguard integrations (replacing our simulated impact feed).
- Pilot with 2–3 schools in spring 2027.

## Built with

gemini-api, google-adk, google-health-api, firebase, firestore, elevenlabs, next.js, typescript, [add the rest]

## Sources

- NATA / Korey Stringer Institute ATLAS study (athletic trainer access): https://www.athleticbusiness.com/high-school/one-third-of-high-schools-operating-without-athletic-trainer.html
- NATA benchmark study (37% full-time): https://www.nata.org/press-release/new-study-shows-37-percent-public-secondary-schools-meet-gold-standard-care-their-athletes
- Concussion underreporting in high school athletes: https://concussions.smart-teams.org/?p=1820
- HRV after concussion (Anderson et al. 2020): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8240878/
- LESS reliability and validity review: https://pmc.ncbi.nlm.nih.gov/articles/PMC7040940
- MUHC Hurtblocker app: https://www.ctvnews.ca/montreal/article/muhc-develops-app-to-predict-and-prevent-acl-injuries/
- Fitbit Gemini health coach: https://www.androidauthority.com/google-personal-health-coach-preview-launch-3610243/
- Sensor mouthguards at Coppell HS: https://www.fox4news.com/news/coppell-high-school-invests-in-high-tech-mouthguards-for-football-players
- NFHS 2024–25 participation: https://www.nfhs.org/articles/participation-in-high-school-sports-hits-record-high-with-sizable-increase-in-2024-25/
- Google Health API: https://developers.google.com/health/about
