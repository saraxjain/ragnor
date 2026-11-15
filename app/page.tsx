import Link from "next/link";
import { SignupForm } from "@/components/SignupForm.tsx";
import { Pricing } from "@/components/Pricing.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconWave, IconShield, IconSpark, IconReport, IconUsers, IconAlert, IconBolt, IconWatch, IconSchool } from "@/components/icons.tsx";

const STEPS = [
  { title: "Trust-score every reading", body: "Data arrives from Fitbit and Pixel Watch through the Google Health API. Before anything else sees it, each night gets a trust score: was the watch actually worn, was there motion artifact, do two sources agree, and has this metric been validated for someone like this person? Unverified readings are set aside, not silently used." },
  { title: "Compare to your own normal", body: "Overnight HRV, resting heart rate and sleep are compared with each person's own baseline, alongside 20-second check-ins and a phone-video landing screen. A validated risk model and a versioned rules engine run on trusted data only." },
  { title: "AI agents argue about what matters", body: "Built with Google's Agent Development Kit on Gemini. Signal-quality, baseline and clinical-relevance agents work in parallel; a skeptic agent argues every finding is noise. Only what survives reaches a person." },
  { title: "A brief the doctor can sign", body: "The clinician gets one page before the visit: what to discuss, what to watch, and what was ruled out as noise, with evidence. One click files it into the health record as FHIR, with a trust score on every reading." },
  { title: "Useful for athletes and coaches too", body: "Athletes see plain-language feedback (\"your watch was loose Saturday, wear it snug\") and choose what to share. Coaches get one list of who to look at today. Nothing is sent without a person approving it." },
];

const SUGGESTIONS = [
  { href: "/athlete", label: "Athlete app" },
  { href: "/coach", label: "Coach view" },
  { href: "/clinician", label: "Clinician brief" },
  { href: "/engine", label: "Behind the scenes" },
  { href: "/report", label: "Season report" },
  { href: "#pricing", label: "Pricing" },
  { href: "#pilot", label: "Join the pilot" },
];

const SAFEGUARDS = [
  { title: "Trust score on every reading, with the reason", body: "Each night is checked for how long the watch was worn, motion artifact, whether two sources agree, and whether the metric is validated for someone like this athlete. Low-trust nights are set aside and the reason is shown." },
  { title: "A skeptic agent challenges every finding", body: "While analyst agents look for real changes, a skeptic agent argues each one is noise. A finding reaches a person only if it survives that challenge." },
  { title: "Safety checks that only make output more cautious", body: "Rules written in code, not prompts, sit after the AI. They can raise a concern or block wording like \"cleared\" or \"safe to play\", but they can never make a result sound safer." },
  { title: "FHIR output for existing health records", body: "A signed brief is filed as a standard FHIR DiagnosticReport, so it drops into the clinic's record system with a trust score attached to each reading." },
  { title: "Nothing filed or sent without a human signing", body: "Alerts to coaches and briefs to doctors wait in an approval queue. A person reviews and signs before anything leaves Ragnor." },
];

const STEP_TAGS = ["Trust", "Baseline", "Agents", "Clinician", "Athletes & coaches"];
const STEP_ART = ["#dbe7f6", "#e3f1ea", "#ece4f7", "#fbe7dc", "#e1eef7"];
const STEP_ICON = [IconShield, IconWave, IconSpark, IconReport, IconUsers];

