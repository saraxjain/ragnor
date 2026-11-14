// FHIR R4 export so athletic-training EMRs, clinics and health systems can ingest Ragnor data.
// Observations use LOINC codes where a standard code exists; Ragnor-specific scores use a local code system.
import type { Athlete } from "./store.ts";
import { scoreAthlete } from "./risk.ts";

const LOCAL = "https://ragnor.health/fhir/CodeSystem/ragnor";
const ref = (a: Athlete) => ({ reference: `Patient/${a.id}`, display: a.name });

function obs(a: Athlete, id: string, code: { system: string; code: string; display: string }, date: string, value: number, unit: string, ucum: string) {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
    code: { coding: [code], text: code.display },
    subject: ref(a),
    effectiveDateTime: `${date}T07:00:00Z`,
    valueQuantity: { value, unit, system: "http://unitsofmeasure.org", code: ucum },
    device: { display: a.wearable.source === "google_health" ? `${a.device} via Google Health API` : `${a.device} (sample data)` },
  };
}

export function athleteBundle(a: Athlete) {
  const entries: object[] = [];
  const [given, ...family] = a.name.split(" ");
  entries.push({
    resourceType: "Patient",
    id: a.id,
    name: [{ given: [given], family: family.join(" ") }],
    extension: [{ url: `${LOCAL}/sport`, valueString: a.sport }],
    meta: { tag: [{ system: LOCAL, code: "demo", display: "Fictional demo athlete" }] },
  });
  for (const d of a.wearable.recent) {
    if (d.hrv_ms != null) entries.push(obs(a, `${a.id}-hrv-${d.date}`, { system: "http://loinc.org", code: "80404-7", display: "R-R interval.standard deviation (Heart rate variability)" }, d.date, d.hrv_ms, "ms", "ms"));
    if (d.rhr_bpm != null) entries.push(obs(a, `${a.id}-rhr-${d.date}`, { system: "http://loinc.org", code: "40443-4", display: "Heart rate --resting" }, d.date, d.rhr_bpm, "beats/minute", "/min"));
    if (d.sleep_h != null) entries.push(obs(a, `${a.id}-sleep-${d.date}`, { system: "http://loinc.org", code: "93832-4", display: "Sleep duration" }, d.date, d.sleep_h, "h", "h"));
  }
  for (const c of a.hitwatch?.calls ?? []) {
    entries.push({
      resourceType: "Observation",
      id: `${a.id}-symptoms-d${c.day}`,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { coding: [{ system: LOCAL, code: "hitwatch-symptom-total", display: "HitWatch graded symptom total (0-6 per symptom)" }] },
      subject: ref(a),
      effectiveDateTime: `${c.date}T16:00:00Z`,
      valueInteger: Object.values(c.symptoms).reduce((s, v) => s + v, 0),
      component: Object.entries(c.symptoms).map(([k, v]) => ({ code: { coding: [{ system: LOCAL, code: k, display: k.replaceAll("_", " ") }] }, valueInteger: v })),
    });
  }
  const score = scoreAthlete(a);
  entries.push({
    resourceType: "RiskAssessment",
    id: `${a.id}-risk-${a.risk_today.date}`,
    status: "final",
    subject: ref(a),
    occurrenceDateTime: `${a.risk_today.date}T07:00:00Z`,
    method: { coding: [{ system: LOCAL, code: score.model_version, display: "Ragnor 7-day injury-risk model (decision support, not diagnostic)" }] },
    basis: score.top_drivers.map((d) => ({ display: `${d.label}: ${d.value}` })),
    prediction: [{ outcome: { text: "Time-loss sports injury within 7 days" }, probabilityDecimal: score.risk_7d, whenRange: { high: { value: 7, unit: "days" } } }],
    note: [{ text: `Rules engine band: ${a.risk_today.band}. Flags: ${a.risk_today.flags.map((f) => f.reason).join("; ") || "none"}` }],
  });
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: entries.map((resource) => ({ fullUrl: `urn:ragnor:${(resource as { resourceType: string; id: string }).resourceType}/${(resource as { id: string }).id}`, resource })),
  };
}
