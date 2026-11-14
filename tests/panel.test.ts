import { describe, expect, it } from "vitest";
import { buildCaseBrief, relativizeDates } from "@/lib/panel/brief";
import { applyGuardrail } from "@/lib/panel/guardrail";
import { createGeminiClient, DEFAULT_GEMINI_MODEL, geminiModelName, toGeminiSchema } from "@/lib/panel/gemini-client";
import { moderatorSchema } from "@/lib/panel/types";
import {
  CONCLUSION_FRAMING,
  TurnFailedError,
  WITHHELD_MARKER,
  checkWording,
  runLivePanel,
  runPanelSession,
  runScriptedPanel,
} from "@/lib/panel/orchestrator";
import { SYSTEM_PROMPTS } from "@/lib/panel/prompts";
import { SCRIPTED_LABEL, type ModelClient, type PanelEvent } from "@/lib/panel/types";
import { buildExplanation, firesWhen } from "@/lib/panel/explain";
import { THRESHOLDS } from "@/lib/rules/thresholds";
import { RULES } from "@/lib/rules/rules";
import { DEMO_IDS, createDemoStore } from "@/lib/data/seed";
import { findBanned } from "@/lib/wording";
import { LEVELS, type Actor, type Level, type Profile } from "@/lib/types";

const NOW = new Date("2026-11-14T18:00:00.000Z");
const trainer: Actor = { id: DEMO_IDS.trainer, role: "trainer" };

async function briefFor(athleteId: string) {
  const da = await createDemoStore(NOW);
  const p = (await da.listDemoProfiles()).find((x) => x.id === athleteId)!;
  const [checkins, impacts, logs] = await Promise.all([da.listCheckins(trainer, athleteId, "2026-10-01", "2026-11-14"), da.listImpacts(trainer, athleteId), da.listSymptomLogs(trainer, athleteId)]);
  return buildCaseBrief({ profile: p, checkins, impacts, logs, now: NOW });
}

// ---------- fake model client ----------
const opening = (view = "normal") => JSON.stringify({ confidence_view: view, reviewer_focus: "Ask about sleep first.", argument: "Load rose and sleep was short on several nights.", data_points: ["load +31%"] });
const rebuttal = (view = "normal") => JSON.stringify({ concedes: "The symptom data matters.", still_disputes: "The sleep window is short.", updated_confidence_view: view, updated_reviewer_focus: "Ask about sleep first.", data_points: ["4 of 7 nights"] });
const moderator = (stated: string | null = null, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ explanation: "Sleep was short while load rose.", reviewer_focus: "Ask about sleep first.", confidence: "normal", missing: [], action: "Plan a lighter session today.", agreements: ["Both numbers moved."], disputes: [], stated_level: stated ?? "none", ...extra });

function fake(handler: (call: { n: number; system: string; user: string }) => string | Promise<string>) {
  const calls: { system: string; user: string; at: number }[] = [];
  const client: ModelClient = {
    model: "fake-model",
    async complete({ system, user }) {
      calls.push({ system, user, at: calls.length });
      return handler({ n: calls.length, system, user });
    },
  };
  return { client, calls };
}
const byRole = (system: string) => (Object.entries(SYSTEM_PROMPTS).find(([, v]) => v === system)?.[0] ?? "?") as string;
const collect = () => {
  const events: PanelEvent[] = [];
  return { events, emit: (e: PanelEvent) => void events.push(e) };
};

