import { ok } from "@/lib/http.ts";
import { generateStructured, loadPrompt, live } from "@/lib/gemini.ts";
import { listAthletes } from "@/lib/store.ts";
import { sanitizeDeep } from "@/shared/lib/index.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Briefing {
  headline: string;
  athletes: { athlete_id: string; one_liner: string; suggested_action: string; source_url?: string }[];
}

const schema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    athletes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          athlete_id: { type: "string" },
          one_liner: { type: "string" },
          suggested_action: { type: "string" },
          source_url: { type: "string" },
        },
        required: ["athlete_id", "one_liner", "suggested_action"],
      },
    },
  },
  required: ["headline", "athletes"],
};

function fallback(): Briefing {
  const flagged = listAthletes().filter((a) => a.risk_today.band !== "low");
  const high = flagged.filter((a) => a.risk_today.band === "high").length;
  return {
    headline: `${flagged.length} athletes to look at today${high ? `, ${high} high priority` : ""}.`,
    athletes: flagged.map((a) => {
      const top = a.risk_today.flags[0];
      const action =
        top?.rule_id === "R8_red_flag"
          ? "Contact a parent now and make sure the athlete gets medical care today."
          : top?.rule_id === "R6_landing"
            ? "Add the FixPlan warm-up and re-film a landing next week."
            : top?.rule_id === "R4_severe_soreness"
              ? "Hold out of jumping drills today and check in with a parent or clinician."
              : "Lighter session today and an early night.";
      return { athlete_id: a.id, one_liner: `${a.name.split(" ")[0]}: ${top?.reason ?? ""}`, suggested_action: action };
    }),
  };
}

export async function GET() {
  const flagged = listAthletes().filter((a) => a.risk_today.band !== "low");
  if (!live.gemini() || flagged.length === 0) return ok({ mode: "rules", briefing: fallback() });
  try {
    const input = flagged.map((a) => ({ athlete_id: a.id, name: a.name, band: a.risk_today.band, reasons: a.risk_today.flags.map((f) => f.reason), rule_ids: a.risk_today.flags.map((f) => f.rule_id) }));
    const b = await generateStructured<Briefing>({ parts: [{ text: `${loadPrompt("coach_briefing")}\n\nToday's flags:\n${JSON.stringify(input)}` }], schema });
    return ok({ mode: "gemini", briefing: sanitizeDeep(b) });
  } catch (e) {
    console.error("[briefing] gemini failed", e);
    return ok({ mode: "rules", briefing: fallback() });
  }
}
