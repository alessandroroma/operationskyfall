// Backfills venue/surface facts (grass vs turf, neutral site, conference game) onto every
// leg across every week. Unlike weather, ESPN retains this data indefinitely - verified
// against games weeks old - so this is a one-time backfill script, not a weekly ritual like
// scripts/capture-weather.mjs. Re-running it only fills in legs that don't have `venue` yet,
// so it's also safe to run after adding a new week.
import { readFile, writeFile } from "node:fs/promises";
import { findLegGame, fetchSummary, clearCache } from "../js/espn.js";
import { extractVenue } from "../js/match.js";

const dataUrl = new URL("../data/parlays.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl));

const weekArg = process.argv.find((a) => a.startsWith("--week="))?.split("=")[1];
const weeks = weekArg ? data.weeks.filter((w) => w.id === weekArg) : data.weeks;
if (weekArg && !weeks.length) {
  console.error(`No week with id "${weekArg}"`);
  process.exit(1);
}

let captured = 0, skippedHas = 0, skippedNone = 0, skippedNoGame = 0;
for (const week of weeks) {
  console.log(`${week.label} (${week.id})`);
  for (const leg of week.legs ?? []) {
    const label = `${leg.team ?? "?"}${leg.opponent ? ` vs ${leg.opponent}` : ""} (${leg.date})`;
    if (leg.venue) {
      skippedHas++;
      continue;
    }
    const { game } = await findLegGame(leg);
    if (!game) {
      console.log(`  skip  ${label} - game not found on ESPN`);
      skippedNoGame++;
      continue;
    }
    const summary = await fetchSummary(leg.league, game.event.id);
    const venue = extractVenue(summary);
    if (!venue) {
      console.log(`  skip  ${label} - no venue data in the summary response`);
      skippedNone++;
      continue;
    }
    leg.venue = venue;
    console.log(`  OK    ${label} - ${venue.name ?? "?"}${venue.grass != null ? `, ${venue.grass ? "grass" : "turf"}` : ""}${venue.neutralSite ? ", neutral site" : ""}`);
    captured++;
  }
}

clearCache();
await writeFile(dataUrl, `${JSON.stringify(data, null, 2)}\n`);

console.log(`\nCaptured ${captured} · already had venue ${skippedHas} · no venue data ${skippedNone} · game not found ${skippedNoGame}`);
