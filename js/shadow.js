// Shadow Book accounting is deliberately separate from the group's slips and WAR.
export function decimalOdds(american) {
  const odds = Number(american);
  if (!Number.isFinite(odds) || odds === 0) throw new Error(`Invalid American odds: ${american}`);
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
}

export function shadowQuote(week, results = null) {
  const stake = Number(week.stake);
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Shadow stake must be positive");
  if (!week.legs?.length) throw new Error("Shadow parlay has no legs");
  if (results && results.length !== week.legs.length) throw new Error("Shadow results do not match legs");
  const multiplier = week.legs.reduce((product, leg, index) =>
    product * (results?.[index] === "push" ? 1 : decimalOdds(leg.odds)), 1);
  return { stake, multiplier, return: stake * multiplier, profit: stake * (multiplier - 1) };
}

export function shadowSeason(evaluated) {
  const settled = evaluated.filter((ev) => ev.status === "WON" || ev.status === "BUSTED" || ev.status === "VOID");
  const staked = settled.reduce((sum, ev) => sum + Number(ev.week.stake), 0);
  const returned = settled.reduce((sum, ev) => sum + (ev.status === "WON"
    ? shadowQuote(ev.week, ev.legs.map((l) => l.grade.result)).return
    : ev.status === "VOID" ? Number(ev.week.stake) : 0), 0);
  return { staked, returned, net: returned - staked };
}
