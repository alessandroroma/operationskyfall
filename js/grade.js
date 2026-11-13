// Pure grading logic: no DOM, no network.

export const TYPES = ["spread", "moneyline", "total_over", "total_under", "team_total_over", "team_total_under", "other"];

export function gameState(event) {
  const s = event?.status?.type;
  if (!s) return "unknown";
  if (s.state === "post" || s.completed) return "final";
  if (s.state === "in") return "live";
  return "scheduled";
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Positive = the leg is winning, 0 = push, negative = losing (based on current score).
export function legMargin(leg, pickedScore, otherScore) {
  const p = num(pickedScore);
  const o = num(otherScore);
  const line = num(leg.line);
  switch (leg.type) {
    case "spread":
      return p + line - o;
    case "moneyline":
      return p - o;
    case "total_over":
      return p + o - line;
    case "total_under":
      return line - (p + o);
    case "team_total_over":
      return p - line;
    case "team_total_under":
      return line - p;
    default:
      return null;
  }
}

const MANUAL = new Set(["hit", "miss", "push"]);

// result: pending | live_on_track | live_off_track | live_push | hit | miss | push | unknown
export function gradeLeg(leg, game) {
  if (MANUAL.has(leg.result)) return { result: leg.result, margin: null, state: "manual" };
  if (!game) return { result: "unknown", margin: null, state: "unknown" };
  const state = gameState(game.event);
  if (state === "scheduled" || state === "unknown") return { result: "pending", margin: null, state };
  if (leg.type === "other") return { result: "unknown", margin: null, state };
  const margin = legMargin(leg, game.picked.score, game.other.score);
  if (state === "live") {
    const result = margin > 0 ? "live_on_track" : margin < 0 ? "live_off_track" : "live_push";
    return { result, margin, state };
  }
  return { result: margin > 0 ? "hit" : margin < 0 ? "miss" : "push", margin, state };
}

// results: array of gradeLeg().result strings.
// status: BUSTED (any miss) | WON (everything final, at least one hit) | VOID (all pushed) | ALIVE
export function parlayStatus(results) {
  const c = { hit: 0, miss: 0, push: 0, live: 0, pending: 0, unknown: 0, total: results.length };
  for (const r of results) {
    if (r === "hit") c.hit++;
    else if (r === "miss") c.miss++;
    else if (r === "push") c.push++;
    else if (r.startsWith("live")) c.live++;
    else if (r === "unknown") c.unknown++;
    else c.pending++;
  }
  let status = "ALIVE";
  if (c.miss > 0) status = "BUSTED";
  else if (c.live === 0 && c.pending === 0 && c.unknown === 0 && c.total > 0) {
    status = c.hit > 0 ? "WON" : "VOID";
  }
  return { status, counts: c };
}

export function seasonRecord(statuses) {
  return {
    won: statuses.filter((s) => s === "WON").length,
    lost: statuses.filter((s) => s === "BUSTED").length,
    open: statuses.filter((s) => s === "ALIVE").length,
  };
}

export function describeLeg(leg) {
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  switch (leg.type) {
    case "spread":
      return `${leg.team} ${sign(Number(leg.line))}`;
    case "moneyline":
      return `${leg.team} ML`;
    case "total_over":
      return `Over ${leg.line} (${leg.team}${leg.opponent ? ` / ${leg.opponent}` : ""})`;
    case "total_under":
      return `Under ${leg.line} (${leg.team}${leg.opponent ? ` / ${leg.opponent}` : ""})`;
    case "team_total_over":
      return `${leg.team} Over ${leg.line} pts`;
    case "team_total_under":
      return `${leg.team} Under ${leg.line} pts`;
    default:
      return `${leg.team}${leg.note ? ` – ${leg.note}` : ""}`;
  }
}

// A week can carry a manual `result` ("WON" | "BUSTED" | "VOID") for parlays whose legs
// weren't recorded; otherwise the status is computed from the legs.
export function weekStatus(week, results) {
  const computed = parlayStatus(results);
  const manual = String(week?.result ?? "").toUpperCase();
  if (["WON", "BUSTED", "VOID"].includes(manual)) return { ...computed, status: manual };
  return computed;
}

// Per-contributor tally. legs: [{ leg: { by }, result }]; people keep first-appearance order.
export function byContributor(legs) {
  const map = new Map();
  for (const { leg, result } of legs) {
    const name = leg.by;
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, hit: 0, miss: 0, push: 0, live: 0, pending: 0, unknown: 0, total: 0 });
    const c = map.get(name);
    c.total++;
    if (result === "hit") c.hit++;
    else if (result === "miss") c.miss++;
    else if (result === "push") c.push++;
    else if (result.startsWith("live")) c.live++;
    else if (result === "unknown") c.unknown++;
    else c.pending++;
  }
  return [...map.values()];
}

export function formatOdds(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "";
  return v > 0 ? `+${v}` : `${v}`;
}

const decimalFromAmerican = (odds) => {
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return null;
  return o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
};

const americanFromDecimal = (d) => {
  if (!Number.isFinite(d) || d <= 1) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
};

// A group leg without its own price doesn't get credited with the group's full combined
// price (that would double-count a 2-leg SGP's price once per leg) - it gets an even split
// of the group's decimal odds across the group's legs that also lack their own price.
// A leg that does carry its own price keeps it, and only the remainder is split across
// the rest. Needs the week's full `legs` list to find this leg's group siblings.
export function splitGroupOdds(leg, week) {
  // A merged multi-leg bet (order.js's mergeGroups) already is one bet at the group's
  // own combined price - nothing to split, that fallback is for still-separate legs.
  if (!leg.group || leg.merged) return null;
  const groupDecimal = decimalFromAmerican(week?.groups?.[leg.group]?.odds);
  if (groupDecimal == null) return null;
  const siblings = (week?.legs ?? []).filter((l) => l.group === leg.group);
  let knownDecimal = 1;
  let unpriced = 0;
  for (const s of siblings) {
    const d = decimalFromAmerican(s.odds);
    if (d != null) knownDecimal *= d;
    else unpriced++;
  }
  if (unpriced === 0) return null;
  return americanFromDecimal(Math.pow(groupDecimal / knownDecimal, 1 / unpriced));
}

// Odds label for a leg: its own price, or its same-game-parlay group's price - split
// evenly across unpriced siblings when the week's leg list resolves them, otherwise the
// group's raw combined price as a fallback.
export function legOdds(leg, week) {
  const ownOdds = formatOdds(leg.odds);
  if (ownOdds) return ownOdds;
  if (leg.group) {
    const g = week?.groups?.[leg.group];
    const o = formatOdds(splitGroupOdds(leg, week) ?? g?.odds);
    return o ? `${g?.label ?? "Group"} ${o}` : "";
  }
  return "";
}
