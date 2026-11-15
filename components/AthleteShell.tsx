"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readMyProfile, restoreIfMissing, type MyProfile } from "@/lib/myProfile.ts";
import { IconHome, IconMic, IconVideo, IconPhone } from "./icons.tsx";

export const DEMO_ATHLETES = [
  { id: "ath_01", name: "Maya Torres" },
  { id: "ath_02", name: "Jordan Lee" },
  { id: "ath_03", name: "Priya Nair" },
  { id: "ath_05", name: "Sofia Ramirez" },
  { id: "ath_07", name: "Hannah Brooks" },
  { id: "ath_04", name: "Ava Johnson" },
  { id: "ath_06", name: "Chloe Kim" },
  { id: "ath_08", name: "Lena Okafor" },
  { id: "ath_09", name: "Riley Chen" },
  { id: "ath_10", name: "Grace Patel" },
  { id: "ath_11", name: "Zoe Martinez" },
  { id: "ath_12", name: "Emma Wilson" },
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

const NEW = "__new__";

export function AthletePicker({ id }: { id: string }) {
  const router = useRouter();
  const path = usePathname();
  const [mine, setMine] = useState<MyProfile | null>(null);

  useEffect(() => {
    const p = readMyProfile();
    setMine(p);
    if (!p) return;
    const hasId = new URLSearchParams(window.location.search).has("id");
    // Someone with their own profile lands on it by default instead of on a sample athlete.
    if (!hasId && id !== p.id) return router.replace(`${path}?id=${p.id}`);
    // The demo store is in memory: put the profile back if the server restarted, then reload the page's data.
    if (id === p.id) void restoreIfMissing(p).then((restored) => restored && window.location.reload()).catch(() => {});
  }, [id, path, router]);

  const known = id === mine?.id || DEMO_ATHLETES.some((a) => a.id === id);
  return (
    <label className="row small muted" style={{ gap: 6 }}>
      <span>Viewing as</span>
      <select
        className="select"
        style={{ width: "auto", padding: "6px 10px", borderRadius: 999, fontSize: 13 }}
        value={id}
        onChange={(e) => router.push(e.target.value === NEW ? "/athlete/new" : `${path}?id=${e.target.value}`)}
        aria-label="Athlete"
      >
        {mine && <option value={mine.id}>{mine.name} (you)</option>}
        {!known && <option value={id}>Another athlete</option>}
        <optgroup label="Sample athletes">
          {DEMO_ATHLETES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>
        <option value={NEW}>{mine ? "Manage my profile…" : "＋ Create my profile…"}</option>
      </select>
    </label>
  );
}
