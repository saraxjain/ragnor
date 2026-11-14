import { LandingClient } from "./LandingClient.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  return <LandingClient id={sp.id ?? "ath_02"} />;
}
