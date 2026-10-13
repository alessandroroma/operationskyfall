import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decimalOdds, shadowQuote, shadowSeason } from "../js/shadow.js";
import { breakdownRows, personTotals } from "../js/breakdown.js";

const book = JSON.parse(readFileSync(new URL("../data/shadow-book.json", import.meta.url)));

test("first shadow slate is priced, distinct, and mixes both leagues", () => {
  const week = book.weeks.find((w) => w.id === "shadow-2026-10-17");
  assert.ok(week);
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

test("every shadow pick carries a reasoning excerpt", () => {
  for (const week of book.weeks) {
    for (const leg of week.legs) {
      assert.equal(typeof leg.reasoning, "string", `${leg.id} is missing reasoning`);
      assert.ok(leg.reasoning.trim().length >= 40, `${leg.id} reasoning is too short`);
    }
  }
});

test("every shadow pick is attributed to MitsNemo, so it merges into the group's WAR/stats tables", () => {
  for (const week of book.weeks) {
    for (const leg of week.legs) {
      assert.equal(leg.by, "MitsNemo", `${leg.id} is missing a by attribution`);
    }
  }
  const week = book.weeks.find((w) => w.id === "shadow-2026-10-17");
  const rows = breakdownRows([{
    week: { id: week.id, label: week.label, weekOf: week.weekOf },
    legs: week.legs.map((leg) => ({ leg, grade: { result: "hit", margin: 1 } })),
    status: "WON",
    counts: {},
  }]);
  const [mitsnemo] = personTotals(rows);
  assert.equal(mitsnemo.name, "MitsNemo");
  assert.equal(mitsnemo.hit, week.legs.length);
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
