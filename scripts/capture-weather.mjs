// Capture-only weather snapshot: ESPN only exposes `event.weather` while a game is
// still upcoming (pre-kickoff) - it's gone from both the scoreboard and the summary
// endpoint once a game goes live or final. Run this against the live week before
// kickoff; it cannot backfill weather onto a week that's already in progress or over.
import { readFile, writeFile } from "node:fs/promises";
import { findLegGame, clearCache } from "../js/espn.js";
import { gameState } from "../js/grade.js";
import { extractWeather } from "../js/match.js";

const dataUrl = new URL("../data/parlays.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl));

const weekArg = process.argv.find((a) => a.startsWith("--week="))?.split("=")[1];
const week = weekArg
  ? data.weeks.find((w) => w.id === weekArg)
  : [...data.weeks].sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)))[0];

if (!week) {
  console.error(weekArg ? `No week with id "${weekArg}"` : "No weeks in data/parlays.json");
  process.exit(1);
}

console.log(`Capturing weather for ${week.label} (${week.id}, weekOf ${week.weekOf})`);

let captured = 0, skippedHas = 0, skippedStarted = 0, skippedNone = 0, skippedNoGame = 0;
for (const leg of week.legs ?? []) {
  const label = `${leg.team ?? "?"}${leg.opponent ? ` vs ${leg.opponent}` : ""} (${leg.date})`;
  if (leg.weather) {
    console.log(`  skip  ${label} - already has weather`);
    skippedHas++;
    continue;
  }
  const { game } = await findLegGame(leg);
  if (!game) {
    console.log(`  skip  ${label} - game not found on ESPN`);
    skippedNoGame++;
    continue;
  }
  if (gameState(game.event) !== "scheduled") {
    console.log(`  skip  ${label} - game already started, weather is gone from the API`);
    skippedStarted++;
    continue;
  }
  const weather = extractWeather(game.event);
  if (!weather) {
    console.log(`  skip  ${label} - no weather data on this event (likely a dome or not yet published)`);
    skippedNone++;
    continue;
  }
  leg.weather = weather;
  console.log(`  OK    ${label} - ${weather.displayValue ?? ""}${weather.temperature != null ? `, ${weather.temperature}°F` : ""}`);
  captured++;
}

clearCache();
await writeFile(dataUrl, `${JSON.stringify(data, null, 2)}\n`);

console.log(`\nCaptured ${captured} · already had weather ${skippedHas} · already started ${skippedStarted} · no weather data ${skippedNone} · game not found ${skippedNoGame}`);
