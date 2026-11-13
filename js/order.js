const q = new URL(import.meta.url).search;
const { gameState, describeLeg } = await import(`./grade.js${q}`);

const kickoff = (l) => {
  const t = l.game?.event?.date ? new Date(l.game.event.date).getTime() : NaN;
  return Number.isNaN(t) ? Infinity : t;
};

// Sort legs by kickoff (stable), earliest first; legs without a game go last.
export function chronological(legs) {
  return legs
    .map((l, i) => [l, i])
    .sort((a, b) => kickoff(a[0]) - kickoff(b[0]) || a[1] - b[1])
    .map(([l]) => l);
}

// Collapse legs that share a same-game-parlay `group` into one entry, so a multi-leg
// SGP counts and displays as a single bet. Legs without a group pass through untouched.
export function mergeGroups(legs) {
  const merged = new Map(); // group key -> combined entry
  const out = [];
  for (const entry of legs) {
    const grp = entry.leg.group;
    if (!grp) {
      out.push(entry);
      continue;
    }
    if (!merged.has(grp)) {
      const combined = { leg: { ...entry.leg }, game: entry.game, grade: entry.grade, error: entry.error, parts: [entry] };
      merged.set(grp, combined);
      out.push(combined);
    } else {
      merged.get(grp).parts.push(entry);
    }
  }
  for (const combined of merged.values()) {
    if (combined.parts.length < 2) continue;
    combined.leg.team = combined.parts.map((p) => describeLeg(p.leg)).join(" + ");
    combined.leg.type = "group";
    combined.grade = combineResults(combined.parts.map((p) => p.grade.result));
    combined.error = combined.parts.find((p) => p.error)?.error ?? null;
    combined.game = combined.parts.find((p) => p.game)?.game ?? combined.game;
  }
  return out;
}

// AND the sub-results of a parlay group into one: any miss busts it, any unknown prop
// makes the whole thing unverifiable, otherwise it's as resolved as its least-resolved leg.
function combineResults(results) {
  let result;
  if (results.includes("miss")) result = "miss";
  else if (results.includes("unknown")) result = "unknown";
  else if (results.some((r) => r.startsWith("live")))
    result = results.includes("live_off_track") ? "live_off_track" : results.includes("live_push") ? "live_push" : "live_on_track";
  else if (results.includes("pending")) result = "pending";
  else result = results.every((r) => r === "push") ? "push" : "hit";
  return { result, margin: null, state: "group" };
}

// Split evaluated legs ({leg, game, grade}) into live / upcoming / final, each in kickoff order.
// A leg with no game found goes to upcoming (or final if it carries a manual result).
export function groupLegs(legs) {
  const groups = { live: [], upcoming: [], final: [] };
  for (const l of chronological(legs)) {
    const state = l.game ? gameState(l.game.event) : l.leg.result ? "final" : "scheduled";
    if (state === "live") groups.live.push(l);
    else if (state === "final") groups.final.push(l);
    else groups.upcoming.push(l);
  }
  return groups;
}
