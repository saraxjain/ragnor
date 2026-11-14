import { CheckinClient } from "./CheckinClient.tsx";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  return <CheckinClient id={sp.id ?? "ath_01"} />;
}
