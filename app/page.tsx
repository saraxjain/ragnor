import Link from "next/link";
import { SignupForm } from "@/components/SignupForm.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconWave } from "@/components/icons.tsx";

const STEPS = [
  { title: "Trust-score every reading", body: "Data arrives from Fitbit and Pixel Watch through the Google Health API. Before anything else sees it, each night gets a trust score: was the watch actually worn, was there motion artifact, do two sources agree, and has this metric been validated for someone like this person? Unverified readings are set aside, not silently used." },
  { title: "Compare to your own normal", body: "Overnight HRV, resting heart rate and sleep are compared with each person's own baseline, alongside 20-second check-ins and a phone-video landing screen. A validated risk model and a versioned rules engine run on trusted data only." },
  { title: "AI agents argue about what matters", body: "Built with Google's Agent Development Kit on Gemini. Signal-quality, baseline and clinical-relevance agents work in parallel; a skeptic agent argues every finding is noise. Only what survives reaches a person." },
  { title: "A brief the doctor can sign", body: "The clinician gets one page before the visit: what to discuss, what to watch, and what was ruled out as noise, with evidence. One click files it into the health record as FHIR, with a trust score on every reading." },
  { title: "Useful for athletes and coaches too", body: "Athletes see plain-language feedback (\"your watch was loose Saturday, wear it snug\") and choose what to share. Coaches get one list of who to look at today. Nothing is sent without a person approving it." },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <h1 className="mt-16">
              Wearable data doctors
              <br />
              <span style={{ color: "var(--primary)" }}>can actually trust.</span>
            </h1>
            <p className="lead">
              Ragnor is the layer between the watch and the clinician. It scores every reading for trust, lets AI agents argue about what matters, and hands the doctor a short brief they can sign into the health record. We start with student athletes.
            </p>
            <div className="row wrap mt-24">
              <Link href="/engine" className="btn btn-filled btn-lg">Watch it work</Link>
              <Link href="/clinician" className="btn btn-outlined btn-lg">Clinician view</Link>
              <Link href="/athlete" className="btn btn-outlined btn-lg">Athlete app</Link>
            </div>
            <p className="small muted mt-16">Decision support, not a diagnosis. Ragnor never says anyone is cleared or safe to play; those calls stay with licensed clinicians.</p>
          </div>
          <HeroMock />
        </div>
      </section>

      <section className="container" aria-labelledby="problem">
        <h2 id="problem" className="sr-only">The problem</h2>
        <div className="center">
          <span className="eyebrow">The problem in numbers</span>
        </div>
        <div className="stats mt-16">
          <div className="stat">
            <div className="stat-num">65%</div>
            <p>of U.S. high schools do not have a full-time athletic trainer.</p>
          </div>
          <div className="stat">
            <div className="stat-num">~4 in 10</div>
            <p>possible concussions in high school athletes are never reported to a coach or medical professional.</p>
          </div>
          <div className="stat">
            <div className="stat-num">8.27M</div>
            <p>students played high school sports in 2024–25, a record. Most of them already wear a fitness tracker or smartwatch.</p>
          </div>
        </div>
        <p className="tiny muted mt-16">Sources: NATA / Korey Stringer Institute ATLAS study (the 65% is our calculation from its figures: about 35% of all U.S. schools with athletics had a full-time trainer); Register-Mihalik et al. 2013; NFHS 2024–25 participation survey.</p>
      </section>

      <section className="container mt-40" aria-labelledby="how">
        <div className="center">
          <span className="eyebrow">How it works</span>
          <h2 id="how" className="mt-8">From a noisy watch to a decision a doctor will sign</h2>
        </div>
        <ol className="steps">
          {STEPS.map((st, i) => (
            <li key={st.title}>
              <span className="step-num">{i + 1}</span>
              <div>
                <h3>{st.title}</h3>
                <p className="muted mt-8">{st.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="center small mt-16"><Link href="/engine">Run the whole pipeline live →</Link></p>
      </section>

      <section className="container mt-40" aria-labelledby="diff">
        <div className="card tonal">
          <div className="grid grid-2" style={{ alignItems: "center" }}>
            <div>
              <span className="eyebrow">Why Ragnor</span>
              <h2 id="diff" className="mt-8">Everyone else shows more data. We show less, and it&apos;s right.</h2>
              <p className="muted mt-16">Wearable apps give people dashboards. Remote-monitoring tools give doctors alert queues that never reach zero. Ragnor filters first: a false alarm from a loose watch never reaches the doctor, and what does arrive comes with evidence and a trust score.</p>
            </div>
            <ul className="check-list">
              <li>Trust score on every reading, with the reason</li>
              <li>A skeptic agent challenges every finding before a person sees it</li>
              <li>Code-level safety checks can only make output more cautious</li>
              <li>FHIR output that drops into existing health records</li>
              <li>Nothing filed or sent without a human signing</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="google">
        <div className="section-title">
          <div>
            <span className="eyebrow">Built on Google</span>
            <h2 id="google" className="mt-8">Google Health API, Agent Development Kit and Gemini</h2>
          </div>
        </div>
        <div className="row wrap" style={{ justifyContent: "center", gap: 16 }}>
          <Tech name="Google Health API" body="Fitbit and Pixel Watch HRV, resting heart rate and sleep, from the reconciled multi-device stream." />
          <Tech name="Agent Development Kit + Gemini" body="Parallel analyst agents, a skeptic and a lead agent with structured output; Gemini also reads voice check-ins and landing videos." />
          <Tech name="FHIR R4 + Firebase" body="Signed briefs filed as DiagnosticReports; check-ins, approvals and the audit log in Firestore." />
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="safety">
        <div className="card flat">
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <div>
              <h3 id="safety">Safety and honesty, by design</h3>
              <p className="muted mt-8">Ragnor is decision support, not a medical device. It never diagnoses or says anyone is cleared, fine or safe to play, and a filter blocks that language from every AI output. Emergency signs in a check-in show &quot;get medical care now&quot; instantly. Where a metric hasn&apos;t been validated for someone like this person, Ragnor says so instead of guessing. The risk model is validated on simulated data today; pilots supply real outcomes.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="pricing">
        <div className="section-title">
          <div>
            <span className="eyebrow">Pricing (planned)</span>
            <h2 id="pricing" className="mt-8">Free for athletes. Paid by the people who act on it.</h2>
          </div>
        </div>
        <div className="grid grid-3 plans">
          <Plan featured name="Sports-medicine clinics" price="$12" sub="per patient sharing data, per month" items={["Trust-scored wearable data", "Pre-visit briefs with agent review", "Sign & file to your EHR (FHIR)", "Audit trail for every brief"]} />
          <Plan name="Schools & clubs" price="$20" sub="per athlete, per season ($40 universities)" items={["Coach view and daily check-ins", "LandingCheck + FixPlan", "Approval queue and season report", "Connects athletes to their clinic"]} />
          <Plan name="Wearable & EHR partners" price="API" sub="usage-based licensing" items={["Trust-score API for any device", "FHIR feed with trust extensions", "Validation-coverage reporting"]} />
        </div>
        <p className="tiny muted mt-8">Why clinics pay: a brief that takes two minutes to review replaces piecing data together while the patient waits, and trust scores answer the accuracy and liability concerns physicians cite most. Schools are our way in: their athletes are the patients clinics already see.</p>
      </section>

      <section className="container mt-40" aria-labelledby="pilot">
        <div className="card" style={{ padding: 28 }}>
          <div className="grid grid-2" style={{ gap: 32 }}>
            <div>
              <span className="eyebrow">Spring 2027 pilot</span>
              <h2 id="pilot" className="mt-8">Pilot Ragnor with your team or clinic</h2>
              <p className="muted mt-16">We&apos;re starting with high school and club programs and the sports-medicine clinics that see their athletes, beginning with girls&apos; soccer, basketball and volleyball, where injury risk is highest.</p>
            </div>
            <SignupForm />
          </div>
        </div>
      </section>

      <footer className="footer mt-40">
        <div className="container row wrap spread">
          <div className="row"><LogoMark size={22} /> <span>Ragnor · Built at GDG UC Santa Cruz DevFest 2026 · Athletes and data shown are fictional samples.</span></div>
          <div className="row wrap" style={{ gap: 16 }}>
            <a href="https://www.axios.com/2026/07/08/doctors-cant-harness-wearables" target="_blank" rel="noreferrer">AMA physician survey</a>
            <a href="https://mhealth.jmir.org/2026/1/e87324" target="_blank" rel="noreferrer">Wearable validation gaps</a>
            <a href="https://developers.google.com/health/about" target="_blank" rel="noreferrer">Google Health API</a>
          </div>
        </div>
      </footer>
    </>
  );
}

function Tech({ name, body }: { name: string; body: string }) {
  return (
    <div className="card flat" style={{ flex: "1 1 240px", maxWidth: 320 }}>
      <h4>{name}</h4>
      <p className="small muted mt-8">{body}</p>
    </div>
  );
}

function Plan({ name, price, sub, items, featured }: { name: string; price: string; sub: string; items: string[]; featured?: boolean }) {
  return (
    <div tabIndex={0} className={`card plan ${featured ? "featured" : ""}`}>
      <div className="row spread">
        <h3>{name}</h3>
        {featured && <span className="pill" style={{ background: "var(--primary)", color: "#fff" }}>Most popular</span>}
      </div>
      <div className="price mt-16">{price}</div>
      <div className="small" style={{ opacity: 0.75 }}>{sub}</div>
      <ul className="check-list">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

/** Static product preview for the hero: a clinician brief and the athlete's phone. */
function HeroMock() {
  return (
    <div className="hero-mock" style={{ position: "relative", minHeight: 460 }} aria-hidden="true">
      <div className="card hero-card" style={{ position: "absolute", right: 0, top: 10, left: 196, padding: "18px 18px 18px 52px", borderRadius: 28 }}>
        <div className="row spread">
          <strong>Pre-visit brief · Maya T.</strong>
          <span className="band band-low">Signed</span>
        </div>
        <hr className="divider" />
        {[
          ["Discuss", "HRV below her baseline on 2 trusted nights", "high"],
          ["Discuss", "Sleep 5 h short over 3 nights (check-ins + watch)", "high"],
          ["Watch", "Resting heart rate up; recheck next week", "moderate"],
          ["Noise", "Saturday's HRV crash: watch worn 3.4 h", "low"],
        ].map(([k, r, b]) => (
          <div key={r} className="row" style={{ padding: "8px 0", gap: 10 }}>
            <span className={`band band-${b}`} style={{ height: 22, fontSize: 11, minWidth: 64, justifyContent: "center" }}>{k}</span>
            <div className="tiny" style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: b === "low" ? "line-through" : undefined }}>{r}</div>
          </div>
        ))}
        <div className="tiny muted mt-8">Filed to EHR as FHIR · trust score on every reading</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 60, width: 230, zIndex: 2, borderRadius: 36, background: "#1f1f1f", padding: 9, boxShadow: "0 18px 40px rgba(31,31,31,0.22)" }}>
        <div style={{ background: "var(--surface)", borderRadius: 28, padding: 16, minHeight: 330 }}>
          <div className="tiny muted">Your watch data this week</div>
          <div className="row mt-8" style={{ gap: 10 }}>
            <LogoMark size={36} />
            <div>
              <div className="strong">86% usable</div>
              <div className="tiny muted">1 night left out</div>
            </div>
          </div>
          <div className="stack mt-16" style={{ gap: 8 }}>
            <div className="bubble agent" style={{ fontSize: 12 }}>Your watch was loose Saturday night, so we left it out. Wear it a finger-width above your wrist bone.</div>
            <div className="bubble athlete" style={{ fontSize: 12 }}>Share a summary with my doctor ✓</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ position: "absolute", right: 18, bottom: 6, width: 220, padding: 14, borderRadius: 20, zIndex: 3 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--hrv)" }}><IconWave size={16} /></span><span className="small strong">Trust score</span></div>
        <div className="row mt-8" style={{ alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>15</span><span className="small muted">/ 100</span>
          <span className="delta bad">excluded</span>
        </div>
        <div className="tiny muted">Sat HRV · 27% motion artifact</div>
      </div>
    </div>
  );
}
