"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconHome, IconMic, IconVideo, IconPhone } from "./icons.tsx";

export const DEMO_ATHLETES = [
  { id: "ath_01", name: "Maya Torres" },
  { id: "ath_02", name: "Jordan Lee" },
  { id: "ath_03", name: "Priya Nair" },
  { id: "ath_05", name: "Sofia Ramirez" },
  { id: "ath_07", name: "Hannah Brooks" },
  { id: "ath_04", name: "Ava Johnson" },
];

export function AthleteNav({ id }: { id: string }) {
  const path = usePathname();
  const items = [
    { href: `/athlete?id=${id}`, label: "Today", icon: <IconHome size={20} />, active: path === "/athlete" },
    { href: `/athlete/checkin?id=${id}`, label: "Check-in", icon: <IconMic size={20} />, active: path === "/athlete/checkin" },
    { href: `/athlete/landing?id=${id}`, label: "Landing", icon: <IconVideo size={20} />, active: path === "/athlete/landing" },
  ];
  return (
    <nav className="bottom-nav" aria-label="Athlete">
      <div className="bottom-nav-inner">
        {items.map((i) => (
          <Link key={i.label} href={i.href} aria-current={i.active ? "page" : undefined}>
            <span className="ind">{i.icon}</span>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function AthletePicker({ id }: { id: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="row small muted" style={{ gap: 6 }}>
      <span>Viewing as</span>
      <select
        className="select"
        style={{ width: "auto", padding: "6px 10px", borderRadius: 999, fontSize: 13 }}
        value={id}
        onChange={(e) => router.push(`${path}?id=${e.target.value}`)}
        aria-label="Demo athlete"
      >
        {DEMO_ATHLETES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}
