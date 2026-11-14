import { runEvals } from "../../lib/evals.ts";
const r = await runEvals("offline");
console.log(r.metrics, r.by_category);
for (const x of r.results.filter((x) => !x.pass)) console.log("FAIL", x.id, x.text, "expected", x.expected.band, "got", x.got.band, x.got.rules, x.got.red_flags);
