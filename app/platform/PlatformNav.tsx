"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const T = [["/platform", "Engine"], ["/platform/model", "Risk model"], ["/platform/evals", "Safety evals"], ["/platform/api", "API & FHIR"]] as const;
export function PlatformNav() {
  const p = usePathname();
  return (
    <nav className="tabs" aria-label="Platform">
      {T.map(([h, l]) => <Link key={h} href={h} className="tab" aria-current={p === h ? "page" : undefined}>{l}</Link>)}
    </nav>
  );
}
export function PlatformShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="page"><div className="container stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <header><div className="small muted strong">RAGNOR ENGINE</div><h1 style={{ margin: "4px 0" }}>{title}</h1><p className="muted" style={{ margin: 0, maxWidth: 760 }}>{sub}</p></header>
      <PlatformNav />
      {children}
    </div></div>
  );
}
