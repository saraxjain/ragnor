# Ragnor: hackathon plan

The living plan (problem, wearables thesis, features, architecture, team split, timeline, demo script, startup track, risks and sources) is kept in the team doc:
https://claude.ai/artifact/6ac9Qu7ZpjQgvFdjt2vkC6

## Timeline (Sat Nov 14 to Sun Nov 15, 2026)

1. **Sat 10:30–12:00:** Setup: repo, API keys, Firestore, agree on shared JSON shapes.
2. **Sat 12:00–6:00 pm:** Each person builds their own piece against mock data; film drop-jump clips.
3. **Sat 6:00–10:00 pm:** Wire everything into one app; run the full demo once.
4. **Sat 10:00 pm–2:00 am:** Fix and tune prompts on real clips.
5. **Sun 8:00–11:00 am:** Polish, seed demo roster, rehearse.
6. **Sun 11:00 am:** Code freeze; record backup demo video.
7. **Sun 11:00 am–1:00 pm:** Devpost write-up; submit by 12:30.

## Shared JSON shapes (draft)

```json
{"landing": {"items": [{"id": "knee_valgus", "present": true, "side": "left", "timestamp_s": 1.4, "confidence": 0.8}], "score": 6, "band": "moderate"}}
{"checkin": {"sleep_h": 5, "soreness": {"hamstring_l": 2}, "load_min": 120, "symptoms": []}}
{"hitwatch": {"day": 2, "symptoms": {"headache": 3, "light_sensitivity": 2}, "baseline_total": 1, "today_total": 5, "escalate": true}}
```

## Open requirements

_To be added._
