import Link from "next/link";
import { signOutDemo } from "@/app/actions";
import { DEMO_BADGE } from "@/lib/copy";
import { isDemoMode } from "@/lib/data";
import { getSession } from "@/lib/session";

const NAV: Record<string, { href: string; label: string }[]> = {
  athlete: [
    { href: "/athlete", label: "My status" },
    { href: "/checkin", label: "Check-in" },
    { href: "/impact", label: "Report a hit" },
  ],
  trainer: [{ href: "/trainer", label: "Alert queue" }],
  coach: [{ href: "/coach", label: "Who to look at" }],
  parent: [{ href: "/parent", label: "Consent" }],
};

export async function Header() {
  const session = await getSession();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          Rag<span>nor</span>
        </Link>
        {isDemoMode() && (
          <span className="demo-badge" title="Example data only">
            {DEMO_BADGE}
          </span>
        )}
        <nav className="nav" aria-label="Main">
          <Link href="/judges">For judges</Link>
          {session &&
            NAV[session.profile.role].map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          {session && (
            <form action={signOutDemo} className="inline-form">
              <button className="btn secondary" type="submit">
                Switch role ({session.profile.displayLabel})
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
