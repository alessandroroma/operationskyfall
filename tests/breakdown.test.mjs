import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breakdownRows, contributors, filterRows, fmtMoney, fmtNet, money, oddsText,
  outcomeText, personTotals, pickText, seasonMoney, spreadText, typeLabel, weekMoney,
} from "../js/breakdown.js";

const ev = (overrides) => ({
  event: { date: "2026-10-03T16:00Z", status: { type: { state: "post", completed: true } } },
  picked: { score: "24" },
  other: { score: "17" },
  ...overrides,
});

const week = (overrides = {}) => ({
  week: { id: "w", label: "Week 3", weekOf: "2026-10-01", stake: "$7", payout: "$4,449.57", ...(overrides.week ?? {}) },
  legs: overrides.legs ?? [],
  status: overrides.status ?? "WON",
  counts: overrides.counts ?? {},
});

const leg = (legData, grade) => ({
  leg: legData,
  game: ev({ event: { date: `${legData.date ?? "2026-10-03"}T16:00Z`, status: { type: { state: "post", completed: true } } } }),
  grade,
  error: null,
});

test("type, spread and pick columns read like a bet slip", () => {
  assert.equal(typeLabel({ type: "total_under" }), "Game total (under)");
  assert.equal(typeLabel({ type: "other" }), "Prop / other");
  assert.equal(typeLabel({ type: "mystery" }), "mystery");
  assert.equal(typeLabel({}), "\u2014");

  assert.equal(spreadText({ type: "spread", line: -3.5 }), "-3.5");
  assert.equal(spreadText({ type: "spread", line: 7 }), "+7");
  assert.equal(spreadText({ type: "total_under", line: 45.5 }), "U 45.5");
  assert.equal(spreadText({ type: "total_over", line: 62.5 }), "O 62.5");
  assert.equal(spreadText({ type: "team_total_over", line: 34.5 }), "O 34.5");
  assert.equal(spreadText({ type: "moneyline" }), "\u2014");
  assert.equal(spreadText({ type: "spread" }), "\u2014");

  assert.equal(pickText({ type: "spread", team: "Cleveland Browns" }), "Cleveland Browns");
  assert.equal(pickText({ type: "total_under", team: "Ohio State", opponent: "Iowa" }), "Ohio State / Iowa");
  assert.equal(pickText({ type: "other", team: "Detroit Lions", note: "Amon-Ra St. Brown anytime TD" }), "Detroit Lions \u2013 Amon-Ra St. Brown anytime TD");
});

test("odds column shows the leg price or the shared same-game price", () => {
  assert.equal(oddsText({ odds: -115 }, {}), "-115");
  assert.equal(oddsText({ group: "sgp" }, { groups: { sgp: { label: "Same-game parlay", odds: 135 } } }), "+135");
  assert.equal(oddsText({ group: "sgp", odds: -110 }, { groups: { sgp: { label: "Same-game parlay", odds: 135 } } }), "-110");
  assert.equal(oddsText({ odds: 0 }, {}), "\u2014");
  assert.equal(oddsText({}, {}), "\u2014");
});

test("won/lost by uses the graded margin", () => {
  assert.equal(outcomeText("hit", 7.5), "won by 7.5");
  assert.equal(outcomeText("miss", -3), "lost by 3");
  assert.equal(outcomeText("push", 0), "on the number (push)");
  assert.equal(outcomeText("live_on_track", 4), "up 4 (live)");
  assert.equal(outcomeText("live_off_track", -4), "down 4 (live)");
  assert.equal(outcomeText("live_push", 0), "on the number (push)");
  assert.equal(outcomeText("unknown", null), "\u2014");
  assert.equal(outcomeText("hit", null), "\u2014");
});

test("rows cover every leg, newest week first, kickoff order inside a week", () => {
  const early = leg({ id: "a", by: "Luke", type: "moneyline", team: "Detroit Lions", date: "2026-10-01" }, { result: "hit", margin: 7 });
  const late = leg({ id: "b", by: "Roma", type: "spread", line: -12.5, team: "Texas Tech", date: "2026-10-03" }, { result: "miss", margin: -3 });
  const rows = breakdownRows([
    week({ week: { id: "w3", label: "Week 3" }, legs: [late, early], status: "BUSTED" }),
    week({ week: { id: "w2", label: "Week 2" }, legs: [leg({ id: "c", type: "moneyline", team: "Army", date: "2026-09-26" }, { result: "hit", margin: 10 })] }),
  ]);
  assert.deepEqual(rows.map((r) => r.pick), ["Detroit Lions", "Texas Tech", "Army"]);
  assert.deepEqual(rows.map((r) => r.week), ["Week 3", "Week 3", "Week 2"]);
  assert.deepEqual(rows[1], {
    weekId: "w3", week: "Week 3", weekOf: "2026-10-01", weekStatus: "BUSTED",
    by: "Roma", pick: "Texas Tech", note: "", type: "Spread", spread: "-12.5", line: -12.5, odds: "\u2014", oddsValue: null,
    oddsFull: "", result: "miss", margin: -3, outcome: "lost by 3",
  });
  assert.equal(rows[2].by, "");
  assert.equal(rows[0].outcome, "won by 7");
});

