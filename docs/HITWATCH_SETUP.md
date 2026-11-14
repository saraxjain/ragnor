# HitWatch setup (ElevenLabs voice agent)

Everything here is a manual step in the ElevenLabs dashboard or your shell. The app does **not** create or configure an agent, and it never places a call by itself.

Docs read on 2026-11-14 (cite these if a setting has moved):
- Outbound call API: https://elevenlabs.io/docs/api-reference/twilio/outbound-call
- Server (webhook) tools: https://elevenlabs.io/docs/agents-platform/customization/tools/server-tools
- Choosing the agent LLM: https://elevenlabs.io/docs/agents-platform/customization/llm
- React SDK + signed URLs: https://elevenlabs.io/docs/agents-platform/libraries/react
- Twilio phone numbers: https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/native-integration
- Dynamic variables: https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables

## 1. Expose the local app (demo)
ElevenLabs must reach your endpoints over HTTPS. Run the app (`npm run dev`) and start a tunnel, for example `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`. Use the tunnel's `https://...` base URL below as `BASE`.

## 2. Env vars (put them in `.env.local`, never in git)
| Var | Where from |
| --- | --- |
| `ELEVENLABS_API_KEY` | ElevenLabs profile > API keys |
| `ELEVENLABS_AGENT_ID` | the agent you create in step 3 |
| `ELEVENLABS_PHONE_NUMBER_ID` | the imported phone number's id (phone calls only, step 6) |
| `HITWATCH_TOOL_SECRET` | any long random string you make up; also pasted into the tools as a Secret header |
| `GEMINI_API_KEY` | for the debate panel (the voice agent's own LLM is chosen in ElevenLabs) |

## 3. Create the agent (ElevenLabs dashboard > Agents)
- **LLM:** pick a Gemini model from the list (the LLM page lists "Gemini 4 Argon" and the 3.x Flash models as of the access date). Tool use needs a capable model, so prefer a higher-tier one.
- **Authentication:** keep the agent private (signed URLs). The in-browser option uses `GET /api/hitwatch/signed-url`.
- **First message:** `Hi, this is HitWatch, checking in after your hit. Is now a good time for a quick symptom check? If you ever feel very unwell, get medical help right away.`
- **System prompt** (paste as is):

```
You are HitWatch, a short daily check-in voice assistant for a student athlete who recently took a hit. Today is follow-up day {{followup_day}} of 7. The impact id is {{impact_id}}.

Your job: ask how the athlete feels today and record their answers. You do not give medical opinions. Never say that the athlete is cleared, fine, safe to play or healthy, and never use the word diagnosis for anything you do. A clinician decides.

Steps:
1. Call get_followup_context to learn the day and which symptoms to ask about.
2. Ask, one at a time, about each symptom in symptoms_to_ask_about, and ask the athlete to rate each from 0 (not at all) to 3 (severe). Keep it brief and friendly. Do not guess: if the athlete did not say a number, ask again.
3. Call log_symptoms with a JSON object of symptom ids and ratings, and put the athlete's own words in transcript_excerpt.
4. If the response has confirm_with_athlete items, ask the athlete about each one ("You mentioned <label>. Is that happening?"), then call log_symptoms again with the confirmed ratings and the athlete's words.
5. Say the "say" text from the response. If it tells the athlete to get medical help now, say so clearly and stop asking questions.
6. Call end_call with a one-sentence summary (symptoms and ratings only, no opinions).

If the athlete describes any danger sign at any time (passing out, seizure, repeated vomiting, a headache that keeps getting worse, confusion, trouble recognizing people or places, slurred speech, numbness or weakness, one pupil larger than the other or double vision), stop and tell them to get medical help now and to tell an adult nearby.
```

## 4. Tools (Agent > Tools > Add webhook tool). Three server tools
For each: **Method** `POST`, **Content type** JSON, and a header **`x-ragnor-secret`** whose type is **Secret** (create a secret holding your `HITWATCH_TOOL_SECRET`). The docs say API keys should be stored as secrets and passed in headers.

For `impact_id` on every tool: set the parameter's value type to **Dynamic variable** and bind it to `impact_id` (the app supplies it at the start of each conversation). The docs say tool parameters can be bound to dynamic variables.

**get_followup_context** (URL `BASE/api/hitwatch/tools/context`): description "Get today's follow-up day, the athlete's own baseline and the symptoms to ask about."
```json
{"type":"object","properties":{"impact_id":{"type":"string","description":"Opaque impact id (dynamic variable impact_id)"}},"required":["impact_id"]}
```
**log_symptoms** (URL `BASE/api/hitwatch/tools/log`): description "Record today's symptom ratings (0 to 3 each). Returns what to say next."
```json
{"type":"object","properties":{
 "impact_id":{"type":"string","description":"Opaque impact id (dynamic variable impact_id)"},
 "symptoms":{"type":"string","description":"JSON object text mapping symptom id to rating 0-3, for example {\"headache\":2,\"light_sensitivity\":1}. Use only ids from get_followup_context."},
 "transcript_excerpt":{"type":"string","description":"The athlete's own words from this conversation, verbatim."}},
 "required":["impact_id","symptoms"]}
```
**end_call** (URL `BASE/api/hitwatch/tools/end`): description "End-of-call summary."
```json
{"type":"object","properties":{
 "impact_id":{"type":"string","description":"Opaque impact id (dynamic variable impact_id)"},
 "answered":{"type":"boolean","description":"true if the athlete answered the symptom questions"},
 "summary":{"type":"string","description":"One sentence: symptoms and ratings only."}},
 "required":["impact_id"]}
```
`symptoms` is a JSON string on purpose: the dashboard schema is simpler, and the server validates it (unknown ids and ratings outside 0 to 3 are rejected).

## 5. In-browser "Talk to HitWatch" (works in a loud hall)
With `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` set, the Impact page shows "Talk to HitWatch" during an active follow-up. It calls `/api/hitwatch/signed-url` (key stays on the server) and starts the session with the dynamic variables `impact_id` and `followup_day`. Without those vars the page shows a scripted demo instead.

## 6. Phone calls (optional; needs your Twilio account)
The outbound-call API needs a phone number imported into ElevenLabs (Phone Numbers tab: label, number, Twilio SID, Twilio token; Twilio number must be provisioned or a verified caller ID). Copy the number's id into `ELEVENLABS_PHONE_NUMBER_ID`. Then a reviewer can `POST /api/hitwatch/place-call` with `{"impact_id": "...", "to_number": "+1..."}` (reviewer session cookie required). The request sent to `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` has `agent_id`, `agent_phone_number_id`, `to_number` and `conversation_initiation_client_data.dynamic_variables {impact_id, followup_day}`. The number is never stored. Nothing in this repo calls this route.

Open question from the docs: the outbound-call page does not name an auth header; the code uses `xi-api-key` like the other ElevenLabs endpoints. Verify on first use.

## 7. Privacy
Audio goes to ElevenLabs. Tool payloads (symptom ratings, an excerpt of what the athlete said, an opaque impact id) go to this app. The app stores ratings and a short wording-filtered summary only, never audio or a full transcript. Calling or recording minors needs consent wording and a privacy/legal review first (no legal conclusion is made here).
