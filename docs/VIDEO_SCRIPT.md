# Ragnor: 2-minute video script (Chelsi and Haatim)

**Speakers**
- **CHELSI**: on camera. Shares the concussion story and the athlete and clinician side.
- **HAATIM**: voiceover over the live demo. Walks through the trust layer, the agents, and the clinician brief.

**Recording setup:** 1280×800, browser zoomed to 90%. Click **Reset demo** first (or restart the server). Target total: 2:00.

| Time | Speaker | On screen | Line |
|---|---|---|---|
| 0:00–0:20 | CHELSI (on camera) | Home hero: "Wearable data doctors can actually trust." | "We're Ragnor. Most high schools don't have a full-time athletic trainer. About two in three don't, based on national data. The athletes with the most contact have the fewest people watching them. We're here to close that gap." |
| 0:20–0:35 | HAATIM | Home, "The problem in numbers": 97% and 6% | "Ninety-seven percent of physicians say they'd review a patient's wearable data. Under six percent actually have it in their workflow. Trust, noise, and the health record are the blockers." |
| 0:35–0:50 | HAATIM | Home, the five steps (step 1 and 2) | "Ragnor sits between the watch and the doctor. First it trust-scores every reading from Fitbit and Pixel Watch. Anything it can't trust gets set aside, and the screen shows why." |
| 0:50–1:05 | HAATIM | Behind the scenes (/engine): run a flagged athlete | "Then the agents go to work. Built on Google's Agent Development Kit with Gemini, one agent checks signal quality, one checks the athlete's own baseline, and a skeptic argues every finding is noise." |
| 1:05–1:20 | CHELSI | Clinician (/clinician): patient list, open one, pre-visit brief | "The doctor gets one page: what to discuss, what to watch, and what's ruled out as noise. Every reading shows its trust score next to it." |
| 1:20–1:30 | HAATIM | Clinician brief, Sign button | "Nothing reaches the chart until a human signs it. Then it files as a standard FHIR report. Ragnor never diagnoses, and a filter blocks words like cleared or safe to play." |
| 1:30–1:40 | CHELSI | Athlete app (/athlete): check-in sliders, body map, Talk tab | "On the athlete side, it takes about 20 seconds a day. They tap sleep, soreness, practice, and meals. Soreness is on a body map, so they point to exactly where it hurts. They can also talk through the check-in, and an agent asks one follow-up if needed." |
| 1:40–1:50 | HAATIM | Athlete app: watch connection, trust ring, consent option, warning text | "If they wear a Fitbit or Pixel Watch, Ragnor reads overnight heart-rate variability, resting heart rate, and sleep. The athlete decides whether a short summary goes to their clinician. If something sounds serious, like numbness, weakness, or swelling, the screen tells them to see a clinician right away." |
| 1:50–2:00 | HAATIM | Home, pilot section | "We're piloting this spring with high school and club teams and the clinics that see their athletes. Ragnor: wearable data doctors can actually trust." |

**Notes for recording**
- The demo athletes are fictional. Pick one with a flag for the clinician section (check the name in the dropdown before recording).
- The 97% and 6% figures come from the 2026 AMA / Medscape physician survey, as cited in the Devpost draft.
- The 65% figure is our calculation from the ATLAS study: about 35% of U.S. schools with athletics had a full-time athletic trainer. Say "about two in three," as the script does.

**Lines to have ready for judges**
- "Is it real data?" → "The athletes are fictional, and the risk model is validated on simulated data. The pipeline, trust scoring and FHIR output are real, and pilots would supply real outcomes."
- "What if Gemini is down?" → "Every agent has an offline fallback, and the safety checks are code, not AI."
- "How is this different from Whoop or Oura?" → "They show people more data. Ragnor decides which data a clinician can trust and delivers it into the clinician's own system."
