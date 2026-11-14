import Link from "next/link";
import { SignupForm } from "@/components/SignupForm.tsx";
import { Pricing } from "@/components/Pricing.tsx";
import { LogoMark } from "@/components/Logo.tsx";
import { IconVideo, IconUsers, IconWatch, IconShield, IconReport, IconSpark, IconWave, IconAlert } from "@/components/icons.tsx";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill teal">For high schools without a full-time athletic trainer</span>
            <h1 className="mt-16">
              Wearables collect the data.
              <br />
              <span style={{ color: "var(--primary)" }}>Ragnor turns it into a decision.</span>
            </h1>
            <p className="lead">
              An AI agent that turns the Fitbits and Pixel Watches athletes already wear into an athletic trainer: daily check-ins, ACL landing screens from a phone video, and one clear list for the coach.
            </p>
            <div className="row wrap mt-24">
              <Link href="/coach" className="btn btn-filled btn-lg">See the coach view</Link>
              <Link href="/athlete" className="btn btn-outlined btn-lg">Try the athlete app</Link>
            </div>
            <p className="small muted mt-16">Ragnor flags risk and gets athletes to a person sooner. It never diagnoses and never clears anyone to play.</p>
          </div>
          <HeroMock />
        </div>
      </section>

      <section className="container" aria-labelledby="problem">
        <h2 id="problem" className="sr-only">The problem</h2>
        <div className="stat-band">
          <div className="card">
            <div className="big-stat">37%</div>
            <p className="muted">of US public high schools have a full-time athletic trainer. About a third have no trainer access at all.</p>
          </div>
          <div className="card">
            <div className="big-stat purple">~4 in 10</div>
            <p className="muted">possible concussions in high school athletes are never reported to a coach or medical professional.</p>
          </div>
          <div className="card">
            <div className="big-stat green">8.27M</div>
            <p className="muted">students played high school sports in 2024–25, a record. Most of them already wear a fitness tracker or smartwatch.</p>
          </div>
        </div>
        <p className="tiny muted mt-8">Sources: NATA / Korey Stringer Institute ATLAS study; Register-Mihalik et al. 2013; NFHS 2024–25 participation survey.</p>
        <blockquote className="card flat mt-24" style={{ margin: "24px 0 0", borderLeft: "6px solid var(--high)", borderRadius: 16 }}>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(20px, 2.4vw, 28px)", lineHeight: 1.35 }}>“Five concussions taught me the warning signs were there. Nobody was reading them.”</p>
          <p className="small strong mt-8">Chelsi Vaghela, co-founder</p>
        </blockquote>
      </section>

      <section className="container mt-40" aria-labelledby="how">
        <div className="section-title">
          <div>
            <span className="eyebrow">How it works</span>
            <h2 id="how" className="mt-8">The follow-through a trainer would do, without the trainer</h2>
          </div>
        </div>
        <div className="grid grid-3">
          <Feature icon={<IconWatch />} tone="var(--teal-container)" ink="var(--teal-ink)" title="Your normal, from your watch" body="Overnight HRV, resting heart rate and sleep from Fitbit and Pixel Watch, through the Google Health API. Ragnor only ever asks one question: is this athlete back to their own baseline?" />
          <Feature icon={<IconVideo />} tone="var(--primary-container)" ink="var(--primary)" title="LandingCheck" body="A 10-second phone video of a drop jump. Gemini flags the landing errors linked to ACL tears, like a knee caving inward, with the exact moment it happens." />
          <Feature icon={<IconSpark />} tone="var(--primary-container)" ink="var(--on-primary-container)" title="FixPlan" body="A 10-minute warm-up built for the errors found, and a weekly re-film so athletes can see the change." />
          <Feature icon={<IconUsers />} tone="var(--mod-container)" ink="var(--mod)" title="Coach view" body="One list: who to look at today and why, in plain words. Every alert waits for a person to approve it before anyone is contacted." />
          <Feature icon={<IconReport />} tone="var(--low-container)" ink="var(--low)" title="Season report" body="For athletic directors: athletes screened, alerts handled and staff hours saved, with an audit trail behind every flag." />
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="diff">
        <div className="card tonal">
          <div className="grid grid-2" style={{ alignItems: "center" }}>
            <div>
              <span className="eyebrow">Why Ragnor</span>
              <h2 id="diff" className="mt-8">Others screen once or alert once. Ragnor follows through.</h2>
              <p className="muted mt-16">Screening apps check a jump on one day. Wellness coaches read one person's watch. None of them keep watching a whole team that doesn't have a trainer, day after day, and tell the coach who to look at today.</p>
            </div>
            <ul className="check-list">
              <li>Uses hardware schools and athletes already own</li>
              <li>A rules engine decides every risk level; AI only reads and explains</li>
              <li>Every flag stores its inputs, rule version and reason</li>
              <li>No alert is sent without a human tapping approve</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="google">
        <div className="section-title">
          <div>
            <span className="eyebrow">Built on Google</span>
            <h2 id="google" className="mt-8">Gemini, the Google Health API and Firebase</h2>
          </div>
        </div>
        <div className="grid grid-4">
          <Tech name="Gemini video understanding" body="Scores landing videos with structured output: one field per landing error, with timestamp and confidence." />
          <Tech name="Google Health API" body="Fitbit and Pixel Watch HRV, resting heart rate and sleep for personal baselines." />
          <Tech name="Firebase" body="Athletes, check-ins, the alert approval queue and the audit log." />
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="safety">
        <div className="card flat">
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <span className="feature-icon" style={{ background: "var(--surface-2)", color: "var(--ink-2)", margin: 0 }}><IconShield /></span>
            <div>
              <h3 id="safety">Safety first, by design</h3>
              <p className="muted mt-8">Ragnor is a wellness and triage tool, not a medical device. It never says an athlete is cleared, fine or safe to play, and a filter blocks that language from every AI output. Emergency answers show "get medical care now" instantly. LandingCheck is a LESS-style screen, not a validated clinical score, and HRV can show recovery but can't detect a concussion. Return-to-play decisions stay with licensed clinicians.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container mt-40" aria-labelledby="pricing">
        <div className="section-title">
          <div>
            <span className="eyebrow">Pricing</span>
            <h2 id="pricing" className="mt-8">Trainer-level follow-up for a fraction of trainer hours</h2>
          </div>
        </div>
        <Pricing />
        <p className="tiny muted mt-8">Institutions pay; athletes never do. Why schools pay: it saves trainers hours of tracking, and a documented trail of flags and staff approvals lowers liability. Our $20–$40 sits between student tools (training logs, ~$900–1,400/yr) and pro load trackers (~$28K per team).</p>
      </section>

      <section className="container mt-40" aria-labelledby="pilot">
        <div className="card" style={{ padding: 28 }}>
          <div className="grid grid-2" style={{ gap: 32 }}>
            <div>
              <span className="eyebrow">Spring 2027 pilot</span>
              <h2 id="pilot" className="mt-8">Bring Ragnor to your school</h2>
              <p className="muted mt-16">We're starting with girls' soccer, basketball, volleyball and gymnastics programs, where ACL risk is several times higher and concussions still go unreported.</p>
            </div>
            <SignupForm />
          </div>
        </div>
      </section>

      <footer className="footer mt-40">
        <div className="container row wrap spread">
          <div className="row"><LogoMark size={22} /> <span>Ragnor · Built at GDG UC Santa Cruz DevFest 2026 · Athletes and data shown are fictional samples.</span></div>
          <div className="row wrap" style={{ gap: 16 }}>
            <a href="https://www.athleticbusiness.com/high-school/one-third-of-high-schools-operating-without-athletic-trainer.html" target="_blank" rel="noreferrer">ATLAS study</a>
            <a href="https://concussions.smart-teams.org/?p=1820" target="_blank" rel="noreferrer">Concussion underreporting</a>
            <a href="https://www.nfhs.org/articles/participation-in-high-school-sports-hits-record-high-with-sizable-increase-in-2024-25/" target="_blank" rel="noreferrer">NFHS participation</a>
            <a href="https://developers.google.com/health/about" target="_blank" rel="noreferrer">Google Health API</a>
          </div>
        </div>
      </footer>
    </>
  );
}

