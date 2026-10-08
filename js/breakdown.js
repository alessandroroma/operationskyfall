// Pure rows for the breakdown tab: no DOM, no network.
const q = new URL(import.meta.url).search;
const [{ formatOdds, legOdds, describeLeg }, { chronological }] = await Promise.all([
  import(`./grade.js${q}`),
  import(`./order.js${q}`),
]);

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

export const TYPE_LABEL = {
  spread: "Spread",
  moneyline: "Moneyline",
  total_over: "Game total (over)",
  total_under: "Game total (under)",
  team_total_over: "Team total (over)",
  team_total_under: "Team total (under)",
  other: "Prop / other",
};

export function typeLabel(leg) {
  return TYPE_LABEL[leg.type] ?? leg.type ?? "\u2014";
}

// The number the leg is bet against, as it reads on a slip.
export function spreadText(leg) {
  const line = num(leg.line);
  if (line == null) return "\u2014";
  switch (leg.type) {
    case "spread":
      return sign(line);
    case "total_over":
    case "team_total_over":
      return `O ${line}`;
    case "total_under":
    case "team_total_under":
      return `U ${line}`;
    default:
      return "\u2014";
  }
}

export function pickText(leg) {
  if (leg.type === "total_over" || leg.type === "total_under") {
    return `${leg.team}${leg.opponent ? ` / ${leg.opponent}` : ""}`;
  }
  if (leg.type === "other") return describeLeg(leg);
  return leg.team ?? "\u2014";
}

// Short price for a leg: its own odds, or the shared price of its same-game group.
export function oddsText(leg, week) {
  const ownOdds = formatOdds(leg.odds);
  if (ownOdds) return ownOdds;
  if (leg.group) return formatOdds(week?.groups?.[leg.group]?.odds) || "\u2014";
  return "\u2014";
}

// "how much it won or lost by" \u2014 points versus the number, for the graded leg.
export function outcomeText(result, margin) {
  if (margin == null || !Number.isFinite(margin)) return "\u2014";
  const abs = Math.abs(margin).toFixed(1).replace(/\.0$/, "");
  if (margin === 0) return "on the number (push)";
  if (result === "live_on_track") return `up ${abs} (live)`;
  if (result === "live_off_track") return `down ${abs} (live)`;
  if (result === "live_push") return "level (live)";
  return margin > 0 ? `won by ${abs}` : `lost by ${abs}`;
}

// One row per leg across every week, newest week first, kickoff order inside a week.
export function breakdownRows(evaluated) {
  const rows = [];
  for (const ev of evaluated) {
    for (const l of chronological(ev.legs ?? [])) {
      const result = l.grade?.result ?? "unknown";
      const margin = l.grade?.margin ?? null;
      rows.push({
        weekId: ev.week.id,
        week: ev.week.label,
        weekOf: ev.week.weekOf,
        weekStatus: ev.status,
        by: l.leg.by ?? "",
        bet: describeLeg(l.leg),
        pick: pickText(l.leg),
        note: l.leg.note ?? "",
        type: typeLabel(l.leg),
        spread: spreadText(l.leg),
        line: num(l.leg.line),
        odds: oddsText(l.leg, ev.week),
        oddsValue: num(formatOdds(l.leg.odds) ? l.leg.odds : ev.week.groups?.[l.leg.group]?.odds),
        oddsFull: legOdds(l.leg, ev.week),
        result,
        margin,
        outcome: outcomeText(result, margin),
      });
    }
  }
  return rows;
}

// Filter rows to one contributor; "all" (or empty) keeps everything.
export function filterRows(rows, who) {
  if (!who || who === "all") return rows;
  return rows.filter((r) => r.by === who);
}

// Week 2.5 is excluded from these rankings; manual props have no numeric margin.
export function marginLeaders(rows) {
  const eligible = rows.filter((row) => row.weekId !== "2026-w2-5");
  const wins = eligible.filter((row) => row.result === "hit" && Number.isFinite(row.margin) && row.margin > 0);
  const losses = eligible.filter((row) => row.result === "miss" && Number.isFinite(row.margin) && row.margin < 0);
  return {
    bestWins: [...wins].sort((a, b) => b.margin - a.margin).slice(0, 5),
    worstLosses: [...losses].sort((a, b) => a.margin - b.margin).slice(0, 5),
    worstBeats: [...losses].sort((a, b) => b.margin - a.margin).slice(0, 5),
  };
}

// First-appearance list of contributors, for the filter chips.
export function contributors(rows) {
  const seen = new Set();
  for (const r of rows) if (r.by) seen.add(r.by);
  return [...seen];
}

export function personTotals(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.by) continue;
    if (!map.has(r.by)) map.set(r.by, { name: r.by, hit: 0, miss: 0, push: 0, live: 0, pending: 0, unknown: 0, total: 0, lineSum: 0, lineCount: 0, missMarginSum: 0, missCount: 0 });
    const p = map.get(r.by);
    p.total++;
    if (r.oddsValue != null && r.oddsValue !== 0 && Number.isFinite(r.oddsValue)) { p.lineSum += r.oddsValue; p.lineCount++; }
    if (r.result === "hit") {
      p.hit++;
    } else if (r.result === "miss") {
      p.miss++;
      const m = r.margin;
      if (m != null && Number.isFinite(m)) { p.missMarginSum += Math.abs(m); p.missCount++; }
    } else if (r.result === "push") {
      p.push++;
    } else if (String(r.result).startsWith("live")) {
      p.live++;
    } else if (r.result === "unknown") {
      p.unknown++;
    } else {
      p.pending++;
    }
  }
  for (const p of map.values()) {
    p.avgLine = p.lineCount > 0 ? p.lineSum / p.lineCount : null;
    p.avgMiss = p.missCount > 0 ? p.missMarginSum / p.missCount : null;
  }
  return [...map.values()].sort((a, b) => b.hit - a.hit || a.miss - b.miss || a.name.localeCompare(b.name));
}

