"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Logo.tsx";

const LINKS = [
  { href: "/", label: "For schools", match: (p: string) => p === "/", hideSm: true },
  { href: "/athlete", label: "Athlete", match: (p: string) => p.startsWith("/athlete") },
  { href: "/coach", label: "Coach", match: (p: string) => p.startsWith("/coach") },
  { href: "/report", label: "Report", match: (p: string) => p.startsWith("/report"), hideSm: true },
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
            <Link key={l.href} href={l.href} className={l.hideSm ? "hide-sm" : undefined} aria-current={l.match(path) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
