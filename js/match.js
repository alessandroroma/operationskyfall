// Team-name matching between what a person typed in parlays.json and ESPN's team objects.

export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 3 = exact match on any ESPN name field, 2 = query is a whole-word run inside the
// display name (e.g. "buckeyes"), 0 = no match.
export function teamScore(query, team) {
  const q = norm(query);
  if (!q || !team) return 0;
  const exact = [team.abbreviation, team.displayName, team.shortDisplayName, team.location, team.name]
    .map(norm)
    .filter(Boolean);
  if (exact.includes(q)) return 3;
  const display = ` ${norm(team.displayName)} `;
  if (q.length >= 4 && display.includes(` ${q} `)) return 2;
  return 0;
}

// Find the game in `events` (ESPN scoreboard events) that the leg refers to.
// Returns { event, picked, other } or null.
export function findGame(events, leg) {
  let best = null;
  for (const event of events ?? []) {
    const comps = event?.competitions?.[0]?.competitors ?? [];
    if (comps.length !== 2) continue;
    for (let i = 0; i < 2; i++) {
      const picked = comps[i];
      const other = comps[1 - i];
      let score = teamScore(leg.team, picked.team);
      if (!score) continue;
      if (leg.opponent) {
        const o = teamScore(leg.opponent, other.team);
        if (!o) continue;
        score += o / 10;
      }
      if (!best || score > best.score) best = { score, event, picked, other };
    }
  }
  return best ? { event: best.event, picked: best.picked, other: best.other } : null;
}
