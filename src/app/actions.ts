"use server";

import { isNamed } from "@/lib/errors";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDataAccess } from "@/lib/data";
import { startImpact } from "@/lib/ingest";
import { runScriptedHitwatch, type Scenario } from "@/lib/hitwatch/service";
import { logFollowUp, markChecked, reportImpact, submitCheckin, ValidationError } from "@/lib/services";
import { getSession, homeFor, DEMO_COOKIE } from "@/lib/session";
import { localDateOf } from "@/lib/time";
import { AVAILABILITY_VALUES, type Evaluation, type OutcomeKind } from "@/lib/types";
import { parseCheckin, parseImpact, parseSymptomLog } from "@/lib/validation";
import type { FlagView, FormState } from "./form-state";

const view = (e: Evaluation): FlagView[] =>
  e.flags.map((f) => ({ id: f.id, level: f.level, bodyArea: f.bodyArea, reason: f.reason, action: f.action, confidence: f.confidence, trainerAlert: f.trainerAlert }));

function toErrorState(err: unknown): FormState {
  if (isNamed<ValidationError>(err, "ValidationError")) return { errors: { form: err.message, ...err.errors } };
  if (isNamed(err, "ConsentRequiredError")) return { errors: { form: err.message } };
  if (isNamed(err, "ForbiddenError")) return { errors: { form: "You are not allowed to do that." } };
  throw err;
}

async function needSession() {
  const s = await getSession();
  if (!s) redirect("/");
  return s;
}

export async function pickDemoProfile(formData: FormData) {
  const id = String(formData.get("profileId") ?? "");
  const da = await getDataAccess();
  const profile = (await da.listDemoProfiles()).find((p) => p.id === id);
  if (!profile) redirect("/");
  (await cookies()).set(DEMO_COOKIE, profile.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(homeFor(profile.role));
}

export async function signOutDemo() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/");
}

export async function submitCheckinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor } = await needSession();
  const parsed = parseCheckin(fd);
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    const da = await getDataAccess();
    const { evaluation, replacedPrevious } = await submitCheckin(da, actor, parsed.value, new Date());
    return { errors: {}, flags: view(evaluation), asOf: evaluation.localDate, replaced: replacedPrevious };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function reportImpactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor } = await needSession();
  const parsed = parseImpact(fd);
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    const da = await getDataAccess();
    const { evaluation } = await reportImpact(da, actor, actor.id, parsed.value.context, new Date());
    revalidatePath("/impact");
    return { errors: {}, flags: view(evaluation), asOf: evaluation.localDate };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function logSymptomsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor } = await needSession();
  const parsed = parseSymptomLog(fd);
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    const da = await getDataAccess();
    const evaluation = await logFollowUp(da, actor, String(fd.get("impactId") ?? ""), parsed.value, new Date());
    revalidatePath("/impact");
    return { errors: {}, flags: view(evaluation), asOf: evaluation.localDate };
  } catch (e) {
    return toErrorState(e);
  }
}

export async function athleteOutcomeAction(fd: FormData) {
  const { actor } = await needSession();
  const kind = String(fd.get("kind")) as OutcomeKind;
  if (kind !== "did_this" && kind !== "tell_trainer") return;
  const da = await getDataAccess();
  await da.recordOutcome(actor, {
    flagId: String(fd.get("flagId") ?? ""),
    athleteId: actor.id,
    kind,
    adviceFollowed: kind === "did_this" ? true : null,
    laterSymptomOrInjury: null,
    missedTraining: null,
  });
  redirect("/athlete");
}

export async function markCheckedAction(fd: FormData) {
  const { actor } = await needSession();
  await markChecked(await getDataAccess(), actor, String(fd.get("athleteId") ?? ""));
  redirect("/trainer");
}

export async function setAvailabilityAction(fd: FormData) {
  const { actor } = await needSession();
  const status = String(fd.get("status"));
  const athleteId = String(fd.get("athleteId") ?? "");
  if (!(AVAILABILITY_VALUES as readonly string[]).includes(status)) redirect("/trainer");
  const da = await getDataAccess();
  const athlete = await da.getProfile(actor, athleteId);
  if (athlete) {
    await da.setAvailability(actor, athleteId, localDateOf(new Date(), athlete.timezone), status as (typeof AVAILABILITY_VALUES)[number]);
  }
  redirect("/trainer");
}

export async function consentAction(fd: FormData) {
  const { actor } = await needSession();
  const da = await getDataAccess();
  const athleteId = String(fd.get("athleteId") ?? "");
  const at = new Date().toISOString();
  if (fd.get("intent") === "withdraw") await da.withdrawConsent(actor, athleteId, at);
  else await da.grantConsent(actor, athleteId, at);
  redirect("/parent");
}

export async function decideAlertAction(fd: FormData) {
  const { actor } = await needSession();
  const decision = String(fd.get("decision"));
  if (decision !== "approved" && decision !== "dismissed") redirect("/trainer");
  await (await getDataAccess()).decideAlert(actor, String(fd.get("alertId") ?? ""), decision as "approved" | "dismissed", new Date().toISOString());
  redirect("/trainer");
}

/** Demo button: "Simulate impact" (same path as the mouthguard webhook, without the secret). */
export async function simulateImpactAction(fd: FormData) {
  const { actor } = await needSession();
  const da = await getDataAccess();
  const athleteId = actor.role === "athlete" ? actor.id : String(fd.get("athleteId") ?? "");
  if (actor.role !== "athlete" && !(await da.listTeamAthletes(actor)).some((a) => a.id === athleteId)) redirect("/trainer");
  await startImpact(da, { athleteId, eventId: `demo-${crypto.randomUUID()}`, occurredAt: new Date().toISOString(), source: "demo", context: "Simulated mouthguard impact (demo)" }, new Date());
  redirect(actor.role === "athlete" ? "/impact" : "/trainer");
}

/** Demo: "simulate day N answers" through the same code path the voice agent's tools use. */
export async function simulateHitwatchAction(fd: FormData) {
  const { actor } = await needSession();
  const da = await getDataAccess();
  const athleteId = actor.role === "athlete" ? actor.id : String(fd.get("athleteId") ?? "");
  if (actor.role !== "athlete" && !(await da.listTeamAthletes(actor)).some((a) => a.id === athleteId)) redirect("/trainer");
  const scenario = String(fd.get("scenario")) as Scenario;
  if (!["typical", "danger", "missed"].includes(scenario)) redirect(actor.role === "athlete" ? "/impact" : "/trainer");
  try {
    await runScriptedHitwatch(da, athleteId, Number(fd.get("day")), scenario, new Date());
  } catch (e) {
    if (!isNamed(e, "HitwatchError", "ConsentRequiredError")) throw e;
  }
  redirect(actor.role === "athlete" ? "/impact" : "/trainer");
}