function Feature({ icon, title, body, tone, ink }: { icon: React.ReactNode; title: string; body: string; tone: string; ink: string }) {
  return (
    <div className="card">
      <div className="feature-icon" style={{ background: tone, color: ink }}>{icon}</div>
      <h3>{title}</h3>
      <p className="muted mt-8">{body}</p>
    </div>
  );
}

function Tech({ name, body }: { name: string; body: string }) {
  return (
    <div className="card flat">
      <h4>{name}</h4>
      <p className="small muted mt-8">{body}</p>
    </div>
  );
}

/** Static product preview for the hero: a phone check-in and a coach card. */
function HeroMock() {
  return (
    <div className="hero-mock" style={{ position: "relative", minHeight: 460 }} aria-hidden="true">
      <div className="card hero-card" style={{ position: "absolute", right: 0, top: 10, left: 196, padding: "18px 18px 18px 52px", borderRadius: 28 }}>
        <div className="row spread">
          <strong>Today · Westbrook High</strong>
          <span className="band band-high">3 high</span>
        </div>
        <hr className="divider" />
        {[
          ["Maya T.", "HRV 22% below normal for 3 nights, resting heart rate up", "high"],
          ["Priya N.", "Under 6 h sleep for 3 nights, load up 32%", "high"],
          ["Jordan L.", "Left knee caves inward on landing", "moderate"],
        ].map(([n, r, b]) => (
          <div key={n} className="row" style={{ padding: "9px 0" }}>
            <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{n.split(" ").map((s) => s[0]).join("")}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small strong">{n}</div>
              <div className="tiny muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r}</div>
            </div>
            <span className={`band band-${b}`} style={{ height: 22, fontSize: 11 }}>{b === "high" ? "High" : "Mod"}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, top: 60, width: 230, zIndex: 2, borderRadius: 36, background: "#1f1f1f", padding: 9, boxShadow: "0 18px 40px rgba(31,31,31,0.22)" }}>
        <div style={{ background: "var(--surface)", borderRadius: 28, padding: 16, minHeight: 330 }}>
          <div className="tiny muted">Daily check-in</div>
          <div className="row mt-8" style={{ gap: 10 }}>
            <LogoMark size={36} />
            <div>
              <div className="strong">Ragnor</div>
              <div className="tiny muted">60-second check-in</div>
            </div>
          </div>
          <div className="stack mt-16" style={{ gap: 8 }}>
            <div className="bubble agent" style={{ fontSize: 12 }}>How'd you sleep last night?</div>
            <div className="bubble athlete" style={{ fontSize: 12 }}>About five and a half hours.</div>
            <div className="bubble agent" style={{ fontSize: 12 }}>Thanks. Anything sore or tight today?</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ position: "absolute", right: 18, bottom: 6, width: 210, padding: 14, borderRadius: 20, zIndex: 3 }}>
        <div className="row" style={{ gap: 8 }}><span style={{ color: "var(--hrv)" }}><IconWave size={16} /></span><span className="small strong">Overnight HRV</span></div>
        <div className="row mt-8" style={{ alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500 }}>52</span><span className="small muted">ms</span>
          <span className="delta bad">−22% vs normal</span>
        </div>
      </div>
    </div>
  );
}