export const ODDS_BANDS = [
  "-200 or worse", "-150 to -200", "-120 to -150", "+100 to -120",
  "+100 to +125", "+125 to +200", "+200 or better",
];

// American prices have no values between -100 and +100. Shared endpoints go
// into one band only: -200 first, -150 second, -120 third, +100 fourth,
// +125 fifth, and +200 last.
export function oddsBandIndex(value) {
  const odds = num(value);
  if (odds == null || Math.abs(odds) < 100) return null;
  if (odds <= -200) return 0;
  if (odds <= -150) return 1;
  if (odds <= -120) return 2;
  if (odds <= 100) return 3;
  if (odds <= 125) return 4;
  if (odds < 200) return 5;
  return 6;
}

export function resultsByOdds(rows) {
  const people = personTotals(rows).map((p) => ({
    name: p.name,
    records: ODDS_BANDS.map(() => ({ wins: 0, losses: 0 })),
  }));
  const byName = new Map(people.map((p) => [p.name, p]));
  for (const row of rows) {
    if (row.result !== "hit" && row.result !== "miss") continue;
    const band = oddsBandIndex(row.oddsValue);
    const person = byName.get(row.by);
    if (band == null || !person) continue;
    if (row.result === "hit") person.records[band].wins++;
    else person.records[band].losses++;
  }
  return people;
}

export function decimalOdds(value) {
  const odds = num(value);
  if (odds == null || Math.abs(odds) < 100) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function bettingWar(rows) {
  const people = personTotals(rows).map((p) => ({
    name: p.name, expected: 0, earned: 0, delta: 0,
  }));
  const byName = new Map(people.map((p) => [p.name, p]));
  for (const row of rows) {
    const person = byName.get(row.by);
    const decimal = decimalOdds(row.oddsValue);
    if (!person || decimal == null) continue;
    person.expected += 1 / decimal;
    if (row.result === "hit") person.earned += decimal - 1;
  }
  for (const person of people) person.delta = person.earned - person.expected;
  return people;
}

// Weekly deltas use the same per-leg math as the all-weeks Betting War table.
// null means that person had no recorded leg in that week (distinct from 0).
export function warByWeek(rows) {
  const people = personTotals(rows).map((p) => p.name);
  const weeks = new Map();
  for (const row of rows) {
    if (!weeks.has(row.weekId)) weeks.set(row.weekId, {
      id: row.weekId, label: row.week, weekOf: row.weekOf, rows: [],
    });
    weeks.get(row.weekId).rows.push(row);
  }
  return {
    people,
    weeks: [...weeks.values()]
      .sort((a, b) => String(a.weekOf).localeCompare(String(b.weekOf)) || String(a.id).localeCompare(String(b.id)))
      .map((week) => {
        const deltas = new Map(bettingWar(week.rows).map((p) => [p.name, p.delta]));
        return {
          id: week.id, label: week.label, weekOf: week.weekOf,
          values: people.map((name) => deltas.get(name) ?? null),
        };
      }),
  };
}

export function cumulativeWarByWeek(rows) {
  const { people, weeks } = warByWeek(rows);
  const running = people.map(() => 0);
  return {
    people,
    weeks: [
      { id: "war-start", label: "Week 0", weekOf: null, values: people.map(() => 0) },
      // Weeks with no attributed legs (such as Week 2.5) have no person's WAR to plot.
      ...weeks.filter((week) => week.values.some((value) => value !== null)).map((week) => ({
        id: week.id, label: week.label, weekOf: week.weekOf,
        values: week.values.map((delta, i) => (running[i] += delta ?? 0)),
      })),
    ],
  };
}

// First $ amount in a free-text money field ("$4,333.35 (incl. ...)" -> 4333.35).
export function money(value) {
  const m = /(\$)\s*([\d,]+(?:\.\d+)?)/.exec(String(value ?? ""));
  if (!m) return null;
  const n = Number(m[2].replaceAll(",", ""));
  return Number.isFinite(n) ? n : null;
}

export function fmtMoney(n) {
  if (n == null) return "\u2014";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNet(n) {
  if (n == null) return "\u2014";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// What a week put in and handed back. Falls back to the payout when a settled week
// has no explicit "returned" field, and to $0 for a busted parlay.
export function weekMoney(week, status) {
  const stake = money(week.stake);
  let returned = money(week.returned);
  if (returned == null) {
    if (status === "BUSTED") returned = 0;
    else if (status === "WON") returned = money(week.payout);
  }
  const net = stake != null && returned != null ? returned - stake : null;
  return { label: week.label, status, stake, returned, net };
}

export function seasonMoney(evaluated) {
  const weeks = evaluated.filter((e) => !e.week.example).map((e) => weekMoney(e.week, e.status));
  const sum = (key) => (weeks.every((w) => w[key] == null) ? null : weeks.reduce((t, w) => t + (w[key] ?? 0), 0));
  return { weeks, stake: sum("stake"), returned: sum("returned"), net: sum("net") };
}
