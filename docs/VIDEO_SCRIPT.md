# Ragnor: 2-minute video script (Chelsi and Haatim)

**Speakers**
- **CHELSI**: on camera. Shares the concussion story and the athlete and clinician side.
- **HAATIM**: voiceover over the live demo. Walks through the trust layer, the agents, and the clinician brief.

**Recording setup:** 1280×800, browser zoomed to 90%. Click **Reset demo** first (or restart the server). Target total: 1:55.

| Time | Speaker | On screen | Line |
|---|---|---|---|
| 0:00–0:15 | CHELSI (on camera) | Home hero: "Wearable data doctors can actually trust." | "I've had five concussions. I wore a smartwatch through every one of them. None of that data ever reached a doctor in a form they could use." |
| 0:15–0:30 | HAATIM | Home, "The problem in numbers": 97% and 6% | "Ninety-seven percent of physicians say they'd review a patient's wearable data. Under six percent actually have it in their workflow. Trust, noise, and the health record are the blockers." |
| 0:30–0:45 | CHELSI | Home, 65% stat | "And most high schools don't have a full-time athletic trainer. About two in three. The athletes with the most contact have the fewest people watching them." |
| 0:45–1:00 | HAATIM | Home, the five steps (step 1 and 2) | "Ragnor sits between the watch and the doctor. First it trust-scores every reading from Fitbit and Pixel Watch. Anything it can't trust gets set aside, and the screen shows why." |
| 1:00–1:15 | HAATIM | Behind the scenes (/engine): run a flagged athlete | "Then the agents go to work. Built on Google's Agent Development Kit with Gemini, one agent checks signal quality, one checks the athlete's own baseline, and a skeptic argues every finding is noise." |
| 1:15–1:30 | CHELSI | Clinician (/clinician): patient list, open one, pre-visit brief | "The doctor gets one page: what to discuss, what to watch, and what's ruled out as noise. Every reading shows its trust score next to it." |
| 1:30–1:40 | HAATIM | Clinician brief, Sign button | "Nothing reaches the chart until a human signs it. Then it files as a standard FHIR report. Ragnor never diagnoses, and a filter blocks words like cleared or safe to play." |
| 1:40–1:50 | CHELSI | Athlete app (/athlete): 20-second check-in and feedback | "Athletes get a 20-second check-in and plain feedback on their watch data. They choose what to share with their doctor." |
| 1:50–1:55 | HAATIM | Home, pilot section | "We're piloting this spring with high school and club teams and the clinics that see their athletes. Ragnor: wearable data doctors can actually trust." |

**Notes for recording**
- The demo athletes are fictional. Pick one with a flag for the clinician section (check the name in the dropdown before recording).
- The 97% and 6% figures come from the 2026 AMA / Medscape physician survey, as cited in the Devpost draft.
- The 65% figure is our calculation from the ATLAS study: about 35% of U.S. schools with athletics had a full-time athletic trainer. Say "about two in three," as the script does.

**Lines to have ready for judges**
- "Is it real data?" → "The athletes are fictional, and the risk model is validated on simulated data. The pipeline, trust scoring and FHIR output are real, and pilots would supply real outcomes."
- "What if Gemini is down?" → "Every agent has an offline fallback, and the safety checks are code, not AI."
- "How is this different from Whoop or Oura?" → "They show people more data. Ragnor decides which data a clinician can trust and delivers it into the clinician's own system."
