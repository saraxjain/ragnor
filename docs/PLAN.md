# Ragnor: hackathon plan

The living plan (problem, wearables thesis, features, architecture, team split, timeline, demo script, startup track, risks and sources) is kept in the team doc:
https://claude.ai/artifact/6ac9Qu7ZpjQgvFdjt2vkC6

## Event rules (GDG UC Santa Cruz DevFest 2026)

- **Submissions close Sun Nov 15 at 11:00 AM** on Devpost, with a demo video uploaded. We target 10:30.
- Venue: Sat 11:30 AM–6:30 PM (closed overnight), Sun from 9:00 AM.
- Judging: judges come to our table, 1–2 minute pitch.
- Theme: "Build, Secure, Scale: Developers and Builders in the Agentic Era."
- Tracks: Best Integration of Gemini or Google API · Best Startup Potential · Best Social Impact · Best UI.
- Credits: g.dev/credits/devfest-santa-cruz (personal Google account; not compatible with AI Studio billing, so use Antigravity).

## Priority

All four tracks, with **Best Startup Potential** first: season report for athletic directors, landing page with pricing and pilot sign-up, a letter of intent, and a Devpost business section.

## Timeline

1. **Sat 11:30–12:30:** Setup over lunch: API keys, credits, Firestore, shared JSON shapes.
2. **Sat 12:30–4:00:** Each person builds their piece against mock data; film drop-jump clips.
3. **Sat 4:00–6:15:** First end-to-end integration; push to GitHub.
4. **Sat 7:30 pm–2:00 am (home):** Fix and tune; build the AD season report and landing page; write the Devpost business section.
5. **Sun 7:00–9:00 am (home):** UI polish; record and edit the demo video.
6. **Sun 9:00–10:30 am (venue):** Upload video, finish Devpost. **Submit by 10:30.**
7. **Sun 10:30–11:30:** Rehearse the 90-second table pitch. Judging at 11:30.

## Shared JSON shapes (draft)

```json
{"landing": {"items": [{"id": "knee_valgus", "present": true, "side": "left", "timestamp_s": 1.4, "confidence": 0.8}], "score": 6, "band": "moderate"}}
{"checkin": {"sleep_h": 5, "soreness": {"hamstring_l": 2}, "load_min": 120, "symptoms": []}}
{"hitwatch": {"day": 2, "symptoms": {"headache": 3, "light_sensitivity": 2}, "baseline_total": 1, "today_total": 5, "escalate": true}}
```

## Open requirements

_To be added._
