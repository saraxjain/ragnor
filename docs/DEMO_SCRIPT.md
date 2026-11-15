# In-person demo script (about 2 minutes)

Two speakers: **CHELSI** and **HAATIM**. This is the live version of the pitch. It shows the product instead of explaining it. For the recorded 2-minute video, use `docs/VIDEO_SCRIPT.md`.

Before you start: open `/athlete` on one laptop tab, `/clinician` on a second tab, and `/engine` on a third. Load the demo athlete (Maya) and run the clinician brief once beforehand so the results are ready. The demo data is fictional.

| Time | Section | Speaker | Screen |
|---|---|---|---|
| 0:00 to 0:15 | Intro | CHELSI | Home page |
| 0:15 to 0:50 | Athlete view | HAATIM | `/athlete` check-in |
| 0:50 to 1:30 | Clinician and coach view | CHELSI | `/clinician` brief, then `/coach` |
| 1:30 to 1:45 | Behind the scenes | HAATIM | `/engine` |
| 1:45 to 2:00 | Close | CHELSI | Home page |

---

## 0:00 to 0:15 | Intro (CHELSI)

> Wearables collect the data. Nobody reads it. Ragnor turns watch data into a short brief that a doctor can trust, and we start with student athletes.

**Action:** Point at the home page headline, "Wearable data doctors can actually trust."

---

## 0:15 to 0:50 | Athlete view (HAATIM)

> This is what the athlete sees. Ten seconds a day. Sleep, soreness, practice, and meals, with a few taps.

**Action:** Open `/athlete`, show the check-in sliders, and tap a few values.

> The watch data comes in through the Google Health API, from Fitbit or Pixel Watch. Every night gets a trust score, so a loose watch doesn't turn into a false alarm.

**Action:** Point at the trust ring on one night.

---

## 0:50 to 1:30 | Clinician and coach view (CHELSI)

> The doctor gets one brief per athlete. What changed, how sure we are, and what to do next.

**Action:** Open `/clinician`, then the patient brief for Maya. Point at the change from baseline and the trust score.

> The brief is written by a team of AI agents. One skeptic argues that each finding is noise, and only what survives reaches the doctor. The doctor signs it. Ragnor never diagnoses, and it never says an athlete is cleared.

**Action:** Point at the signed brief or the "Signed and filed" status.

> The coach doesn't get raw data. The coach gets one plan, and a coach or trainer accepts or rejects it before anything happens.

**Action:** Open `/coach`, point at the trust strip, then the plan for Maya.

---

## 1:30 to 1:45 | Behind the scenes (HAATIM)

> If you want to see how it works, the engine page shows each agent's part, the debate, and the filed record.

**Action:** Open `/engine`, scroll to the agent debate, and show the FHIR record toggle.

> The model isn't trained on real injury records yet. This is a simulated season, and the next step is a real pilot.

---

## 1:45 to 2:00 | Close (CHELSI)

> Ragnor is for high schools, clubs, and sports-medicine clinics. Institutions pay per athlete, and athletes use it for free. We're looking for a pilot, and we'd like to talk to you about it.

**Action:** Back to the home page.

---

## Notes for the room

- If the internet drops, use the demo data already loaded. Don't try to live-connect a watch.
- If someone asks about accuracy, say the model is built on a simulated season and a pilot is next.
- Don't say "cleared," "safe to play," or "diagnosis" about any athlete.
- If time runs short, cut the coach view first. Keep the clinician brief.
