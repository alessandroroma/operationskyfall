import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bettingWar, breakdownRows, contributors, cumulativeWarByWeek, decimalOdds, filterRows, fmtMoney, fmtNet, marginLeaders, money, oddsText,
  leagueRecords, ODDS_BANDS, oddsBandIndex, outcomeText, personTotals, pickText, resultsByOdds,
  seasonMoney, spreadText, typeLabel, warByWeek, weekMoney,
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
    by: "Roma", league: "", bet: "Texas Tech -12.5", pick: "Texas Tech", note: "", type: "Spread", spread: "-12.5", line: -12.5, odds: "\u2014", oddsValue: null,
    oddsFull: "", result: "miss", margin: -3, outcome: "lost by 3", excludeFromStats: false,
  });
  assert.equal(rows[2].by, "");
  assert.equal(rows[0].outcome, "won by 7");
});

test("margin tables rank five graded wins, blowouts, and closest losses", () => {
  const rows = [
    ...[2, 8, 3, 5, 10, 7, 1].map((margin) => ({ result: "hit", margin })),
    ...[-1, -9, -3, -7, -2, -5, -4].map((margin) => ({ result: "miss", margin })),
    { result: "miss", margin: null },
    { result: "hit", margin: null },
    { result: "live_on_track", margin: 20 },
    { weekId: "2026-w2-5", result: "hit", margin: 100 },
    { weekId: "2026-w2-5", result: "miss", margin: -100 },
    { weekId: "2026-w2-5", result: "miss", margin: -0.1 },
  ];
  const ranked = marginLeaders(rows);
  assert.deepEqual(ranked.bestWins.map((row) => row.margin), [10, 8, 7, 5, 3]);
  assert.deepEqual(ranked.worstLosses.map((row) => row.margin), [-9, -7, -5, -4, -3]);
  assert.deepEqual(ranked.worstBeats.map((row) => row.margin), [-1, -2, -3, -4, -5]);
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
  assert.equal(people[0].streakType, "L");
  assert.equal(people[0].streak, 1);
  assert.equal(people[1].push, 1);
  assert.equal(people[1].total, 1);
  assert.equal(people[1].avgLine, null);
  assert.equal(people[1].avgMiss, null);
  assert.equal(people[1].streak, 0);
});

