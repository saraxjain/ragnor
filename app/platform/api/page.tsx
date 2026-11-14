import { PlatformShell } from "../PlatformNav.tsx";
export const metadata = { title: "API & FHIR · Ragnor" };
const K = "rg_demo_westbrook_2026";
const EP = [
  ["GET", "/api/v1/athletes", "Roster with rules band, 7-day model risk and top drivers, highest risk first."],
  ["GET", "/api/v1/athletes/ath_01/risk", "One athlete: probability, drivers, full feature vector and rule flags."],
  ["GET", "/api/v1/fhir/Patient/ath_01", "FHIR R4 Bundle: Patient, HRV / resting-HR / sleep Observations (LOINC), athlete-reported soreness Observations, RiskAssessment."],
  ["POST", "/api/v1/ingest/wearable", "Device partners push daily HRV, resting HR and sleep; risk is re-scored immediately."],
  ["GET", "/api/model", "Public model card: metrics, calibration, ROC, weights, limitations."],
];
export default function Api() {
  return (
    <PlatformShell title="Engine API & FHIR" sub="Everything the coach app shows is available to partners: athletic-training EHRs, wearable makers, clinics and leagues. Keys are scoped per tenant and every call is audited.">
      <section className="card">
        <h3>Authentication</h3>
        <p className="small">Send <span className="mono">x-api-key</span> (or <span className="mono">?api_key=</span>). Demo tenant key: <span className="mono strong">{K}</span>. Production keys come from <span className="mono">RAGNOR_API_KEYS</span>.</p>
      </section>
      {EP.map(([m, p, d]) => {
        const url = p.startsWith("/api/v1") && m === "GET" ? `${p}?api_key=${K}` : p;
        return (
          <section key={p} className="card">
            <div className="row wrap" style={{ gap: 10 }}><span className="pill mono strong">{m}</span><span className="mono strong">{p}</span>{m === "GET" && <a className="btn btn-tonal btn-sm" href={url} target="_blank" rel="noreferrer">Try it</a>}</div>
            <p className="small mt-8">{d}</p>
            <div className="code">{m === "GET" ? `curl -H "x-api-key: ${K}" http://localhost:3000${p}` : `curl -X POST -H "x-api-key: ${K}" -H "content-type: application/json" \\\n  -d '{"athlete_id":"ath_02","days":[{"date":"2026-11-14","hrv_ms":48,"rhr_bpm":61,"sleep_h":6.1}]}' \\\n  http://localhost:3000${p}`}</div>
          </section>
        );
      })}
    </PlatformShell>
  );
}
