# Ragnor: hackathon plan

The living plan (problem, wearables thesis, features, architecture, team split, timeline, demo script, startup track, risks and sources) is kept in the team doc:
https://claude.ai/artifact/6ac9Qu7ZpjQgvFdjt2vkC6

## Event rules (GDG UC Santa Cruz DevFest 2026)

- **Devpost deadline: Sun Nov 15, 8:30 AM PST** (kickoff slides said 11:00; Devpost is earlier, so plan for 8:30). We submit by **8:00**.
- Demo video: **2 minutes or less**, uploaded to Devpost.
- Judging: science-fair style at our table (live demo, slides and/or video). Expect technical questions.
- Eligibility: students only, above the legal age of majority; all teammates added to the Devpost project.
- Theme: "Build, Secure, Scale: Developers and Builders in the Agentic Era."
- Tracks: Best Integration of Gemini or Google API · Best Startup Potential · Best Social Impact · Best UI. **Only ONE track per project; we submit to Best Startup Potential** (criteria: named user, differentiation, plan to reach users, evidence of demand, rough business model).
- Credits: g.dev/credits/devfest-santa-cruz (personal Google account; not compatible with AI Studio billing, so use Antigravity).

## Priority

**Best Startup Potential** (our single track): season report for athletic directors, landing page with pricing and pilot sign-up, a proof-of-demand slide built from published data, and a Devpost business section.

## Timeline

1. **Sat 11:30–12:30:** Setup: API keys, credits, Firestore, shared JSON shapes.
2. **Sat 12:30–4:00:** Each person builds their piece against mock data; film drop-jump clips.
3. **Sat 4:00–6:15:** First end-to-end integration; push to GitHub.
4. **Sat 7:30 pm–1:00 am (home):** Fix and tune; season report and landing page; write the Devpost page except the video.
5. **Sat 1:00–5:30 am:** Sleep.
6. **Sun 5:30–7:30 am:** Code freeze at 6:30; record and edit the video (2:00 max).
7. **Sun 7:30–8:00 am:** Upload video, check teammates are on the project, **submit by 8:00**.
8. **Sun 9:00–11:30:** Set up the table (live app, looping video, 4-slide deck); rehearse.
9. **Sun 11:30:** Judging.

## Shared JSON shapes (draft)

```json
{"landing": {"items": [{"id": "knee_valgus", "present": true, "side": "left", "timestamp_s": 1.4, "confidence": 0.8}], "score": 6, "band": "moderate"}}
{"checkin": {"sleep_h": 5, "soreness": {"hamstring_l": 2}, "load_min": 120, "symptoms": []}}
{"hitwatch": {"day": 2, "symptoms": {"headache": 3, "light_sensitivity": 2}, "baseline_total": 1, "today_total": 5, "escalate": true}}
```

## Open requirements

_To be added._