test("current streak follows week and kickoff order, skipping pushes and open legs", () => {
  const rows = breakdownRows([
    week({ week: { id: "w3", weekOf: "2026-10-01" }, legs: [
      leg({ by: "Roma", type: "moneyline", team: "D", date: "2026-10-03" }, { result: "hit" }),
      leg({ by: "Roma", type: "moneyline", team: "E", date: "2026-10-04" }, { result: "push" }),
      leg({ by: "Roma", type: "moneyline", team: "F", date: "2026-10-05" }, { result: "hit" }),
      leg({ by: "Roma", type: "moneyline", team: "G", date: "2026-10-06" }, { result: "pending" }),
      leg({ by: "Dalton", type: "moneyline", team: "H", date: "2026-10-04" }, { result: "miss" }),
      leg({ by: "Paul", type: "moneyline", team: "I", date: "2026-10-04" }, { result: "pending" }),
    ] }),
    week({ week: { id: "w1", weekOf: "2026-09-17" }, legs: [
      leg({ by: "Roma", type: "moneyline", team: "A", date: "2026-09-19" }, { result: "hit" }),
      leg({ by: "Dalton", type: "moneyline", team: "B", date: "2026-09-19" }, { result: "miss" }),
    ] }),
    week({ week: { id: "w2", weekOf: "2026-09-24" }, legs: [
      leg({ by: "Roma", type: "moneyline", team: "C", date: "2026-09-26" }, { result: "miss" }),
    ] }),
  ]);
  const people = new Map(personTotals(rows).map((person) => [person.name, person]));
  assert.deepEqual([people.get("Roma").streakType, people.get("Roma").streak], ["W", 2]);
  assert.deepEqual([people.get("Dalton").streakType, people.get("Dalton").streak], ["L", 2]);
  assert.deepEqual([people.get("Paul").streakType, people.get("Paul").streak], [null, 0]);
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

test("odds bands assign boundary prices exactly once", () => {
  assert.equal(ODDS_BANDS.length, 7);
  assert.deepEqual(
    [-305, -200, -192, -150, -128, -120, -110, 100, 112, 125, 135, 200, 260].map(oddsBandIndex),
    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6],
  );
  assert.equal(oddsBandIndex(null), null);
  assert.equal(oddsBandIndex(0), null);
  assert.equal(oddsBandIndex(99), null);
});

test("results by odds count each person's settled W-L record, including SGP leg prices", () => {
  const entries = [
    ["Roma", -200, "hit"], ["Roma", -150, "miss"], ["Roma", -120, "hit"],
    ["Roma", 100, "miss"], ["Roma", 125, "hit"], ["Roma", 185, "miss"],
    ["Roma", 200, "hit"], ["Roma", -110, "push"], ["Roma", -105, "pending"],
    ["Dalton", 260, "miss"],
  ];
  const legs = entries.map(([by, odds, result], i) => leg(
    { id: `l${i}`, by, odds, team: `Team ${i}`, type: "moneyline" },
    { result, margin: null },
  ));
  legs.push(leg({ id: "sgp1", by: "Roma", group: "sgp", team: "SGP A", type: "other" }, { result: "miss", margin: null }));
  legs.push(leg({ id: "sgp2", by: "Roma", group: "sgp", odds: -110, team: "SGP B", type: "other" }, { result: "hit", margin: null }));
  legs.push(leg({ id: "unpriced", by: "Roma", team: "Unpriced", type: "other" }, { result: "miss", margin: null }));
  const rows = breakdownRows([week({ week: { groups: { sgp: { odds: 135 } } }, legs })]);
  const records = resultsByOdds(rows);
  assert.deepEqual(records.find((p) => p.name === "Roma").records, [
    { wins: 1, losses: 0 }, { wins: 0, losses: 1 }, { wins: 1, losses: 0 },
    { wins: 1, losses: 1 }, { wins: 1, losses: 0 }, { wins: 0, losses: 2 },
    { wins: 1, losses: 0 },
  ]);
  assert.deepEqual(records.find((p) => p.name === "Dalton").records[6], { wins: 0, losses: 1 });
});

test("Betting War converts American odds and totals expected, earned, and delta by person", () => {
  assert.equal(decimalOdds(-200), 1.5);
  assert.equal(decimalOdds(150), 2.5);
  assert.equal(decimalOdds(100), 2);
  assert.equal(decimalOdds(0), null);
  assert.equal(decimalOdds(undefined), null);
  const rows = breakdownRows([week({
    week: { groups: { sgp: { label: "SGP", odds: 100 } } },
    legs: [
      leg({ by: "Roma", odds: -200, team: "A", type: "moneyline" }, { result: "hit" }),
      leg({ by: "Roma", odds: 150, team: "B", type: "moneyline" }, { result: "miss" }),
      leg({ by: "Roma", odds: -100, team: "C", type: "moneyline" }, { result: "pending" }),
      leg({ by: "Roma", odds: 200, team: "D", type: "moneyline" }, { result: "push" }),
      leg({ by: "Roma", group: "sgp", team: "E", type: "other" }, { result: "hit" }),
      leg({ by: "Roma", group: "sgp", odds: -150, team: "F", type: "other" }, { result: "hit" }),
      leg({ by: "Roma", team: "G", type: "other" }, { result: "miss" }),
      leg({ by: "Dalton", odds: 100, team: "H", type: "moneyline" }, { result: "miss" }),
    ],
  })]);
  const result = bettingWar(rows);
  const roma = result.find((p) => p.name === "Roma");
  assert.ok(Math.abs(roma.expected - 3) < 1e-12);
  assert.ok(Math.abs(roma.earned - 13 / 6) < 1e-12);
  assert.ok(Math.abs(roma.delta + 5 / 6) < 1e-12);
  assert.ok(Math.abs(roma.netUnits - 1 / 6) < 1e-12); // net profit units; includes the unpriced loss
  assert.deepEqual(result.find((p) => p.name === "Dalton"), { name: "Dalton", expected: 0.5, earned: 0, delta: -0.5, netUnits: -1 });
});

test("WAR by week is chronological and sums to each person's all-weeks delta", () => {
  const rows = breakdownRows([
    week({ week: { id: "w3", label: "Week 3", weekOf: "2026-10-01" }, legs: [
      leg({ by: "Dalton", odds: -200, team: "A", type: "moneyline" }, { result: "hit" }),
      leg({ by: "Jacob", odds: 100, team: "E", type: "moneyline" }, { result: "miss" }),
    ] }),
    week({ week: { id: "w1", label: "Week 1", weekOf: "2026-09-17" }, legs: [
      leg({ by: "Roma", odds: -100, team: "B", type: "moneyline" }, { result: "hit" }),
      leg({ by: "Dalton", odds: 100, team: "C", type: "moneyline" }, { result: "miss" }),
    ] }),
    week({ week: { id: "w2", label: "Week 2", weekOf: "2026-09-24" }, legs: [
      leg({ by: "Roma", odds: 100, team: "D", type: "moneyline" }, { result: "miss" }),
    ] }),
    week({ week: { id: "w2-5", label: "Week 2.5", weekOf: "2026-09-26" }, legs: [
      leg({ odds: -110, team: "F", type: "moneyline" }, { result: "miss" }),
    ] }),
  ]);
  const chart = warByWeek(rows);
  assert.deepEqual(chart.weeks.map((w) => w.label), ["Week 1", "Week 2", "Week 2.5", "Week 3"]);
  const roma = chart.people.indexOf("Roma"), dalton = chart.people.indexOf("Dalton");
  assert.deepEqual(chart.weeks.map((w) => w.values[roma]), [0.5, -0.5, null, null]);
  assert.ok(Math.abs(chart.weeks[3].values[dalton] + 1 / 6) < 1e-12);
  assert.deepEqual(chart.weeks.slice(0, 2).map((w) => w.values[dalton]), [-0.5, null]);
  for (const person of bettingWar(rows)) {
    const index = chart.people.indexOf(person.name);
    const weeklySum = chart.weeks.reduce((sum, w) => sum + (w.values[index] ?? 0), 0);
    assert.ok(Math.abs(weeklySum - person.delta) < 1e-12);
  }
  const cumulative = cumulativeWarByWeek(rows);
  assert.deepEqual(cumulative.weeks.map((w) => w.label), ["Week 0", "Week 1", "Week 2", "Week 3"]);
  assert.ok(cumulative.weeks[0].values.every((value) => value === 0));
  assert.deepEqual(cumulative.weeks.map((w) => w.values[roma]), [0, 0.5, 0, 0]);
  assert.ok(Math.abs(cumulative.weeks[3].values[dalton] + 2 / 3) < 1e-12);
  assert.deepEqual(cumulative.weeks.slice(0, 3).map((w) => w.values[dalton]), [0, -0.5, -0.5]);
  const jacob = cumulative.people.indexOf("Jacob");
  assert.deepEqual(cumulative.weeks.map((w) => w.values[jacob]), [0, 0, 0, -0.5]);
  for (const person of bettingWar(rows)) {
    const index = cumulative.people.indexOf(person.name);
    assert.ok(Math.abs(cumulative.weeks.at(-1).values[index] - person.delta) < 1e-12);
  }
});

test("win-loss by league splits records and totals every attributed person", () => {
  const rows = breakdownRows([week({ legs: [
    leg({ by: "Roma", league: "nfl", type: "moneyline", team: "A", date: "2026-10-01" }, { result: "hit" }),
    leg({ by: "Roma", league: "college-football", type: "moneyline", team: "B", date: "2026-10-02" }, { result: "miss" }),
    leg({ by: "Dalton", league: "nfl", type: "moneyline", team: "C", date: "2026-10-03" }, { result: "miss" }),
    leg({ by: "Dalton", league: "college-football", type: "moneyline", team: "D", date: "2026-10-04" }, { result: "hit" }),
    leg({ by: "Dalton", league: "nfl", type: "moneyline", team: "E", date: "2026-10-05" }, { result: "push" }),
    leg({ by: "Dalton", league: "college-football", type: "moneyline", team: "G", date: "2026-10-07" }, { result: "pending" }),
    leg({ league: "nfl", type: "moneyline", team: "F", date: "2026-10-06" }, { result: "hit" }),
  ] })]);
  const { people, total } = leagueRecords(rows);
  assert.deepEqual(people.find((p) => p.name === "Roma"), { name: "Roma", nfl: { wins: 1, losses: 0 }, cfb: { wins: 0, losses: 1 } });
  assert.deepEqual(people.find((p) => p.name === "Dalton"), { name: "Dalton", nfl: { wins: 0, losses: 1 }, cfb: { wins: 1, losses: 0 } });
  // The unattributed NFL hit and Dalton's push/pending legs are excluded.
  assert.deepEqual(total, { name: "All", nfl: { wins: 1, losses: 1 }, cfb: { wins: 1, losses: 1 } });
  const sum = (key, side) => people.reduce((t, p) => t + p[key][side], 0);
  assert.equal(sum("nfl", "wins"), total.nfl.wins);
  assert.equal(sum("nfl", "losses"), total.nfl.losses);
  assert.equal(sum("cfb", "wins"), total.cfb.wins);
  assert.equal(sum("cfb", "losses"), total.cfb.losses);
});

test("legs flagged excludeFromStats (a duplicated slip's repeat picks) don't double-count", () => {
  const rows = breakdownRows([
    week({ week: { id: "w4", label: "Week 4", weekOf: "2026-10-09" }, legs: [
      leg({ by: "Dalton", league: "college-football", odds: -111, team: "Penn State", date: "2026-10-10" }, { result: "hit", margin: 4 }),
    ] }),
    week({ week: { id: "w4-5", label: "Week 4.5", weekOf: "2026-10-09" }, legs: [
      leg({ by: "Dalton", league: "college-football", odds: -111, team: "Penn State", excludeFromStats: true, date: "2026-10-10" }, { result: "hit", margin: 4 }),
      leg({ by: "Mark", league: "college-football", odds: -112, team: "Portland State", date: "2026-10-10" }, { result: "hit", margin: 2 }),
    ] }),
  ]);
  assert.equal(rows.length, 3);

  const people = new Map(personTotals(rows).map((p) => [p.name, p]));
  assert.equal(people.get("Dalton").hit, 1);
  assert.equal(people.get("Dalton").total, 1);
  assert.equal(people.get("Mark").hit, 1);

  const { total } = leagueRecords(rows);
  assert.equal(total.cfb.wins, 2); // Dalton once, Mark once - not Dalton's duplicate

  const oddsPeople = resultsByOdds(rows);
  const dalton = oddsPeople.find((p) => p.name === "Dalton");
  const band = oddsBandIndex(-111);
  assert.equal(dalton.records[band].wins, 1);

  const war = bettingWar(rows);
  assert.ok(Math.abs(war.find((p) => p.name === "Dalton").netUnits - 100 / 111) < 1e-9);

  const ranked = marginLeaders(rows);
  // Dalton's original win (margin 4) counts once; the Week 4.5 duplicate is excluded.
  assert.deepEqual(ranked.bestWins.map((r) => r.margin), [4, 2]);
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
