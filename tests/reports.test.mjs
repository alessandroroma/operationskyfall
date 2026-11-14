import { test } from "node:test";
import assert from "node:assert/strict";
import { breakdownRows } from "../js/breakdown.js";
import { conferenceReportRows, teamReportRows } from "../js/reports.js";

const CONFS = { "5": "Big Ten", "8": "SEC" };

const ev = (overrides) => ({
  event: { date: "2026-10-03T16:00Z", status: { type: { state: "post", completed: true } } },
  picked: { score: "24", team: { id: "194", conferenceId: 5 } },
  other: { score: "17" },
  ...overrides,
});

const week = (overrides = {}) => {
  const legs = overrides.legs ?? [];
  const weekMeta = overrides.week ?? {};
  return {
    week: { id: "w", label: "Week 3", weekOf: "2026-10-01", ...weekMeta, legs: weekMeta.legs ?? legs.map((l) => l.leg) },
    legs,
    status: overrides.status ?? "WON",
    counts: overrides.counts ?? {},
  };
};

const leg = (legData, grade, gameOverrides = {}) => ({
  leg: legData,
  game: ev(gameOverrides),
  grade,
  error: null,
});

test("team report merges by resolved ESPN id, tallies record/net units/who picked it", () => {
  const rows = breakdownRows([
    week({
      legs: [
        leg({ by: "Roma", type: "spread", line: -3, odds: -110, team: "Ohio State", date: "2026-10-03", league: "college-football" }, { result: "hit", margin: 4 }),
        leg({ by: "Dalton", type: "spread", line: -7, odds: -110, team: "Ohio State", date: "2026-10-03", league: "college-football" }, { result: "miss", margin: -2 }),
        // A game total shouldn't count as "picking a team".
        leg({ by: "Roma", type: "total_over", line: 50.5, team: "Ohio State", opponent: "Illinois", date: "2026-10-03", league: "college-football" }, { result: "hit", margin: 5 }),
      ],
    }),
  ]);
  const report = teamReportRows(rows);
  assert.equal(report.length, 1); // the total_over leg doesn't create a second "team" row
  const osu = report[0];
  assert.equal(osu.name, "Ohio State");
  assert.equal(osu.hit, 1);
  assert.equal(osu.miss, 1);
  assert.equal(osu.total, 2);
  assert.deepEqual(osu.people, [["Dalton", 1], ["Roma", 1]]);
});

test("team report merges an unresolved team's picks by normalized name, not one row per spelling", () => {
  const unresolvedLeg = (by, team) => ({
    leg: { by, type: "moneyline", team, date: "2026-10-03", league: "college-football" },
    game: null, // ESPN never found it - e.g. an FCS opponent
    grade: { result: "hit", margin: 10 },
    error: null,
  });
  const rows = breakdownRows([week({ legs: [unresolvedLeg("Roma", "Portland State"), unresolvedLeg("Dalton", "Portland State")] })]);
  const report = teamReportRows(rows);
  assert.equal(report.length, 1);
  assert.equal(report[0].total, 2);
});

test("conference report is CFB-only, excludes unresolved games, and counts them separately", () => {
  const rows = breakdownRows([
    week({
      legs: [
        leg({ by: "Roma", type: "spread", line: -3, odds: -110, team: "Ohio State", date: "2026-10-03", league: "college-football" }, { result: "hit", margin: 4 }),
        leg({ by: "Dalton", type: "spread", line: -7, odds: -110, team: "Alabama", date: "2026-10-03", league: "college-football" }, { result: "miss", margin: -2 }, { picked: { score: "17", team: { id: "333", conferenceId: 8 } } }),
        leg({ by: "Paul", type: "moneyline", team: "Detroit Lions", date: "2026-10-03", league: "nfl" }, { result: "hit", margin: 3 }, { picked: { score: "24", team: { id: "8" } } }), // no conferenceId - NFL
      ],
    }),
  ]);
  const { conferences, unresolved } = conferenceReportRows(rows, CONFS);
  assert.equal(unresolved, 0); // the NFL leg is filtered by league before it would count as unresolved
  assert.deepEqual(conferences.map((c) => c.name), ["Big Ten", "SEC"]);
  assert.equal(conferences.find((c) => c.name === "Big Ten").hit, 1);
  assert.equal(conferences.find((c) => c.name === "SEC").miss, 1);
});

