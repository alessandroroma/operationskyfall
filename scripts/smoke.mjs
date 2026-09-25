// Real-network check: resolves every leg in data/parlays.json against ESPN.
import { readFile } from "node:fs/promises";
import { findLegGame } from "../js/espn.js";
import { gradeLeg, parlayStatus, describeLeg } from "../js/grade.js";

const data = JSON.parse(await readFile(new URL("../data/parlays.json", import.meta.url)));
let missing = 0;
for (const week of data.weeks) {
  const results = [];
  console.log(`\n${week.label}`);
  for (const leg of week.legs) {
    const { game, error } = await findLegGame(leg);
    const g = gradeLeg(leg, game);
    results.push(g.result);
    if (!game) missing++;
    console.log(`  ${describeLeg(leg).padEnd(34)} ${game ? game.event.shortName.padEnd(12) + game.event.status.type.name : "NOT FOUND" + (error ? ` (${error.message})` : "")} -> ${g.result}`);
  }
  console.log(`  status: ${parlayStatus(results).status}`);
}
if (missing) { console.error(`\n${missing} leg(s) unresolved`); process.exit(1); }
console.log("\nall legs resolved");
