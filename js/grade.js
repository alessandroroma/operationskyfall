// Pure grading logic: no DOM, no network.

export const TYPES = ["spread", "moneyline", "total_over", "total_under", "other"];

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