test("conference report counts an unresolved CFB game separately instead of dropping it silently", () => {
  const unresolvedLeg = {
    leg: { by: "Roma", type: "moneyline", team: "Portland State", date: "2026-10-03", league: "college-football" },
    game: null,
    grade: { result: "hit", margin: 10 },
    error: null,
  };
  const rows = breakdownRows([week({ legs: [unresolvedLeg] })]);
  const { conferences, unresolved } = conferenceReportRows(rows, CONFS);
  assert.equal(conferences.length, 0);
  assert.equal(unresolved, 1);
});

import { venueReportRows } from "../js/reports.js";
test("venue report splits surface, site, and CFB conference-game, excluding legs with no venue data from each split they lack", () => {
  const withVenue = (by, league, venue, result) => ({
    leg: { by, type: "spread", line: -3, odds: -110, team: "Team A", date: "2026-10-03", league, venue },
    game: ev(),
    grade: { result, margin: result === "hit" ? 1 : -1 },
    error: null,
  });
  const rows = breakdownRows([
    week({
      legs: [
        withVenue("Roma", "college-football", { grass: true, neutralSite: false, conferenceGame: true }, "hit"),
        withVenue("Dalton", "college-football", { grass: false, neutralSite: true, conferenceGame: false }, "miss"),
        withVenue("Paul", "nfl", { grass: true, neutralSite: false }, "hit"), // no conferenceGame key - NFL
        { leg: { by: "Mark", type: "spread", line: -3, team: "Team B", date: "2026-10-03", league: "college-football" }, game: ev(), grade: { result: "hit", margin: 1 }, error: null }, // no venue at all
      ],
    }),
  ]);
  const { surface, site, conferenceGame, missing } = venueReportRows(rows);
  assert.equal(missing, 1);
  assert.deepEqual(surface.map((s) => [s.name, s.hit, s.miss]), [["grass", 2, 0], ["turf", 0, 1]]);
  assert.deepEqual(site.map((s) => [s.name, s.hit, s.miss]), [["Neutral site", 0, 1], ["Home/away", 2, 0]]);
  // conferenceGame is CFB-only: the NFL leg's grass/neutralSite still count above, but it never touches conferenceGame
  assert.deepEqual(conferenceGame.map((s) => [s.name, s.hit, s.miss]), [["Conference game", 1, 0], ["Non-conference", 0, 1]]);
});

import { collisionRows } from "../js/reports.js";
test("collision log pairs a shadow pick with a real leg on the same event, classifying agree/fade/different market", () => {
  const sameEvent = (overrides) => ({ event: { id: "999", date: "2026-10-03T16:00Z", status: { type: { state: "post", completed: true } } }, picked: { score: "24", team: { id: "194" } }, other: { score: "17" }, ...overrides });
  const realSpreadOSU = { leg: { by: "Roma", type: "spread", line: -3, team: "Ohio State", date: "2026-10-03", league: "college-football" }, game: sameEvent(), grade: { result: "hit", margin: 1 }, error: null };
  const shadowSpreadOSU = { leg: { by: "MitsNemo", type: "spread", line: -3, team: "Ohio State", date: "2026-10-03", league: "college-football", reasoning: "O-line mismatch." }, game: sameEvent(), grade: { result: "hit", margin: 1 }, error: null };
  const shadowMLIllinois = { leg: { by: "MitsNemo", type: "moneyline", team: "Illinois", date: "2026-10-03", league: "college-football", reasoning: "Fading the chalk." }, game: sameEvent({ picked: { score: "17", team: { id: "356" } } }), grade: { result: "miss", margin: -1 }, error: null };
  const realRows = breakdownRows([week({ legs: [realSpreadOSU] })]);
  const shadowRows = breakdownRows([week({ week: { id: "shadow-w" }, legs: [shadowSpreadOSU, shadowMLIllinois] })]);
  const collisions = collisionRows(realRows, shadowRows);
  assert.equal(collisions.length, 2);
  assert.equal(collisions.find((c) => c.shadow.bet.includes("Ohio State")).relation, "agree");
  assert.equal(collisions.find((c) => c.shadow.bet.includes("Illinois")).relation, "fade");
});
