import { AthleteDetail } from "./AthleteDetail.tsx";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AthleteDetail id={id} />;
}
