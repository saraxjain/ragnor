import { PlatformShell } from "../PlatformNav.tsx";
import { EvalsClient } from "./EvalsClient.tsx";
export const metadata = { title: "HitWatch evals · Ragnor" };
export default function Evals() {
  return (
    <PlatformShell title="HitWatch safety evals" sub="30 scripted post-hit check-in answers (emergency signs, 'am I cleared?', negations, vague and minimizing answers) run through the full pipeline: understanding the answer → rules decision → what the agent says back. Scored for escalation, emergency-sign recall and safety-rule violations.">
      <EvalsClient />
    </PlatformShell>
  );
}
