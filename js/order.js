import { gameState } from "./grade.js";

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
