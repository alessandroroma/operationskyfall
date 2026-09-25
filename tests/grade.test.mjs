import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLeg, parlayStatus, legMargin, seasonRecord } from "../js/grade.js";
import { findGame, teamScore } from "../js/match.js";

const team = (displayName, abbreviation, location, name) => ({ displayName, abbreviation, location, name, shortDisplayName: name });
const comp = (t, homeAway, score) => ({ team: t, homeAway, score: String(score) });
const game = (state, a, b, pickedIdx = 0) => {
  const comps = [a, b];
  return {
    event: { status: { type: { state, completed: state === "post" } }, competitions: [{ competitors: comps }] },
    picked: comps[pickedIdx],
    other: comps[1 - pickedIdx],
  };
};
const osu = team("Ohio State Buckeyes", "OSU", "Ohio State", "Buckeyes");
const ill = team("Illinois Fighting Illini", "ILL", "Illinois", "Fighting Illini");

test("spread: favourite covers / fails / pushes", () => {
  const leg = { type: "spread", line: -14.5 };
  assert.equal(gradeLeg(leg, game("post", comp(osu, "home", 35), comp(ill, "away", 17))).result, "hit");
  assert.equal(gradeLeg(leg, game("post", comp(osu, "home", 31), comp(ill, "away", 20))).result, "miss");
  assert.equal(gradeLeg({ type: "spread", line: -14 }, game("post", comp(osu, "home", 34), comp(ill, "away", 20))).result, "push");
});

test("spread: underdog with points", () => {
  const leg = { type: "spread", line: 3.5 };
  assert.equal(gradeLeg(leg, game("post", comp(ill, "away", 20), comp(osu, "home", 23))).result, "hit");
  assert.equal(gradeLeg(leg, game("post", comp(ill, "away", 20), comp(osu, "home", 24))).result, "miss");
});

test("moneyline and totals", () => {
  assert.equal(gradeLeg({ type: "moneyline" }, game("post", comp(osu, "home", 10), comp(ill, "away", 7))).result, "hit");
  assert.equal(gradeLeg({ type: "moneyline" }, game("post", comp(osu, "home", 7), comp(ill, "away", 10))).result, "miss");
  assert.equal(gradeLeg({ type: "total_over", line: 47.5 }, game("post", comp(osu, "home", 30), comp(ill, "away", 20))).result, "hit");
  assert.equal(gradeLeg({ type: "total_under", line: 47.5 }, game("post", comp(osu, "home", 30), comp(ill, "away", 20))).result, "miss");
  assert.equal(gradeLeg({ type: "total_over", line: 50 }, game("post", comp(osu, "home", 30), comp(ill, "away", 20))).result, "push");
});

test("live games are never final results", () => {
  const leg = { type: "spread", line: -3 };
  assert.equal(gradeLeg(leg, game("in", comp(osu, "home", 14), comp(ill, "away", 3))).result, "live_on_track");
  assert.equal(gradeLeg(leg, game("in", comp(osu, "home", 9), comp(ill, "away", 7))).result, "live_off_track");
  assert.equal(gradeLeg(leg, game("in", comp(osu, "home", 9), comp(ill, "away", 7))).margin, -1);
  assert.equal(gradeLeg(leg, game("in", comp(osu, "home", 10), comp(ill, "away", 7))).result, "live_push");
});

test("scheduled, missing game and manual override", () => {
  assert.equal(gradeLeg({ type: "spread", line: -3 }, game("pre", comp(osu, "home", 0), comp(ill, "away", 0))).result, "pending");
  assert.equal(gradeLeg({ type: "spread", line: -3 }, null).result, "unknown");
  assert.equal(gradeLeg({ type: "other", result: "hit" }, null).result, "hit");
  assert.equal(legMargin({ type: "other" }, 1, 2), null);
});

test("parlay status", () => {
  assert.equal(parlayStatus(["hit", "hit", "pending"]).status, "ALIVE");
  assert.equal(parlayStatus(["hit", "miss", "pending"]).status, "BUSTED");
  assert.equal(parlayStatus(["hit", "push", "hit"]).status, "WON");
  assert.equal(parlayStatus(["push", "push"]).status, "VOID");
  assert.equal(parlayStatus(["hit", "unknown"]).status, "ALIVE");
  assert.equal(parlayStatus(["hit", "live_on_track"]).status, "ALIVE");
  assert.deepEqual(parlayStatus(["hit", "miss", "live_push", "pending", "unknown", "push"]).counts, { hit: 1, miss: 1, push: 1, live: 1, pending: 1, unknown: 1, total: 6 });
  assert.deepEqual(seasonRecord(["WON", "BUSTED", "BUSTED", "ALIVE"]), { won: 1, lost: 2, open: 1 });
});

test("team matching", () => {
  assert.equal(teamScore("Ohio State", osu), 3);
  assert.equal(teamScore("osu", osu), 3);
  assert.equal(teamScore("buckeyes", osu), 3);
  assert.equal(teamScore("Ohio State Buckeyes", osu), 3);
  assert.equal(teamScore("Illinois", osu), 0);
  assert.equal(teamScore("Fighting", ill), 2);
  assert.equal(teamScore("Séan", osu), 0);
  const miamiOh = team("Miami (OH) RedHawks", "M-OH", "Miami (OH)", "RedHawks");
  const miami = team("Miami Hurricanes", "MIA", "Miami", "Hurricanes");
  assert.equal(teamScore("Miami", miami), 3);
  assert.ok(teamScore("Miami", miamiOh) < 3);
});

test("findGame picks the right side and honours opponent", () => {
  const events = [
    { competitions: [{ competitors: [comp(osu, "home", 0), comp(ill, "away", 0)] }] },
    { competitions: [{ competitors: [comp(team("Texas Longhorns", "TEX", "Texas", "Longhorns"), "away", 0), comp(team("Tennessee Volunteers", "TENN", "Tennessee", "Volunteers"), "home", 0)] }] },
  ];
  const g = findGame(events, { team: "Illinois", opponent: "Ohio State" });
  assert.equal(g.picked.team.abbreviation, "ILL");
  assert.equal(g.other.team.abbreviation, "OSU");
  assert.equal(findGame(events, { team: "Illinois", opponent: "Texas" }), null);
  assert.equal(findGame(events, { team: "Nobody" }), null);
});
