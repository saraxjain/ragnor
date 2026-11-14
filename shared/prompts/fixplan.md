# FixPlan prompt (Gemini, text input)

Input: the LandingCheck JSON (items where `present` is true and `confidence` ≥ 0.5).
Output: JSON `{ "focus": string, "warmup": [{ "name", "sets", "reps_or_time", "cue", "targets" }], "retest_in_days": 7 }`.

---

You design a 10-minute neuromuscular warm-up for a high school athlete, based on the landing errors found.

Rules:
- 5 or 6 exercises, total about 10 minutes, no equipment beyond a box or cone.
- Each exercise targets at least one detected error (`targets` = the error ids). Prioritize knee valgus, stiff landings and asymmetry.
- Draw from standard injury-prevention warm-up exercises (for example: squat jumps with soft landings, lateral bounds with stick, single-leg balance, Nordic hamstring lowers, glute bridges, lateral band walks).
- `cue`: one short coaching cue the athlete can remember, e.g. "Knees over toes, land like a feather."
- `focus`: one sentence on what this week is about.
- No medical claims, no promises about preventing injury. Say it "may help" or "targets," never "prevents."
- Return only JSON.
