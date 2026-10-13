import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decimalOdds, shadowQuote, shadowSeason } from "../js/shadow.js";

const book = JSON.parse(readFileSync(new URL("../data/shadow-book.json", import.meta.url)));

test("first shadow slate is priced, distinct, and mixes both leagues", () => {
  const week = book.weeks[0];
  assert.equal(week.legs.length, 11);
  assert.equal(new Set(week.legs.map((l) => l.eventId)).size, 11);
  assert.equal(new Set(week.legs.map((l) => l.league)).size, 2);
  const quote = shadowQuote(week);
  assert.ok(quote.multiplier > 700 && quote.multiplier < 1300);
  assert.ok(Math.abs(quote.return - 6749.69) < 0.01);
  for (const leg of week.legs) {
    assert.ok(Number.isInteger(leg.odds) && leg.odds !== 0);
    assert.ok(leg.type === "moneyline" || Number.isFinite(leg.line));
    assert.match(leg.eventId, /^\d+$/);
    assert.match(leg.date, /^2026-10-1[78]$/);
  }
});

test("shadow returns drop pushed legs and never credit a busted parlay", () => {
  const week = { stake: 7, legs: [{ odds: -110 }, { odds: 150 }] };
  assert.equal(decimalOdds(-110), 1 + 100 / 110);
  assert.equal(decimalOdds(150), 2.5);
  assert.equal(shadowQuote(week, ["hit", "push"]).return, 7 * (1 + 100 / 110));
  const earned = shadowSeason([
    { week, status: "WON", legs: [{ grade: { result: "hit" } }, { grade: { result: "push" } }] },
    { week, status: "BUSTED", legs: [] },
    { week, status: "ALIVE", legs: [] },
  ]);
  assert.equal(earned.staked, 14);
  assert.equal(earned.returned, 7 * (1 + 100 / 110));
});
