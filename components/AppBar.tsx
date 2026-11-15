"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo.tsx";

const LINKS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/athlete", label: "Athlete app", match: (p: string) => p.startsWith("/athlete") },
  { href: "/coach", label: "Coach view", match: (p: string) => p.startsWith("/coach") },
  { href: "/clinician", label: "Clinician", match: (p: string) => p.startsWith("/clinician") },
  { href: "/engine", label: "Behind the scenes", match: (p: string) => p.startsWith("/engine") },
  { href: "/report", label: "Season report", match: (p: string) => p.startsWith("/report") },
];

export function AppBar() {
  const path = usePathname() ?? "/";
  return (
    <header className="appbar">
      <div className="container appbar-inner">
        <Link href="/" className="brand" aria-label="Ragnor home">
          <LogoMark />
          Ragnor
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