// ---------- case brief ----------
describe("case brief is de-identified", () => {
  it("never contains names, initials, ids, dates of birth, notes, school, team, time zone or calendar dates", async () => {
    const profile: Profile = { id: "id-SECRET-123", role: "athlete", displayLabel: "Q.Z.", dateOfBirth: "2010-04-09", timezone: "America/Los_Angeles", schoolId: "school-SECRET" };
    const checkins = Array.from({ length: 14 }, (_, i) => ({
      id: `chk-SECRET-${i}`,
      athleteId: profile.id,
      localDate: `2026-11-${String(14 - i).padStart(2, "0")}`,
      sleepHours: 5.5,
      workloadMinutes: 60,
      workloadIntensity: 6,
      soreness: { knee: 2 as const },
      symptoms: i === 0 ? ["headache"] : [],
      note: "NOTE-SECRET my coach Dana said...",
      submittedAt: "2026-11-14T10:00:00.000Z",
    }));
    const impacts = [{ id: "imp-SECRET", athleteId: profile.id, occurredAt: "2026-11-13T18:00:00.000Z", context: "CONTEXT-SECRET at Alma Field", reportedBy: "rep-SECRET" }];
    const logs = [{ id: "l1", impactEventId: "imp-SECRET", athleteId: profile.id, day: 2, symptoms: ["dizziness"], severity: 2, loggedAt: "2026-11-14T10:00:00.000Z" }];
    const { brief } = buildCaseBrief({ profile, checkins, impacts, logs, now: NOW });
    const json = JSON.stringify(brief);
    for (const secret of ["SECRET", "Q.Z.", "Dana", "Alma", "2010", "04-09", "America/Los_Angeles", "timezone", "dateOfBirth", "displayLabel", "school", "team", "reportedBy", "athleteId", "note"]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no calendar dates at all
    expect(brief.athlete).toBe("athlete under 18");
    expect(json).toContain("dizziness"); // symptom labels and numbers are what is sent
    expect(brief.weekly.nightsUnderSleepThreshold).toBe(7);
  });

  it("rule text has dates converted to relative days", () => {
    expect(relativizeDates("Reported on 2026-11-12 and 2026-11-14", "2026-11-14")).toBe("Reported 2 days ago and today");
  });

  it.each(Object.entries(DEMO_IDS).filter(([k]) => ["jm", "ak", "rt", "dw", "sl", "mp"].includes(k)))("demo athlete %s: brief has no dates or ids", async (_k, id) => {
    const { brief } = await briefFor(id);
    const json = JSON.stringify(brief);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).not.toContain(id);
    expect(json).not.toMatch(/[A-Z]\.[A-Z]\./);
  });
});

// ---------- guardrail ----------
describe("guardrail: a rules engine decides the risk level; the model only extracts and explains", () => {
  it("the final level is ALWAYS the rules level, whatever level the model states", () => {
    for (const rules of LEVELS) {
      for (const stated of [...LEVELS, null, "bogus"]) {
        for (const c of ["normal", "low"] as const) {
          const g = applyGuardrail({ rulesLevel: rules, statedLevel: stated, moderatorConfidence: c });
          expect(g.finalLevel, `${rules}/${String(stated)}`).toBe(rules);
        }
      }
    }
  });

  it("records any different level the model states as an override attempt; null or equal is not", () => {
    const up = applyGuardrail({ rulesLevel: "low", statedLevel: "high", moderatorConfidence: "normal" });
    expect(up).toMatchObject({ finalLevel: "low", statedLevel: "high", overrodeModerator: true });
    expect(up.overrideReasons.join(" ")).toMatch(/only from the rules engine/);
    const down = applyGuardrail({ rulesLevel: "urgent", statedLevel: "low", moderatorConfidence: "low" });
    expect(down).toMatchObject({ finalLevel: "urgent", overrodeModerator: true, confidence: "low" });
    expect(applyGuardrail({ rulesLevel: "moderate", statedLevel: "moderate", moderatorConfidence: "normal" }).overrodeModerator).toBe(false);
    expect(applyGuardrail({ rulesLevel: "moderate", statedLevel: null, moderatorConfidence: "normal" }).overrodeModerator).toBe(false);
    expect(applyGuardrail({ rulesLevel: "moderate", statedLevel: "bogus", moderatorConfidence: "normal" }).overrideReasons.join(" ")).toMatch(/unrecognised/);
  });

  it("confidence can only be lowered, never raised, by the panel", () => {
    expect(applyGuardrail({ rulesLevel: "low", statedLevel: null, moderatorConfidence: "normal", rulesLowConfidence: true }).confidence).toBe("low");
    expect(applyGuardrail({ rulesLevel: "low", statedLevel: null, moderatorConfidence: "low" }).confidence).toBe("low");
  });
});

