import { NextResponse } from "next/server";
import { getAthlete } from "@/lib/store.ts";
import { athleteBundle } from "@/lib/fhir.ts";
import { requireKey } from "@/lib/apiAuth.ts";

export const dynamic = "force-dynamic";

/** GET /api/v1/fhir/Patient/{id} — FHIR R4 Bundle: Patient, wearable Observations (LOINC), HitWatch symptom Observations, RiskAssessment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireKey(req, "GET /v1/fhir/Patient/{id}");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const a = getAthlete(id);
  if (!a) return NextResponse.json({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] }, { status: 404 });
  return NextResponse.json(athleteBundle(a), { headers: { "Content-Type": "application/fhir+json" } });
}
