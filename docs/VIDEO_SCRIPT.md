# Ragnor: 2-minute video script

Record at 1280×800, with the browser zoomed to 90%. Click **Reset demo** first (or restart the server). Total target: 1:55.

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:12 | Home page hero, then scroll to the 97% / ≤6% stats | "Ninety-seven percent of doctors say they'd look at a patient's smartwatch data. Six percent actually can. The data doesn't reach the health record, and nobody knows which readings to trust." |
| 0:12–0:20 | Chelsi on camera, or a photo with a caption | "I've had five concussions. I wore a watch through all of them. None of that ever reached a doctor in a form they could use." |
| 0:20–0:30 | Home → "Watch it work" → Behind the scenes, select **Ava**, click Run | "Ragnor is the layer between the watch and the doctor. Here's Ava. Her numbers look alarming: HRV down eleven percent, resting heart rate up." |
| 0:30–0:45 | Step 2: the trust strip, with red dots on Fri and Sat | "Before any AI sees it, Ragnor trust-scores every reading. On those two nights her watch was worn about three and a half hours, with heavy motion. Those readings are set aside, and we show why." |
| 0:45–1:00 | Step 3: risk 4.0% → 1.7%; step 4: debate messages appear | "Her risk drops from four percent to under two. Then our agents, built with Google's Agent Development Kit on Gemini, argue. A skeptic agent challenges every finding, and both of Ava's get ruled out as noise. That's a false alarm a doctor never has to see." |
| 1:00–1:20 | Switch to **Maya** → Run (or Clinician → Maya → Generate brief) | "Maya is different. Her HRV drop holds up on trusted nights, and her check-ins confirm five hours of lost sleep. It survives the skeptic: two things to discuss, one to watch." |
| 1:20–1:35 | Clinician page → Sign & send to EHR → FHIR bundle opens | "The doctor gets one page, signs it, and it files straight into their health record as standard FHIR, with a trust score on every reading. Nothing is sent without a human signing, and Ragnor never diagnoses." |
| 1:35–1:45 | Athlete app → "Your watch data this week" card | "Athletes get something back too: plain feedback, like wear your watch snug, and control over what they share." |
| 1:45–1:55 | Home pricing section, then logo | "Free for athletes. Clinics pay per patient, schools per athlete, and wearable and health-record companies license the trust API. Ragnor: wearable data doctors can actually trust." |

**Lines to have ready for judges:**
- "Is it real data?" → "The athletes are fictional and the model is validated on simulated data. The pipeline, trust scoring and FHIR output are real, and pilots supply real outcomes."
- "What if Gemini is down?" → "Every agent has a deterministic offline fallback, and the safety checks are code, not AI."
- "How is this different from Whoop or Oura?" → "They show the person more data. We decide which data a clinician can trust, and deliver it into the clinician's own system."
