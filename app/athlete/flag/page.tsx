import { FlagDetail } from "./FlagDetail.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; rule?: string; area?: string }> }) {
  const sp = await searchParams;
  return <FlagDetail id={sp.id ?? "ath_01"} rule={sp.rule ?? ""} area={sp.area} />;
}
