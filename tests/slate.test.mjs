import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, dateWindow, eventToRow, filterRows, groupByDay, leagueLabel } from "../js/slate.js";

test("date window is deterministic and UTC-based", () => {
  assert.deepEqual(dateWindow("2026-11-14", 3), ["2026-11-14", "2026-11-15", "2026-11-16"]);
  assert.deepEqual(dateWindow(new Date("2026-11-14T23:00:00Z"), 1), ["2026-11-14"]);
});

const team = (displayName, abbreviation, rank, conferenceId) => ({
  team: { displayName, abbreviation, ...(conferenceId != null ? { conferenceId } : {}) },
  ...(rank != null ? { curatedRank: { current: rank } } : {}),
});

const event = ({ id = "1", home, away, odds = null } = {}) => ({
  id,
  date: "2026-11-14T18:00Z",
  competitions: [{
    competitors: [
      { homeAway: "home", ...home },
      { homeAway: "away", ...away },
    ],
    odds: odds ? [odds] : [],
  }],
});

test("eventToRow reads teams, rank and DraftKings odds", () => {
  const ev = event({
    home: team("Miami Hurricanes", "MIA", 7),
    away: team("Duke Blue Devils", "DUKE", 99), // 99 is ESPN's "unranked" sentinel
    odds: {
      details: "MIA -14", overUnder: 54.5, spread: -14,
      provider: { displayName: "DraftKings" },
      moneyline: { home: { close: { odds: "-575" } }, away: { close: { odds: "+425" } } },
    },
  });
  const row = eventToRow(ev, "college-football");
  assert.equal(row.home.name, "Miami Hurricanes");
  assert.equal(row.home.rank, 7);
  assert.equal(row.away.rank, null); // 99 -> unranked, not literal rank 99
  assert.equal(row.spreadDetails, "MIA -14");
  assert.equal(row.overUnder, 54.5);
  assert.deepEqual(row.moneyline, { home: "-575", away: "+425" });
  assert.equal(row.oddsProvider, "DraftKings");
});

test("eventToRow carries each side's conferenceId for leagueLabel to resolve", () => {
  const row = eventToRow(event({ home: team("Miami Hurricanes", "MIA", 7, 1), away: team("Duke Blue Devils", "DUKE", 99, 1) }), "college-football");
  assert.equal(row.home.conferenceId, "1");
  assert.equal(row.away.conferenceId, "1");
});

test("leagueLabel: NFL stays NFL; CFB resolves a shared conference, flags cross-conference, falls back gracefully", () => {
  const conferenceNames = { "1": "ACC", "5": "Big Ten" };
  const cfbRow = (hConf, aConf) => ({ league: "college-football", home: { conferenceId: hConf }, away: { conferenceId: aConf } });
  assert.equal(leagueLabel({ league: "nfl" }, conferenceNames), "NFL");
  assert.equal(leagueLabel(cfbRow("1", "1"), conferenceNames), "ACC"); // same conference
  assert.equal(leagueLabel(cfbRow("1", "5"), conferenceNames), "Non-Conference"); // different conferences
  assert.equal(leagueLabel(cfbRow("1", "1"), {}), "CFB"); // id not in the map yet
  assert.equal(leagueLabel(cfbRow(null, null), conferenceNames), "CFB"); // ESPN never resolved it
});

test("eventToRow returns null for anything that isn't a normal two-team game", () => {
  assert.equal(eventToRow({ competitions: [{ competitors: [] }] }, "nfl"), null);
  assert.equal(eventToRow({ competitions: [{ competitors: [{ homeAway: "home" }] }] }, "nfl"), null);
  assert.equal(eventToRow(null, "nfl"), null);
});

test("buildRows flattens multiple fetches, dedupes by event id, and sorts by kickoff", () => {
  const early = event({ id: "1", home: team("A", "A"), away: team("B", "B") });
  early.date = "2026-11-14T17:00Z";
  const late = event({ id: "2", home: team("C", "C"), away: team("D", "D") });
  late.date = "2026-11-14T20:00Z";
  const dupe = { ...late }; // same id "2", would double-count if a date range re-lists it
  const rows = buildRows([
    { league: "nfl", events: [late, early] },
    { league: "nfl", events: [dupe] },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.id), ["1", "2"]); // early kickoff first
});

test("filterRows narrows by league and a case-insensitive team substring", () => {
  const rows = [
    { league: "nfl", home: { name: "Detroit Lions", abbreviation: "DET" }, away: { name: "Chicago Bears", abbreviation: "CHI" } },
    { league: "college-football", home: { name: "Ohio State Buckeyes", abbreviation: "OSU" }, away: { name: "Michigan Wolverines", abbreviation: "MICH" } },
  ];
  assert.equal(filterRows(rows, { league: "nfl" }).length, 1);
  assert.equal(filterRows(rows, { query: "buckeyes" }).length, 1);
  assert.equal(filterRows(rows, { query: "OSU" }).length, 1);
  assert.equal(filterRows(rows, { league: "nfl", query: "osu" }).length, 0);
  assert.equal(filterRows(rows, {}).length, 2);
});

test("groupByDay buckets by local calendar day, labels today/tomorrow, and sorts TBD last", () => {
  const now = new Date(2026, 10, 21, 9, 0); // Sat Nov 21, 9am local
  const rowOn = (id, y, m, d, h = 12) => ({ id, home: { name: "H", abbreviation: "H" }, away: { name: "A", abbreviation: "A" }, date: new Date(y, m, d, h).toISOString() });
  const rows = [
    rowOn("today-late", 2026, 10, 21, 20),
    rowOn("today-early", 2026, 10, 21, 12),
    rowOn("tomorrow", 2026, 10, 22, 12),
    rowOn("in-3-days", 2026, 10, 24, 12),
    { id: "tbd", home: { name: "H", abbreviation: "H" }, away: { name: "A", abbreviation: "A" }, date: null },
  ];
  const groups = groupByDay(rows, { now });
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Tomorrow", "Tuesday, Nov 24", "Date TBD"]);
  assert.equal(groups[0].isToday, true);
  assert.equal(groups[1].isToday, false);
  // within a day, original row order (already kickoff-sorted by buildRows upstream) is preserved
  assert.deepEqual(groups[0].games.map((g) => g.id), ["today-late", "today-early"]);
});