export default function Home() {
  return (
    <div className="fd">
      <section className="container fd-hero" aria-labelledby="hero-title">
        <div className="fd-hero-media">
          <HeroMock />
        </div>
        <div className="fd-hero-card">
          <h1 id="hero-title" className="fd-h1">Wearable data doctors can actually trust.</h1>
          <p className="fd-lead">Ragnor scores every reading for trust, lets AI agents argue about what matters, and hands the doctor a short brief they can sign. We start with student athletes.</p>
          <h2 className="fd-suggest-title">Where would you like to start?</h2>
          <div className="fd-pills">
            {SUGGESTIONS.map((x) => <Link key={x.href} href={x.href} className="fd-pill">{x.label}</Link>)}
          </div>
        </div>
      </section>

      <section className="container fd-feature" aria-labelledby="diff">
        <div className="fd-feature-media">
          <ul className="fd-feature-list">
            {SAFEGUARDS.map((g) => (
              <li key={g.title}>
                <strong>{g.title}</strong>
                <span>{g.body}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="fd-feature-card">
          <h2 id="diff" className="fd-h2">Everyone else shows more data. We show less, and it&apos;s right.</h2>
          <p className="mt-16">Wearable apps give people dashboards. Remote-monitoring tools give doctors alert queues that never reach zero. Ragnor filters first: a false alarm from a loose watch never reaches the doctor, and what does arrive comes with evidence and a trust score.</p>
          <Link href="/engine" className="fd-pill mt-24">Watch the pipeline run live</Link>
        </div>
      </section>

      <section className="fd-band" aria-labelledby="problem">
        <div className="container">
          <h2 id="problem" className="fd-section-title"><IconAlert size={26} /> The problem in numbers</h2>
          <div className="fd-cards-3">
            <div className="fd-card">
              <div className="fd-stat-num">65%</div>
              <p>of U.S. high schools do not have a full-time athletic trainer.</p>
            </div>
            <div className="fd-card">
              <div className="fd-stat-num">~4 in 10</div>
              <p>possible concussions in high school athletes are never reported to a coach or medical professional.</p>
            </div>
            <div className="fd-card">
              <div className="fd-stat-num">8.27M</div>
              <p>students played high school sports in 2024–25, a record. Most of them already wear a fitness tracker or smartwatch.</p>
            </div>
          </div>
          <p className="tiny muted mt-16">Sources: NATA / Korey Stringer Institute ATLAS study (the 65% is our calculation from its figures: about 35% of all U.S. schools with athletics had a full-time trainer); Register-Mihalik et al. 2013; NFHS 2024–25 participation survey.</p>
        </div>
      </section>

      <section className="container fd-section" aria-labelledby="how">
        <h2 id="how" className="fd-section-title"><IconBolt size={26} /> How it works</h2>
        <p className="fd-intro">From a noisy watch to a decision a doctor will sign, in five steps.</p>
        <ol className="fd-articles">
          {STEPS.map((st, i) => {
            const Icon = STEP_ICON[i];
            return (
              <li key={st.title} className="fd-article">
                <div className="fd-article-art" style={{ background: STEP_ART[i] }} aria-hidden="true">
                  <span className="fd-article-num">{i + 1}</span>
                  <Icon size={40} />
                </div>
                <div className="fd-article-body">
                  <span className="fd-tag">{STEP_TAGS[i]}</span>
                  <h3>{st.title}</h3>
                  <p>{st.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="container fd-section" aria-labelledby="google">
        <h2 id="google" className="fd-section-title"><IconWatch size={26} /> Built on Google</h2>
        <div className="fd-cards-3">
          <Tech name="Google Health API" body="Fitbit and Pixel Watch HRV, resting heart rate and sleep, from the reconciled multi-device stream." />
          <Tech name="Agent Development Kit + Gemini" body="Parallel analyst agents, a skeptic and a lead agent with structured output; Gemini also reads voice check-ins and landing videos." />
          <Tech name="FHIR R4 + Firebase" body="Signed briefs filed as DiagnosticReports; check-ins, approvals and the audit log in Firestore." />
        </div>
      </section>

      <section className="fd-split" aria-label="Safety and the athlete app">
        <div className="fd-split-cell">
          <div>
            <h2 id="safety" className="fd-h3">Safety and honesty, by design</h2>
            <p className="small mt-8">Decision support, not a medical device. Ragnor never diagnoses or says anyone is cleared, fine or safe to play, and a filter blocks that language from every AI output. Emergency signs in a check-in show &quot;get medical care now&quot; instantly.</p>
            <Link href="/clinician" className="fd-pill mt-16">See a signed brief</Link>
          </div>
          <ArtShield />
        </div>
        <div className="fd-split-cell">
          <div>
            <h2 className="fd-h3">Try it as an athlete</h2>
            <p className="small mt-8">A 20-second check-in, plain-language feedback on your watch data, and you choose what to share with your doctor.</p>
            <Link href="/athlete" className="fd-pill mt-16">Open the athlete app</Link>
          </div>
          <ArtPhone />
        </div>
      </section>

      <section className="fd-band" aria-labelledby="pricing">
        <div className="container">
          <h2 id="pricing" className="fd-section-title"><IconReport size={26} /> Pricing (planned)</h2>
          <p className="fd-intro">Free for athletes. Paid by the people who act on it.</p>
          <div className="fd-plans"><Pricing /></div>
        </div>
      </section>

      <section className="container fd-section" aria-labelledby="pilot">
        <h2 id="pilot" className="fd-section-title"><IconSchool size={26} /> Spring 2027 pilot</h2>
        <div className="fd-pilot">
          <div>
            <h3 className="fd-h3">Pilot Ragnor with your team or clinic</h3>
            <p className="mt-16">We&apos;re starting with high school and club programs and the sports-medicine clinics that see their athletes, beginning with girls&apos; soccer, basketball and volleyball, where injury risk is highest.</p>
          </div>
          <div className="fd-card"><SignupForm /></div>
        </div>
      </section>

      <footer className="fd-footer">
        <div className="container">
          <div className="fd-footer-cols">
            <div>
              <h4>Product</h4>
              <Link href="/athlete">Athlete app</Link>
              <Link href="/coach">Coach view</Link>
              <Link href="/clinician">Clinician</Link>
              <Link href="/report">Season report</Link>
            </div>
            <div>
              <h4>Learn</h4>
              <Link href="/engine">Behind the scenes</Link>
              <a href="#how">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#pilot">Join the pilot</a>
            </div>
            <div>
              <h4>Sources</h4>
              <a href="https://www.axios.com/2026/07/08/doctors-cant-harness-wearables" target="_blank" rel="noreferrer">AMA physician survey</a>
              <a href="https://mhealth.jmir.org/2026/1/e87324" target="_blank" rel="noreferrer">Wearable validation gaps</a>
              <a href="https://developers.google.com/health/about" target="_blank" rel="noreferrer">Google Health API</a>
            </div>
          </div>
          <div className="fd-footer-base">
            <LogoMark size={22} />
            <span>Ragnor · Built at GDG UC Santa Cruz DevFest 2026 · Athletes and data shown are fictional samples. Decision support, not a diagnosis.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ArtShield() {
  return (
    <svg className="fd-art" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="30" cy="30" r="8" fill="#f6b8c8" /><circle cx="18" cy="48" r="5" fill="#f6b8c8" /><circle cx="96" cy="22" r="6" fill="#bcd3f2" />
      <path d="M60 18 L94 30 V58 C94 80 79 95 60 102 C41 95 26 80 26 58 V30 Z" fill="#1d4ed8" />
      <path d="M45 60 L56 71 L77 48" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArtPhone() {
  return (
    <svg className="fd-art" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="98" cy="30" r="9" fill="#f6b8c8" /><circle cx="20" cy="86" r="6" fill="#bcd3f2" /><circle cx="104" cy="92" r="5" fill="#bcd3f2" />
      <rect x="36" y="12" width="48" height="96" rx="10" fill="#0b1f4d" />
      <rect x="41" y="20" width="38" height="78" rx="5" fill="#fff" />
      <circle cx="60" cy="44" r="13" fill="none" stroke="#1d4ed8" strokeWidth="5" strokeDasharray="60 82" transform="rotate(-90 60 44)" />
      <rect x="46" y="66" width="28" height="6" rx="3" fill="#dbe7f6" /><rect x="46" y="77" width="20" height="6" rx="3" fill="#f6b8c8" />
    </svg>
  );
}

function Tech({ name, body }: { name: string; body: string }) {
  return (
    <div className="fd-card">
      <div className="fd-card-title">{name}</div>
      <p>{body}</p>
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
