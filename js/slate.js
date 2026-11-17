// Pure logic for the "This Week" slate tab: turning raw ESPN scoreboard events into
// display rows and filtering them. No DOM, no network — see js/espn.js for fetching.

const UNRANKED = 99; // ESPN's curatedRank sentinel for "not ranked"; see js/match.js-adjacent notes.

// YYYY-MM-DD strings for `start` (a Date or an ISO date string) through `start + days - 1`,
// suitable for js/espn.js's fetchScoreboard. UTC-based so it's deterministic for tests.
export function dateWindow(start, days) {
  const base = typeof start === "string" ? new Date(`${start}T00:00:00Z`) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const out = [];
  for (let i = 0; i < days; i++) {
    out.push(new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function rankOf(competitor) {
  const r = competitor?.curatedRank?.current;
  return typeof r === "number" && r > 0 && r < UNRANKED ? r : null;
}

function moneylineOdds(side) {
  const odds = side?.close?.odds ?? side?.open?.odds;
  return odds ? String(odds) : null;
}

// One ESPN scoreboard event -> a display row, or null if it's not a normal two-team game.
export function eventToRow(event, league) {
  const comp = event?.competitions?.[0];
  const comps = comp?.competitors ?? [];
  if (comps.length !== 2) return null;
  const home = comps.find((c) => c.homeAway === "home") ?? comps[0];
  const away = comps.find((c) => c.homeAway === "away") ?? comps[1];
  if (!home?.team || !away?.team) return null;
  const odds = comp?.odds?.[0] ?? null;
  const ml = odds?.moneyline;
  return {
    id: event.id,
    league,
    date: event.date ?? null,
    home: { name: home.team.displayName ?? home.team.name ?? "?", abbreviation: home.team.abbreviation ?? "", rank: rankOf(home), conferenceId: home.team.conferenceId != null ? String(home.team.conferenceId) : null },
    away: { name: away.team.displayName ?? away.team.name ?? "?", abbreviation: away.team.abbreviation ?? "", rank: rankOf(away), conferenceId: away.team.conferenceId != null ? String(away.team.conferenceId) : null },
    spreadDetails: odds?.details ?? null,
    overUnder: odds?.overUnder ?? null,
    moneyline: ml ? { home: moneylineOdds(ml.home), away: moneylineOdds(ml.away) } : null,
    oddsProvider: odds?.provider?.displayName ?? null,
  };
}

// fetches: [{ league, events }] (one entry per date/league scoreboard call). Flattens,
// dedupes by event id (a game can appear on more than one date in the window from ESPN's
// neighbouring-day listings), and sorts by kickoff.
export function buildRows(fetches) {
  const seen = new Set();
  const rows = [];
  for (const { league, events } of fetches) {
    for (const event of events ?? []) {
      if (!event?.id || seen.has(event.id)) continue;
      const row = eventToRow(event, league);
      if (!row) continue;
      seen.add(event.id);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
}

// Basic filtering: by league ("all" | "nfl" | "college-football") and a team-name
// substring search across both sides' full names and abbreviations.
export function filterRows(rows, { league = "all", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (league !== "all" && r.league !== league) return false;
    if (!q) return true;
    const hay = `${r.home.name} ${r.home.abbreviation} ${r.away.name} ${r.away.abbreviation}`.toLowerCase();
    return hay.includes(q);
  });
}

// Badge text for a row's league: "NFL" as-is; for CFB, the shared conference name when both
// sides play in the same one (most games), "Non-Conference" when they don't, or a generic
// "CFB" fallback when a side's conferenceId wasn't resolved or isn't in the map yet.
export function leagueLabel(row, conferenceNames = {}) {
  if (row.league !== "college-football") return "NFL";
  const h = row.home?.conferenceId, a = row.away?.conferenceId;
  if (h && a) return h === a ? (conferenceNames[h] ?? "CFB") : "Non-Conference";
  return "CFB";
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Groups rows by the LOCAL calendar day of kickoff (the viewer's own timezone, matching how
// each card's kickoff time is already displayed), so a page full of games reads as a handful
// of day sections instead of one long list. A row with no date goes in a trailing "Date TBD"
// group. `now` is injectable for deterministic tests; defaults to the real current time.
export function groupByDay(rows, { now = new Date() } = {}) {
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const groups = new Map();
  for (const r of rows) {
    const d = r.date ? new Date(r.date) : null;
    const key = d ? dayKey(d) : "tbd";
    if (!groups.has(key)) groups.set(key, { key, date: d, games: [] });
    groups.get(key).games.push(r);
  }
  return [...groups.values()]
    .sort((a, b) => (a.key === "tbd" ? 1 : b.key === "tbd" ? -1 : a.key.localeCompare(b.key)))
    .map((g) => ({
      ...g,
      label: g.key === "tbd" ? "Date TBD"
        : g.key === todayKey ? "Today"
        : g.key === tomorrowKey ? "Tomorrow"
        : g.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }),
      isToday: g.key === todayKey,
    }));
}
