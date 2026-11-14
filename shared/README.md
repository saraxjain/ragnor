# shared/: framework-free building blocks

Everything here works with any front end (Next.js, plain React, Flutter calling an API). Drop it into the app and wire it up.

| Path | What it is | Who uses it |
| --- | --- | --- |
| `schemas/landing.schema.json` | Gemini `responseSchema` for LandingCheck | Video lead |
| `schemas/checkin.schema.json` | Gemini `responseSchema` for the voice check-in | Wearables/voice lead |
| `schemas/hitwatch.schema.json` | Stored shape of one HitWatch follow-up | Agent lead, app lead |
| `prompts/landingcheck.md` | Video prompt (LESS-style, 10 landing errors) | Video lead |
| `prompts/checkin.md` | Voice check-in prompt | Voice lead |
| `prompts/fixplan.md` | Warm-up generator prompt | Video lead |
| `prompts/coach_briefing.md` | Morning briefing prompt (optional Search grounding) | App lead |
| `agent/hitwatch_system_prompt.md` | ElevenLabs agent system prompt + first message | Agent lead |
| `agent/tools.json` | `log_symptoms`, `compare_to_baseline`, `draft_alert`, `schedule_followup` | Agent lead, app lead (backend endpoints) |
| `lib/rules.ts` | Rules engine: `scoreLanding`, `dailyRisk`, `evaluateHitWatch` | App lead |
| `lib/baseline.ts` | Personal wearable baselines: `computeBaseline`, `compareToBaseline` | Wearables lead |
| `lib/guardrails.ts` | `sanitize` / `sanitizeDeep`: run on EVERY model output before display | Everyone |
| `data/seed.json` | 12 fictional athletes, wearable history, check-ins, landing screens, Maya's HitWatch case, season report | App lead (demo) |
| `scripts/make-seed.ts` | Regenerates `seed.json` | App lead |

## Run the tests

Node 22.18+ runs TypeScript directly:

```bash
node --test shared/lib/rules.test.ts
node shared/scripts/make-seed.ts
```

## Using the TS modules in Next.js

The modules import each other with `.ts` extensions (so Node can run them directly). In the app's `tsconfig.json`, add:

```json
{ "compilerOptions": { "allowImportingTsExtensions": true, "noEmit": true } }
```

Or copy `shared/lib` into the app and remove the extensions.

## Calling Gemini with a schema (example, @google/genai)

```ts
import { GoogleGenAI } from "@google/genai";
import landingSchema from "../shared/schemas/landing.schema.json";
import { scoreLanding, sanitizeDeep } from "../shared/lib/index.ts";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const res = await ai.models.generateContent({
  model: "gemini-2.5-flash", // check for the current model name
  contents: [{ role: "user", parts: [videoPart, { text: LANDINGCHECK_PROMPT }] }],
  config: { responseMimeType: "application/json", responseSchema: landingSchema },
});
const landing = sanitizeDeep(JSON.parse(res.text));
const score = scoreLanding(landing); // band comes from the rules, not the model
```

Strip the `$comment` key from schemas if the SDK rejects it. `hitwatch.schema.json` uses `additionalProperties` and is for storage, not for Gemini.

## The three rules everyone follows

1. **The rules engine decides the risk band.** Gemini only extracts and explains.
2. **Every model string goes through `sanitize`.** No "cleared," "diagnosis," "safe to play," "you're fine."
3. **No alert leaves without a human tapping approve.** `draft_alert` only drafts.