// ---------- wording filter ----------
describe("runtime wording filter", () => {
  it("checkWording uses the same rules as the source scan", () => {
    expect(checkWording(["You are cleared to play"])).not.toEqual([]);
    expect(checkWording(["Lower risk right now"])).toEqual([]);
    expect(findBanned("It is safe to play")).not.toEqual([]);
  });

  it("a debater message that breaks the rules is replaced by the marker and recorded; it is not passed to later rounds", async () => {
    const { client, calls } = fake(({ system, user }) => {
      const role = byRole(system);
      if (role === "moderator") return moderator();
      if (user.startsWith("Round 1")) return role === "sceptic" ? JSON.stringify({ confidence_view: "low", reviewer_focus: "Check it.", argument: "He is healthy and cleared to play.", data_points: [] }) : opening();
      return rebuttal();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runLivePanel({ brief, flags, emit }, client);
    const bad = events.find((e) => e.type === "turn" && e.role === "sceptic" && e.round === 1);
    expect(bad).toMatchObject({ withheld: true, content: { argument: WITHHELD_MARKER, dataPoints: [] } });
    expect(JSON.stringify(events)).not.toMatch(/cleared to play/);
    const round2 = calls.filter((c) => c.user.startsWith("Round 2"));
    expect(round2.length).toBe(3);
    for (const c of round2) expect(c.user).not.toMatch(/cleared to play/);
    const g = events.find((e) => e.type === "guardrail");
    expect(g && g.type === "guardrail" && g.result.withheld).toEqual([{ round: 1, role: "sceptic", matched: expect.any(Array) }]);
  });

  it("a conclusion that breaks the rules is withheld, but the level still goes through the guardrail", async () => {
    const { client } = fake(({ system, user }) => {
      const role = byRole(system);
      if (role === "moderator") return moderator(null, { explanation: "This athlete is healthy." });
      return user.startsWith("Round 1") ? opening() : rebuttal();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runLivePanel({ brief, flags, emit }, client);
    const c = events.find((e) => e.type === "conclusion");
    expect(c).toMatchObject({ withheld: true, content: { explanation: WITHHELD_MARKER, action: WITHHELD_MARKER } });
    const g = events.find((e) => e.type === "guardrail");
    expect(g && g.type === "guardrail" && g.result.withheld[0]).toMatchObject({ round: "conclusion", role: "moderator" });
  });
});

// ---------- orchestration ----------
describe("orchestration with a fake client", () => {
  const happy = ({ system, user }: { system: string; user: string }) => {
    const role = byRole(system);
    if (role === "moderator") return moderator();
    return user.startsWith("Round 1") ? opening() : rebuttal();
  };

  it("emits mode, brief, rules, 3 openings, 3 rebuttals, conclusion, guardrail, done in order", async () => {
    const { client } = fake(happy);
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runPanelSession({ brief, flags, client, emit });
    expect(events.map((e) => (e.type === "turn" ? `turn${e.round}` : e.type))).toEqual([
      "mode", "brief", "rules", "turn1", "turn1", "turn1", "turn2", "turn2", "turn2", "conclusion", "guardrail", "done",
    ]);
    expect(events[0]).toMatchObject({ type: "mode", mode: "live", model: "fake-model" });
    expect(events.filter((e) => e.type === "turn").every((e) => e.type === "turn" && e.source === "live")).toBe(true);
    const last = events.find((e) => e.type === "guardrail");
    expect(last && last.type === "guardrail" && last.result.finalLevel).toBe("moderate"); // the rules level
  });

  it("round 1 runs in parallel (all three calls start before any finishes) and round 2 only after round 1", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const order: string[] = [];
    const { client } = fake(async ({ system, user }) => {
      const role = byRole(system);
      const round = user.startsWith("Round 1") ? 1 : user.startsWith("Round 2") ? 2 : 3;
      order.push(`start r${round}`);
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      order.push(`end r${round}`);
      return role === "moderator" ? moderator() : round === 1 ? opening() : rebuttal();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runLivePanel({ brief, flags, emit }, client);
    expect(maxInflight).toBe(3);
    expect(order.slice(0, 3)).toEqual(["start r1", "start r1", "start r1"]);
    const firstR2 = order.indexOf("start r2");
    expect(order.slice(0, firstR2).filter((x) => x === "end r1")).toHaveLength(3);
    expect(order[order.length - 2]).toBe("start r3");
    expect(events.filter((e) => e.type === "turn")).toHaveLength(6);
  });

  it("round 2 prompts contain the other two openings and the moderator sees both rounds", async () => {
    const { client, calls } = fake(happy);
    const { emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runLivePanel({ brief, flags, emit }, client);
    const r2 = calls.find((c) => c.user.startsWith("Round 2") && byRole(c.system) === "load_analyst")!;
    expect(r2.user).toContain("Symptom and impact watcher");
    expect(r2.user).toContain("Sceptic");
    const mod = calls[calls.length - 1];
    expect(byRole(mod.system)).toBe("moderator");
    expect(mod.user).toContain("Round 1");
    expect(mod.user).toContain("Round 2");
    expect(mod.user).toMatch(/rules engine level is moderate and it is final/);
    expect(calls).toHaveLength(7);
  });

  it("everything sent to the model is the brief only (no ids, names, dates)", async () => {
    const { client, calls } = fake(happy);
    const { emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.dw);
    await runLivePanel({ brief, flags, emit }, client);
    for (const c of calls) {
      expect(c.user + c.system).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(c.user + c.system).not.toContain(DEMO_IDS.dw);
      expect(c.user + c.system).not.toContain("D.W.");
    }
  });

  it("retries a bad turn once: invalid JSON then valid succeeds", async () => {
    let first = true;
    const { client, calls } = fake(({ system, user }) => {
      const role = byRole(system);
      if (role === "load_analyst" && user.startsWith("Round 1") && first) {
        first = false;
        return "not json at all";
      }
      return role === "moderator" ? moderator() : user.startsWith("Round 1") ? opening() : rebuttal();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runPanelSession({ brief, flags, client, emit });
    expect(calls.length).toBe(8); // 7 + one retry
    expect(events.find((e) => e.type === "mode")).toMatchObject({ mode: "live" });
    expect(events.filter((e) => e.type === "mode")).toHaveLength(1);
  });

  it("a schema-invalid turn is retried once, then falls back to the scripted example", async () => {
    const { client, calls } = fake(({ system, user }) => {
      const role = byRole(system);
      if (role === "moderator") return moderator("nonsense-level");
      return user.startsWith("Round 1") ? opening() : rebuttal();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runPanelSession({ brief, flags, client, emit });
    expect(calls.filter((c) => byRole(c.system) === "moderator")).toHaveLength(2); // original + one retry only
    const modes = events.filter((e) => e.type === "mode");
    expect(modes).toHaveLength(2);
    expect(modes[1]).toMatchObject({ mode: "scripted", label: SCRIPTED_LABEL });
    expect(events[events.length - 1]).toEqual({ type: "done" });
    expect(events.filter((e) => e.type === "turn" && e.source === "scripted")).toHaveLength(6);
  });

  it("an API error (thrown) falls back to scripted and never exposes secrets in the reason", async () => {
    const { client } = fake(() => {
      throw new Error("Gemini API error 500");
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runPanelSession({ brief, flags, client, emit });
    expect(events.filter((e) => e.type === "mode")[1]).toMatchObject({ mode: "scripted" });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("an abort stops the run quietly with no further events", async () => {
    const ctl = new AbortController();
    const { client } = fake(async () => {
      ctl.abort();
      return opening();
    });
    const { events, emit } = collect();
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await runPanelSession({ brief, flags, client, emit, signal: ctl.signal });
    expect(events.some((e) => e.type === "done" || e.type === "error")).toBe(false);
  });

  it("runLivePanel surfaces TurnFailedError when a turn cannot be completed", async () => {
    const { client } = fake(() => "{}");
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    await expect(runLivePanel({ brief, flags, emit: () => {} }, client)).rejects.toBeInstanceOf(TurnFailedError);
  });

  it("live: whatever level the model states, the final level is the rules level (red-flag athlete stays urgent; ordinary athlete stays moderate)", async () => {
    for (const [id, rules] of [[DEMO_IDS.mp, "urgent"], [DEMO_IDS.jm, "moderate"]] as const) {
      for (const stated of ["low", "high", "urgent", null]) {
        const { client } = fake(({ system, user }) => (byRole(system) === "moderator" ? moderator(stated) : user.startsWith("Round 1") ? opening() : rebuttal()));
        const { events, emit } = collect();
        const { brief, flags } = await briefFor(id);
        await runPanelSession({ brief, flags, client, emit });
        const g = events.find((e) => e.type === "guardrail");
        if (g?.type !== "guardrail") throw new Error("no guardrail");
        expect(g.result.finalLevel).toBe(rules);
        expect(g.result.overrodeModerator).toBe(stated !== null && stated !== rules);
        const c = events.find((e) => e.type === "conclusion");
        expect(c && c.type === "conclusion" && c.framing).toBe(CONCLUSION_FRAMING);
      }
    }
  });
});

// ---------- scripted mode ----------
describe("scripted mode", () => {
  const athletes = ["jm", "ak", "rt", "dw", "sl", "mp"] as const;

  async function scriptedEvents(id: string) {
    const { brief, flags } = await briefFor(id);
    const { events, emit } = collect();
    await runPanelSession({ brief, flags, client: null, emit });
    return events;
  }

  it.each(athletes)("%s: deterministic, labelled, passes the wording check, ends with the right final level", async (k) => {
    const id = DEMO_IDS[k];
    const a = await scriptedEvents(id);
    const b = await scriptedEvents(id);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0]).toMatchObject({ type: "mode", mode: "scripted", label: "Scripted example: no AI model was used" });
    expect(a.map((e) => e.type)).toEqual(["mode", "brief", "rules", ...Array(6).fill("turn"), "conclusion", "guardrail", "done"]);
    for (const e of a) {
      if (e.type === "turn" || e.type === "conclusion") {
        expect(e.source).toBe("scripted");
        expect(e.withheld).toBe(false);
      }
    }
    const text = JSON.stringify(a.filter((e) => e.type === "turn" || e.type === "conclusion"));
    expect(checkWording([text])).toEqual([]);
    for (const e of a) {
      if (e.type === "turn") expect(checkWording([e.content.argument, ...e.content.dataPoints])).toEqual([]);
    }
    const g = a.find((e) => e.type === "guardrail");
    const rules = a.find((e) => e.type === "rules");
    if (g?.type !== "guardrail" || rules?.type !== "rules") throw new Error("missing events");
    expect(LEVELS.indexOf(g.result.finalLevel)).toBeGreaterThanOrEqual(LEVELS.indexOf(rules.level as Level));
  });

  it("cites the real numbers", async () => {
    const jm = JSON.stringify(await scriptedEvents(DEMO_IDS.jm));
    expect(jm).toMatch(/Sleep was under 6 hours on 4 of 7 reported nights/);
    expect(jm).toMatch(/Average daily load was 600 this week against 225 the week before \(\+167%\)/);
  });

  it("red-flag athlete (M.P.) ends urgent; no-flag athlete (S.L.) ends lower risk; D.W. ends high", async () => {
    const level = async (id: string) => {
      const g = (await scriptedEvents(id)).find((e) => e.type === "guardrail");
      return g && g.type === "guardrail" ? g.result : null;
    };
    expect(await level(DEMO_IDS.mp)).toMatchObject({ rulesLevel: "urgent", finalLevel: "urgent", statedLevel: null, overrodeModerator: false });
    expect(await level(DEMO_IDS.sl)).toMatchObject({ rulesLevel: "low", finalLevel: "low", overrodeModerator: false });
    expect(await level(DEMO_IDS.dw)).toMatchObject({ finalLevel: "high" });
  });

  it("scripted agents never state a level, and argue about explanation, focus, confidence and what is missing", async () => {
    const { brief, flags } = await briefFor(DEMO_IDS.jm);
    const { events, emit } = collect();
    runScriptedPanel({ brief, flags, emit });
    for (const e of events) {
      if (e.type === "turn") {
        expect(Object.keys(e.content)).not.toContain("stance");
        expect(["normal", "low"]).toContain(e.content.confidenceView);
        expect(e.content.reviewerFocus.length).toBeGreaterThan(5);
      }
      if (e.type === "conclusion") expect(e.content.statedLevel).toBeNull();
    }
  });

  it("without a client it explains why", async () => {
    const { brief, flags } = await briefFor(DEMO_IDS.sl);
    const { events, emit } = collect();
    await runPanelSession({ brief, flags, client: null, noClientReason: "No key.", emit });
    expect(events[0]).toMatchObject({ reason: "No key." });
  });
});

// ---------- client factory (never calls the network) ----------
describe("model client factory", () => {
  it("returns null without a key, and the model is configurable with the documented default", () => {
    expect(createGeminiClient({})).toBeNull();
    expect(createGeminiClient({ GEMINI_API_KEY: "   " })).toBeNull();
    expect(geminiModelName({})).toBe(DEFAULT_GEMINI_MODEL);
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-4-hydrogen");
    expect(geminiModelName({ GEMINI_MODEL: "some-other-model" })).toBe("some-other-model");
  });

  it("the structured-output schema is plain JSON Schema (no $schema, no unsupported length keywords, no nullable unions)", () => {
    const js = JSON.stringify(toGeminiSchema(moderatorSchema));
    expect(js).not.toContain("$schema");
    expect(js).not.toContain("minLength");
    expect(js).not.toContain("anyOf");
    expect(js).toContain("stated_level");
  });
});

// ---------- judges explanation derived from THRESHOLDS ----------
describe("judges explanation is derived from the code", () => {
  it("contains every threshold value, every rule and both red-flag source labels", () => {
    const x = buildExplanation();
    expect(x.rules.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    expect(x.thresholds.map((t) => t.key).sort()).toEqual(Object.keys(THRESHOLDS).sort());
    for (const t of x.thresholds) expect(t.value).toBe((THRESHOLDS as Record<string, number>)[t.key]);
    expect(x.redFlags[0].url).toBe("https://www.cdc.gov/heads-up/signs-symptoms/index.html");
    expect(x.redFlags[0].items).toHaveLength(8);
    expect(x.redFlags[1].validated).toBe(false);
    expect(x.statement).toMatch(/unvalidated placeholder/);
    expect(x.statement).toMatch(/pending clinician review/);
  });

  it("changing a threshold changes the text", () => {
    const changed = { ...THRESHOLDS, SHORT_SLEEP_HOURS: 5, LOAD_INCREASE_PERCENT: 40, SORENESS_PERSISTING_DAYS: 4 } as unknown as typeof THRESHOLDS;
    const a = firesWhen(THRESHOLDS);
    const b = firesWhen(changed);
    expect(a["sleep-load"]).toContain("under 6 hours");
    expect(b["sleep-load"]).toContain("under 5 hours");
    expect(b["sleep-load"]).toContain("40%");
    expect(b["soreness-persisting"]).toContain("4 consecutive days");
    expect(a["sleep-load"]).not.toBe(b["sleep-load"]);
    const rows = buildExplanation(changed).thresholds.find((t) => t.key === "SHORT_SLEEP_HOURS")!;
    expect(rows.value).toBe(5);
    expect(rows.meaning).toContain("under 5 hours");
  });

  it("the real rule descriptions are built from THRESHOLDS", () => {
    const sl = RULES.find((r) => r.id === "sleep-load")!.description;
    expect(sl).toContain(`under ${THRESHOLDS.SHORT_SLEEP_HOURS} h`);
    expect(sl).toContain(`${THRESHOLDS.LOAD_INCREASE_PERCENT}%`);
  });
});

// ---------- prompts ----------
describe("agent prompts", () => {
  it("are four separate prompts and each forbids the banned claims and any level decision", () => {
    const vals = Object.values(SYSTEM_PROMPTS);
    expect(new Set(vals).size).toBe(4);
    for (const v of vals) {
      expect(v).toMatch(/Wording rules/);
      expect(v).toMatch(/A rules engine decides the risk level/);
    }
  });
});
