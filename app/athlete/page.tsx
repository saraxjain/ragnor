import { AthleteToday } from "./AthleteToday.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; health?: string }> }) {
  const sp = await searchParams;
  return <AthleteToday id={sp.id ?? "ath_01"} health={sp.health} />;
}
