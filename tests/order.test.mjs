import { test } from "node:test";
import assert from "node:assert/strict";
import { chronological, groupLegs, mergeGroups } from "../js/order.js";

const entry = (leg, result, extra = {}) => ({
  leg,
  game: extra.game ?? null,
  grade: { result, margin: extra.margin ?? null, state: extra.state ?? "final" },
  error: extra.error ?? null,
});

test("mergeGroups leaves ungrouped legs untouched", () => {
  const a = entry({ id: "a", by: "Mark", type: "spread", line: -1.5, team: "Wake Forest" }, "hit");
  const b = entry({ id: "b", by: "Luke", type: "total_over", line: 73.5, team: "Texas Tech" }, "miss");
  const out = mergeGroups([a, b]);
  assert.equal(out.length, 2);
  assert.equal(out[0], a);
  assert.equal(out[1], b);
});

test("mergeGroups collapses a same-game parlay into one entry, flagged as merged", () => {
  const l1 = entry({ id: "l7", by: "Dalton", group: "sgp1", type: "spread", line: -4.5, team: "Memphis" }, "hit");
  const l2 = entry({ id: "l8", by: "Dalton", group: "sgp1", type: "team_total_over", line: 28.5, team: "Memphis" }, "hit");
  const out = mergeGroups([l1, l2]);
  assert.equal(out.length, 1);
  assert.equal(out[0].leg.by, "Dalton");
  assert.equal(out[0].leg.team, "Memphis -4.5 + Memphis Over 28.5 pts");
  assert.equal(out[0].leg.merged, true);
  assert.equal(out[0].grade.result, "hit");
});

test("mergeGroups busts the whole bet on any losing leg", () => {
  const l1 = entry({ id: "l11", by: "Matt", group: "sgp2", type: "total_under", line: 41.5, team: "Giants" }, "hit");
  const l2 = entry({ id: "l12", by: "Matt", group: "sgp2", type: "other", team: "Commanders" }, "miss");
  const out = mergeGroups([l1, l2]);
  assert.equal(out.length, 1);
  assert.equal(out[0].grade.result, "miss");
});

test("mergeGroups stays unresolved while any leg is pending/live, unless something already missed", () => {
  const hit = entry({ id: "a", group: "g", type: "spread", team: "A" }, "hit");
  const pending = entry({ id: "b", group: "g", type: "spread", team: "B" }, "pending");
  assert.equal(mergeGroups([hit, pending])[0].grade.result, "pending");

  const miss = entry({ id: "c", group: "g2", type: "spread", team: "C" }, "miss");
  const live = entry({ id: "d", group: "g2", type: "spread", team: "D" }, "live_on_track");
  assert.equal(mergeGroups([miss, live])[0].grade.result, "miss");
});

test("mergeGroups preserves a group's own game for downstream use", () => {
  const game = { event: { id: "1" } };
  const l1 = entry({ id: "a", group: "g", type: "spread", team: "A" }, "hit", { game });
  const l2 = entry({ id: "b", group: "g", type: "spread", team: "B" }, "hit");
  const [merged] = mergeGroups([l1, l2]);
  assert.equal(merged.game, game);
  assert.equal(merged.leg.group, "g");
});

test("chronological and groupLegs still work on merged entries", () => {
  const l1 = entry({ id: "a", group: "g", type: "spread", team: "A", result: "hit" }, "hit");
  const l2 = entry({ id: "b", group: "g", type: "spread", team: "B", result: "hit" }, "hit");
  const solo = entry({ id: "c", type: "spread", team: "C", result: "miss" }, "miss");
  const merged = mergeGroups([l1, l2, solo]);
  assert.equal(chronological(merged).length, 2);
  const g = groupLegs(merged);
  assert.equal(g.final.length, 2);
});
