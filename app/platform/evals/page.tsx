import { PlatformShell } from "../PlatformNav.tsx";
import { EvalsClient } from "./EvalsClient.tsx";
export const metadata = { title: "Safety evals · Ragnor" };
export default function Evals() {
  return (
    <PlatformShell title="Check-in safety evals" sub="30 scripted athlete check-ins (severe pain, under-fueling, emergency signs, 'can I play?', negations, vague and minimizing answers) run through the production pipeline: understanding the check-in → versioned rules engine → what Ragnor says back. Scored for triage accuracy, emergency-sign recall and safety-rule violations.">
      <EvalsClient />
    </PlatformShell>
  );
}
