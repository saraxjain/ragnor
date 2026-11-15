import Link from "next/link";
import { SignupForm } from "@/components/SignupForm.tsx";
import { Pricing } from "@/components/Pricing.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconWave, IconShield, IconSpark, IconReport, IconUsers, IconAlert, IconBolt, IconWatch, IconSchool } from "@/components/icons.tsx";

const STEPS = [
  { title: "Trust-score every reading", points: ["Fitbit and Pixel Watch data via the Google Health API", "Each night is scored: worn? motion artifact? sources agree?", "Unverified readings are set aside, with the reason shown"] },
  { title: "Compare to your own normal", points: ["HRV, resting heart rate and sleep vs. your own baseline", "Daily 20-second check-ins", "Model runs on trusted data only"] },
  { title: "AI agents argue about what matters", points: ["Gemini agents (Google ADK) review in parallel", "A skeptic agent argues every finding is noise", "Code safety rules block words like \"cleared\" or \"safe to play\""] },
  { title: "A brief the doctor can sign", points: ["One page: what to discuss, watch, and rule out", "Evidence and a trust score on every reading", "Signed briefs filed as a FHIR DiagnosticReport"] },
  { title: "Useful for athletes and coaches too", points: ["Athletes get plain-language tips and choose what to share", "Coaches get one list of who to look at today", "Nothing leaves Ragnor until a person approves it"] },
];

const STEP_TAGS = ["Trust", "Baseline", "Agents", "Clinician", "Athletes & coaches"];
const STEP_ART = ["#dbe7f6", "#e3f1ea", "#ece4f7", "#fbe7dc", "#e1eef7"];
const STEP_ICON = [IconShield, IconWave, IconSpark, IconReport, IconUsers];

export default function Home() {
  return (
    <div className="fd">
      <section className="fd-band fd-band-first" aria-labelledby="problem">
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

      <section className="container fd-section" aria-labelledby="solution">
        <h2 id="solution" className="fd-section-title"><IconShield size={26} /> Our Solution</h2>
        <div className="fd-promo">
          <div className="fd-promo-art" aria-hidden="true">
            <PromoArt />
          </div>
          <div className="fd-promo-card">
            <h1 className="fd-h1">Wearable data doctors can actually trust.</h1>
            <p className="fd-lead">Ragnor scores every reading for trust, lets AI agents argue about what matters, and hands the doctor a short brief they can sign. We start with student athletes.</p>
            <Link href="/clinician" className="fd-pill mt-16">See a clinician brief</Link>
          </div>
        </div>
      </section>

      <section className="container fd-section" aria-labelledby="how">
        <h2 id="how" className="fd-section-title"><IconBolt size={26} /> How it works</h2>
        <div className="fd-how-intro">
          <h3 className="fd-h2">Everyone else shows more data. We cut out the noise.</h3>
          <div>
            <p>Wearable apps give people dashboards. Remote-monitoring tools give doctors alert queues that never reach zero. Ragnor filters first: a false alarm from a loose watch never reaches the doctor, and what does arrive comes with evidence and a trust score.</p>
            <Link href="/engine" className="fd-pill mt-16">Watch the pipeline run live</Link>
          </div>
        </div>
        <p className="fd-intro">From scrambled data to a concise report, in five steps.</p>
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
                  <ul>{st.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
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
          <div className="fd-plans"><Pricing /></div>
        </div>
      </section>

      <section className="container fd-section" aria-labelledby="pilot">
        <h2 id="pilot" className="fd-section-title"><IconSchool size={26} /> Spring 2027 pilot</h2>
        <div className="fd-pilot">
          <div>
            <h3 className="fd-h3">Pilot Ragnor with your team or clinic</h3>
            <p className="mt-16">We&apos;re starting with high school and club programs and the sports-medicine clinics that see their athletes.</p>
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

/** Decorative panel for the solution promo: noisy readings on the left, one trusted brief on the right. */
function PromoArt() {
  return (
    <svg viewBox="0 0 320 200" className="fd-promo-svg">
      {[30, 62, 94, 126, 158].map((y, i) => (
        <rect key={y} x={24} y={y} width={[96, 70, 110, 58, 88][i]} height={14} rx={7} fill={i % 2 ? "#f9b27c" : "#9ec0ea"} opacity={0.85} />
      ))}
      <path d="M154 100 H190" stroke="#0b1f4d" strokeWidth={3} strokeLinecap="round" />
      <path d="M162 90 L150 100 L162 110" fill="none" stroke="#0b1f4d" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={204} y={46} width={96} height={108} rx={12} fill="#fff" stroke="#0b1f4d" strokeWidth={2} />
      <rect x={218} y={62} width={50} height={8} rx={4} fill="#0b1f4d" />
      <rect x={218} y={82} width={68} height={7} rx={3.5} fill="#c9d3e6" />
      <rect x={218} y={98} width={60} height={7} rx={3.5} fill="#c9d3e6" />
      <rect x={218} y={114} width={66} height={7} rx={3.5} fill="#c9d3e6" />
      <circle cx={280} cy={138} r={9} fill="#0a5fa8" />
      <path d="M276 138 L279 141 L285 134" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
