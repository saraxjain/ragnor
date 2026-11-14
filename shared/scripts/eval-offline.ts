import { runEvals } from "../../lib/evals.ts";
const r = await runEvals("offline");
console.log(r.metrics, r.by_category);
for (const x of r.results.filter((x) => !x.pass)) console.log(x.id, x.athlete, JSON.stringify(x.got.symptoms), x.got.red_flags, x.got.urgency, x.got.violations);
