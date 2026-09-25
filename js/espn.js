import { findGame } from "./match.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football";
const cache = new Map();

export function ymd(dateStr) {
  return dateStr.replaceAll("-", "");
}

export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function url(league, dateStr) {
  const extra = league === "college-football" ? "&groups=80&limit=400" : "&limit=100";
  return `${BASE}/${league}/scoreboard?dates=${ymd(dateStr)}${extra}`;
}

export async function fetchScoreboard(league, dateStr, { fresh = false, fetchImpl = fetch } = {}) {
  const key = `${league}:${dateStr}`;
  if (!fresh && cache.has(key)) return cache.get(key);
  const p = fetchImpl(url(league, dateStr)).then(async (r) => {
    if (!r.ok) throw new Error(`ESPN ${r.status} for ${key}`);
    const data = await r.json();
    return data.events ?? [];
  });
  cache.set(key, p);
  try {
    return await p;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}

// Find the game for a leg on its date, falling back to the neighbouring days.
export async function findLegGame(leg, opts = {}) {
  const dates = [leg.date, shiftDate(leg.date, -1), shiftDate(leg.date, 1)];
  let lastError = null;
  for (const [i, d] of dates.entries()) {
    try {
      const events = await fetchScoreboard(leg.league, d, i === 0 ? opts : { ...opts, fresh: false });
      const game = findGame(events, leg);
      if (game) return { game };
    } catch (e) {
      lastError = e;
    }
  }
  return { game: null, error: lastError };
}

export function clearCache() {
  cache.clear();
}
