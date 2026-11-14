import { AthleteHitWatch } from "./AthleteHitWatch.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  return <AthleteHitWatch id={sp.id ?? "ath_01"} />;
}
