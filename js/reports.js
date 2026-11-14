// Cross-cutting report cards: team, conference/division, and (later) venue splits. Pure,
// DOM-free - consumes js/breakdown.js's `breakdownRows()` output, which already carries the
// resolved `teamId`/`conferenceId` (when ESPN resolved the game) and the correctly
// SGP-split `oddsValue`. No network, no new fetching.
const q = new URL(import.meta.url).search;
const { decimalOdds } = await import(`./breakdown.js${q}`);
const { norm } = await import(`./match.js${q}`);

const TEAM_PICK_TYPES = new Set(["Spread", "Moneyline", "Team total (over)", "Team total (under)"]);

function addResult(bucket, result, oddsValue) {
  bucket.total++;
  if (result === "hit") {
    bucket.hit++;
    const d = decimalOdds(oddsValue);
    if (d != null) bucket.netUnits += d - 1;
  } else if (result === "miss") {
    bucket.miss++;
    bucket.netUnits -= 1;
  } else if (result === "push") {
    bucket.push++;
  }
}

// One row per team ever picked on a side (spread/moneyline/team total - not a game total,
// which isn't "picking a team"). Merges by resolved ESPN team id when the game resolved,
// falling back to the normalized typed name (so an unresolved team, e.g. an FCS opponent,
// still gets one stable row instead of one per spelling).
export function teamReportRows(rows) {
  const map = new Map();
  for (const r of rows) {
    if (r.excludeFromStats || !TEAM_PICK_TYPES.has(r.type)) continue;
    if (!r.pick || r.pick === "—") continue;
    if (r.result !== "hit" && r.result !== "miss" && r.result !== "push") continue;
    const key = r.teamId ? `id:${r.teamId}` : `name:${norm(r.pick)}`;
    if (!map.has(key)) map.set(key, { name: r.pick, league: r.league, hit: 0, miss: 0, push: 0, total: 0, netUnits: 0, people: new Map() });
    const t = map.get(key);
    addResult(t, r.result, r.oddsValue);
    if (r.by) t.people.set(r.by, (t.people.get(r.by) ?? 0) + 1);
  }
  return [...map.values()]
    .map((t) => ({ ...t, settled: t.hit + t.miss, people: [...t.people.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// CFB-only (conferenceId isn't meaningful for NFL): one row per conference, from any leg
// type (a game total still carries the picked side's conference). Legs ESPN never resolved
// (no conferenceId) are excluded rather than bucketed as "unknown" - see `fcsCount` for how
// many that was, so the UI can say so instead of silently dropping them.
export function conferenceReportRows(rows, conferenceNames) {
  const map = new Map();
  let unresolved = 0;
  for (const r of rows) {
    if (r.excludeFromStats || r.league !== "college-football") continue;
    if (r.result !== "hit" && r.result !== "miss" && r.result !== "push") continue;
    if (!r.conferenceId) { unresolved++; continue; }
    const name = conferenceNames[r.conferenceId] ?? `Conference ${r.conferenceId}`;
    if (!map.has(name)) map.set(name, { name, hit: 0, miss: 0, push: 0, total: 0, netUnits: 0 });
    addResult(map.get(name), r.result, r.oddsValue);
  }
  const conferences = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { conferences, unresolved };
}

// Splits settled, attributed legs by surface (grass/turf), site (neutral/home-away), and -
// CFB only - conference game vs non-conference. A leg with no `venue` (not yet backfilled,
// or ESPN never resolved it) is excluded from every split it lacks data for, rather than
// bucketed as a false "no". `missing` reports how many legs had no venue data at all.
export function venueReportRows(rows) {
  const bucket = () => ({ hit: 0, miss: 0, push: 0, total: 0, netUnits: 0 });
  const surface = { grass: bucket(), turf: bucket() };
  const site = { "Neutral site": bucket(), "Home/away": bucket() };
  const conferenceGame = { "Conference game": bucket(), "Non-conference": bucket() };
  let missing = 0;
  for (const r of rows) {
    if (r.excludeFromStats) continue;
    if (r.result !== "hit" && r.result !== "miss" && r.result !== "push") continue;
    if (!r.venue) { missing++; continue; }
    if (typeof r.venue.grass === "boolean") addResult(surface[r.venue.grass ? "grass" : "turf"], r.result, r.oddsValue);
    if (typeof r.venue.neutralSite === "boolean") addResult(site[r.venue.neutralSite ? "Neutral site" : "Home/away"], r.result, r.oddsValue);
    if (r.league === "college-football" && typeof r.venue.conferenceGame === "boolean") {
      addResult(conferenceGame[r.venue.conferenceGame ? "Conference game" : "Non-conference"], r.result, r.oddsValue);
    }
  }
  const toRows = (obj) => Object.entries(obj).map(([name, b]) => ({ name, ...b })).filter((r) => r.total > 0);
  return { surface: toRows(surface), site: toRows(site), conferenceGame: toRows(conferenceGame), missing };
}

// What a leg's "side" is, for comparing a shadow pick against a real one on the same game.
// Team-side bets (spread/moneyline/team total) compare by the team backed; totals compare
// by over/under. The two kinds never compare to each other (see collisionRows below).
const TEAM_SIDE_TYPES = new Set(["Spread", "Moneyline", "Team total (over)", "Team total (under)"]);
function sideOf(row) {
  if (TEAM_SIDE_TYPES.has(row.type)) return { kind: "team", key: row.teamId ?? `name:${norm(row.pick)}` };
  if (row.type === "Game total (over)") return { kind: "total", key: "over" };
  if (row.type === "Game total (under)") return { kind: "total", key: "under" };
  return null;
}

// Every (shadow leg, real leg) pair that landed on the same ESPN event - same side
// ("agree") or opposite sides ("fade"), or "different market" when the two bet types
// aren't directly comparable (e.g. a spread against a total). A list of collisions, not a
// win rate - the sample size here is small by nature (most games have no shadow pick at
// all, or no real leg at all).
export function collisionRows(realRows, shadowRows) {
  const realByEvent = new Map();
  for (const r of realRows) {
    if (!r.eventId || r.excludeFromStats) continue;
    if (!realByEvent.has(r.eventId)) realByEvent.set(r.eventId, []);
    realByEvent.get(r.eventId).push(r);
  }
  const collisions = [];
  for (const s of shadowRows) {
    if (!s.eventId || s.excludeFromStats) continue;
    const reals = realByEvent.get(s.eventId);
    if (!reals) continue;
    for (const r of reals) {
      const a = sideOf(s), b = sideOf(r);
      const relation = a && b && a.kind === b.kind ? (a.key === b.key ? "agree" : "fade") : "different market";
      collisions.push({
        eventId: s.eventId,
        real: { week: r.week, by: r.by, bet: r.bet, type: r.type, result: r.result },
        shadow: { week: s.week, bet: s.bet, type: s.type, result: s.result, reasoning: s.reasoning },
        relation,
      });
    }
  }
  return collisions;
}
