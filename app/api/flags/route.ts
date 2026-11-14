import { ok, fail, readJson } from "@/lib/http.ts";
import { audit, draftAlert, getAthlete } from "@/lib/store.ts";
import { flagCopy } from "@/lib/flagCopy.ts";

export const dynamic = "force-dynamic";

/** Athlete actions on a flag: "got_it" (acknowledge) or "tell_trainer" (queue a routine note for staff). */
export async function POST(req: Request) {
  const { athlete_id, rule_id, area, action } = await readJson<{ athlete_id: string; rule_id: string; area?: string; action: "got_it" | "tell_trainer" }>(req);
  const a = getAthlete(athlete_id);
  if (!a) return fail("Athlete not found", 404);
  const flag = a.risk_today.flags.find((f) => f.rule_id === rule_id && (area ? f.area === area : true));
  if (!flag) return fail("That flag isn't active anymore.", 404);
  const copy = flagCopy(flag);
  if (action === "got_it") {
    audit("athlete", "flag_acknowledged", `${copy.title}: "${copy.athleteAction}"`, athlete_id);
    return ok({ done: true, message: "Logged. Nice work looking after yourself." });
  }
  const alert = draftAlert({
    athlete_id,
    urgency: flag.band === "high" ? "same_day" : "routine",
    summary: `${a.name.split(" ")[0]} asked for a check-in about: ${copy.title.toLowerCase()}. ${flag.reason}.`,
    recipients_suggested: ["coach", "athletic_trainer"],
    reasons: [flag.reason],
  });
  audit("athlete", "asked_trainer", copy.title, athlete_id);
  return ok({ done: true, alert_id: alert.id, message: "Sent to your coach's queue. They'll follow up." });
}