test("filtering and per-person tallies", () => {
  const rows = breakdownRows([
    week({
      legs: [
        leg({ by: "Roma", type: "moneyline", team: "A", date: "2026-10-01" }, { result: "hit", margin: 1 }),
        leg({ by: "Roma", type: "spread", line: -1, odds: -110, team: "B", date: "2026-10-02" }, { result: "miss", margin: -2 }),
        leg({ by: "Dalton", type: "moneyline", team: "C", date: "2026-10-03" }, { result: "push", margin: 0 }),
        leg({ type: "moneyline", team: "D", date: "2026-10-04" }, { result: "pending", margin: null }),
      ],
    }),
  ]);
  assert.deepEqual(contributors(rows), ["Roma", "Dalton"]);
  assert.deepEqual(filterRows(rows, "all").length, 4);
  assert.deepEqual(filterRows(rows, "Roma").map((r) => r.pick), ["A", "B"]);
  assert.deepEqual(filterRows(rows, "Nobody"), []);
  const people = personTotals(rows);
  assert.deepEqual(people.map((p) => p.name), ["Roma", "Dalton"]);
  assert.equal(people[0].hit, 1);
  assert.equal(people[0].miss, 1);
  assert.equal(people[0].total, 2);
  assert.equal(people[0].avgLine, -110);
  assert.equal(people[0].avgMiss, 2);
  assert.equal(people[1].push, 1);
  assert.equal(people[1].total, 1);
  assert.equal(people[1].avgLine, null);
  assert.equal(people[1].avgMiss, null);
});

test("average line uses American odds, including open picks and shared SGP prices", () => {
  const rows = breakdownRows([week({
    week: { groups: { sgp: { label: "SGP", odds: 130 } } },
    legs: [
      leg({ by: "Roma", type: "spread", line: -7.5, odds: -200, team: "A" }, { result: "hit", margin: 3 }),
      leg({ by: "Roma", type: "total_over", line: 47.5, odds: -110, team: "B" }, { result: "pending", margin: null }),
      leg({ by: "Roma", type: "moneyline", group: "sgp", team: "C" }, { result: "miss", margin: -4 }),
      leg({ by: "Roma", type: "spread", group: "sgp", odds: -110, team: "E" }, { result: "hit", margin: 2 }),
      leg({ by: "Roma", type: "other", team: "D", result: "miss" }, { result: "miss", margin: null }),
    ],
  })]);
  const [person] = personTotals(rows);
  assert.equal(person.avgLine, -72.5);
  assert.equal(person.lineCount, 4);
  assert.equal(person.avgMiss, 4);
  assert.equal(person.missCount, 1);
});

test("money fields parse out of free text", () => {
  assert.equal(money("$7"), 7);
  assert.equal(money("$4,449.57"), 4449.57);
  assert.equal(money("$4,333.35 (incl. $1,476.19 parlay boost)"), 4333.35);
  assert.equal(money("$0 returned"), 0);
  assert.equal(money("$0.00"), 0);
  assert.equal(money("no money here"), null);
  assert.equal(money(undefined), null);
  assert.equal(fmtMoney(4449.57), "$4,449.57");
  assert.equal(fmtMoney(null), "\u2014");
  assert.equal(fmtNet(4442.57), "+$4,442.57");
  assert.equal(fmtNet(-6), "-$6.00");
  assert.equal(fmtNet(0), "$0.00");
});

test("week net uses returned, payout on a win, zero when busted", () => {
  assert.deepEqual(weekMoney({ stake: "$7", payout: "$4,449.57" }, "WON"), { label: undefined, status: "WON", stake: 7, returned: 4449.57, net: 4442.57 });
  assert.deepEqual(weekMoney({ stake: "$6", payout: "$7,640.41", returned: "$0.00" }, "BUSTED"), { label: undefined, status: "BUSTED", stake: 6, returned: 0, net: -6 });
  assert.deepEqual(weekMoney({ stake: "$6", payout: "$7,640.41" }, "BUSTED"), { label: undefined, status: "BUSTED", stake: 6, returned: 0, net: -6 });
  assert.deepEqual(weekMoney({ stake: "$6" }, "ALIVE"), { label: undefined, status: "ALIVE", stake: 6, returned: null, net: null });
});

test("season money totals settled weeks and skips demo data", () => {
  const totals = seasonMoney([
    week({ week: { id: "w3", stake: "$7", payout: "$4,449.57" }, status: "WON" }),
    week({ week: { id: "w2", stake: "$6", payout: "$7,640.41", returned: "$0.00" }, status: "BUSTED" }),
    week({ week: { id: "demo", stake: "$1", payout: "$999", example: true }, status: "WON" }),
  ]);
  assert.equal(totals.weeks.length, 2);
  assert.equal(totals.stake, 13);
  assert.equal(totals.returned, 4449.57);
  assert.equal(totals.net, 4436.57);
});
