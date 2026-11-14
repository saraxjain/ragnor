import type { Metadata } from "next";
import Link from "next/link";
import { Architecture } from "@/components/judges/Architecture";
import { PanelRunner } from "@/components/judges/PanelRunner";
import { DISCLAIMER } from "@/lib/copy";
import { getDataAccess, isDemoMode } from "@/lib/data";
import { DEMO_DESCRIPTIONS } from "@/lib/data/seed";
import { buildExplanation } from "@/lib/panel/explain";

export const metadata: Metadata = { title: "Behind the scenes | Ragnor" };
export const dynamic = "force-dynamic";

export default async function JudgesPage() {
  if (!isDemoMode()) {
    return (
      <>
        <h1>Behind the scenes</h1>
        <p className="card" role="status">
          This page is available in demo mode only. It is switched off when Firestore is configured so that real athlete data can never appear on a judges page.
        </p>
      </>
    );
  }
  const x = buildExplanation();
  const da = await getDataAccess();
  const athletes = (await da.listDemoProfiles())
    .filter((p) => p.role === "athlete")
    .map((p) => ({ id: p.id, label: p.displayLabel, description: DEMO_DESCRIPTIONS[p.id] ?? "demo athlete" }));

  return (
    <div className="judges">
      <h1>Behind the scenes</h1>
      <p className="lede">
        How Ragnor decides a result, how the pieces fit together, and a live view of an AI panel debating a demo case. All athletes here are fictional examples.{" "}
        <Link href="/">Back to the demo</Link>
      </p>
      <p className="section-note">{x.statement}</p>

      <section aria-labelledby="how">
        <h2 id="how">How a result is decided</h2>
        <p>
          A deterministic rules engine (no machine learning, no language model) reads the athlete&apos;s recent check-ins, wearable deltas against their own baseline, any landing check and any HitWatch follow-up. Each rule below is read from the
          running code, together with its thresholds. Every flag stores the rule id, the rules version and a copy of its inputs so it can be replayed.
        </p>
        <ul className="rule-list">
          {x.rules.map((r) => (
            <li key={r.id} className="card">
              <strong className="mono">{r.id}</strong> <span className="tag unvalidated">thresholds unvalidated</span>
              <p style={{ margin: "0.4rem 0 0" }}>{r.firesWhen}</p>
              <p className="small muted mono" style={{ margin: "0.3rem 0 0" }}>{r.description}</p>
            </li>
          ))}
        </ul>

        <h3>Thresholds (all unvalidated placeholders)</h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Thresholds table (scrolls sideways on small screens)">
          <table className="wide-table">
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">Value</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {x.thresholds.map((t) => (
                <tr key={t.key}>
                  <th scope="row" className="mono">{t.key}</th>
                  <td>{t.value}</td>
                  <td>{t.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Red-flag symptoms</h3>
        {x.redFlags.map((g) => (
          <details key={g.source} className="card">
            <summary>
              {g.source} <span className={`tag ${g.validated ? "sourced" : "unvalidated"}`}>{g.label}</span>
            </summary>
            {g.url && (
              <p className="small">
                Source: <a href={g.url}>{g.url}</a>
              </p>
            )}
            <ul>
              {g.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </details>
        ))}

        <div className="two-col">
          <div>
            <h3>What goes in</h3>
            <ul>
              {x.dataIn.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>What does not go in</h3>
            <ul>
              {x.dataOut.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="arch">
        <h2 id="arch">System architecture</h2>
        <p>The deterministic pipeline decides the level and a human approves every alert before it reaches a coach or parent. The Gemini panel branches off the rules result to explain it; it cannot change the level and it never feeds the athlete, coach or parent screens.</p>
        <Architecture />
      </section>

      <section aria-labelledby="debate">
        <h2 id="debate">Watch the panel debate a case</h2>
        <p>
          Three debaters (load analyst, symptom and impact watcher, sceptic) argue about how to explain the flag, what the reviewer should look at first, how confident the data is and what is
          missing, then a moderator writes the explanation. The level is never up for debate: a code guardrail keeps the final level equal to the rules level and records any level a model
          tries to state as an override. With no Gemini key on the server, or if a live call fails, the page shows a scripted example built from the real rules output and labelled as such.
        </p>
        <PanelRunner athletes={athletes} />
      </section>
      <p className="muted">{DISCLAIMER}</p>
    </div>
  );
}
