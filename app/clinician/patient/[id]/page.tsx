import { PatientBrief } from "./PatientBrief.tsx";
export const metadata = { title: "Pre-visit brief · Ragnor" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientBrief id={id} />;
}
