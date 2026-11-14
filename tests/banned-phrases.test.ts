// Product rule 1: the product never tells an athlete they are cleared, fine, safe to play or healthy, and never
// presents itself as diagnosing. This scans every user-facing string literal and JSX text in src/app, src/components
// and src/lib, and fails on a banned phrase unless the whole string is an explicitly allowlisted disclaimer.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { DISCLAIMER, DISCLAIMER_LONG } from "@/lib/copy";
import { WORDING_RULES_PROMPT } from "@/lib/panel/prompts";
import { ALLOWLIST, BANNED, findBanned } from "@/lib/wording";

/** Narrow, explicit allowlist: the long disclaimer, and the single prompt constant that has to name the banned words to forbid them. */
const ALLOW = new Set<string>([...ALLOWLIST, WORDING_RULES_PROMPT]);
const scan = (text: string) => findBanned(text, ALLOW);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

function strings(file: string): { text: string; line: number }[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { text: string; line: number }[] = [];
  const add = (n: ts.Node, text: string) => {
    if (text.trim()) found.push({ text, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
  };
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n, n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) add(n, n.text);
    else if (ts.isJsxText(n)) add(n, n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const ROOT = path.resolve(__dirname, "../src");
const FILES = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)));

describe("banned-phrase scan (rule 1)", () => {
  it("scans a meaningful amount of copy", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES.flatMap(strings).length).toBeGreaterThan(300);
  });

  it("no user-facing string says cleared / safe / fine / healthy / diagnose", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      for (const s of strings(f)) {
        const bad = scan(s.text);
        if (bad.length) hits.push(`${path.relative(ROOT, f)}:${s.line} [${bad.join(", ")}] ${JSON.stringify(s.text.slice(0, 80))}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("the scanner itself catches the phrases it is meant to catch", () => {
    for (const bad of [
      "You are cleared to play",
      "You're fine",
      "Safe to play",
      "You look healthy",
      "We diagnose concussions",
      "Diagnosis: sprain",
      "All good today",
      "Good to go",
      "Fully recovered",
      "You are safe",
    ]) {
      expect(scan(bad), bad).not.toEqual([]);
    }
    for (const ok of ["Lower risk right now", DISCLAIMER, "Urgent: see a clinician now", "Tell my trainer"]) {
      expect(scan(ok), ok).toEqual([]);
    }
  });

  it("the long disclaimer is only allowed because it is explicitly allowlisted (and only in exact form)", () => {
    expect([...ALLOWLIST]).toEqual([DISCLAIMER_LONG]);
    expect([...ALLOW]).toEqual([DISCLAIMER_LONG, WORDING_RULES_PROMPT]);
    expect(BANNED.some((b) => b.re.test(DISCLAIMER_LONG))).toBe(true);
    expect(BANNED.some((b) => b.re.test(WORDING_RULES_PROMPT))).toBe(true);
    expect(scan(DISCLAIMER_LONG)).toEqual([]);
    expect(scan(`${DISCLAIMER_LONG} You are cleared.`)).not.toEqual([]);
    expect(scan(`${WORDING_RULES_PROMPT} You are cleared.`)).not.toEqual([]);
  });

  it("catches exactly the four phrases the team README bans: cleared, you're fine, diagnosis, safe to play", () => {
    for (const phrase of ["cleared", "You're fine", "You\u2019re fine", "diagnosis", "Safe to play", "safe to play today"]) {
      expect(scan(phrase), phrase).not.toEqual([]);
    }
  });

  it("the lowest level is worded 'lower risk right now'", async () => {
    const { LEVEL_LABEL } = await import("@/lib/copy");
    expect(LEVEL_LABEL.low).toBe("Lower risk right now");
  });
});
