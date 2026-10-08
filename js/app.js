// Sibling modules are loaded with the same ?v= query as this file so a fresh deploy is never mixed with cached parts.
const q = new URL(import.meta.url).search;
const [{ findLegGame, clearCache }, { whereToWatch, watchText, gameLink }, { chronological, groupLegs }, { gradeLeg, weekStatus, seasonRecord, describeLeg, gameState, byContributor, legOdds }, { breakdownRows, filterRows, contributors: peopleIn, personTotals, resultsByOdds, ODDS_BANDS, bettingWar, cumulativeWarByWeek, seasonMoney, fmtMoney, fmtNet }] =
  await Promise.all([import(`./espn.js${q}`), import(`./watch.js${q}`), import(`./order.js${q}`), import(`./grade.js${q}`), import(`./breakdown.js${q}`)]);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const RESULT_LABEL = {
  pending: "Pending", live_on_track: "Covering", live_off_track: "Not covering", live_push: "On the number",
  hit: "HIT", miss: "MISS", push: "PUSH", unknown: "No data",
};

let data = null;
let evaluated = []; // [{week, legs:[{leg, game, grade, error}], status, counts}]
let refreshTimer = null;
const frozen = new Map(); // week id -> evaluation once every leg is final (no need to refetch)

async function evaluateWeek(week) {
  const legs = await Promise.all(
    (week.legs ?? []).map(async (leg) => {
      const { game, error } = await findLegGame(leg);
      return { leg, game, grade: gradeLeg(leg, game), error };
    })
  );
  const { status, counts } = weekStatus(week, legs.map((l) => l.grade.result));
  return { week, legs, status, counts };
}

function fmtKickoff(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function countdown(iso) {
  const ms = new Date(iso) - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "starting…";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function teamHtml(c, cls, picked) {
  const t = c.team;
  return `<div class="team ${cls}${picked ? " picked" : ""}">${cls === "away" && t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ""}<span class="name">${esc(t.displayName)}</span>${cls === "home" && t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ""}</div>`;
}

function legHtml({ leg, game, grade, error }, week) {
  const label = grade.result === "live_push" && leg.type === "moneyline" ? "Tied" : (RESULT_LABEL[grade.result] ?? grade.result);
  const badge = `<span class="pill ${grade.result}">${label}${grade.margin != null && grade.result !== "pending" ? ` (${grade.margin > 0 ? "+" : ""}${grade.margin.toFixed(1).replace(/\.0$/, "")})` : ""}</span>`;
  const head = `<div class="leg-top"><span class="pick">${esc(describeLeg(leg))}${leg.by ? ` <span class="by">${esc(leg.by)}</span>` : ""}${legOdds(leg, week) ? ` <span class="odds">${esc(legOdds(leg, week))}</span>` : ""}</span>${badge}</div>`;
  if (!game) {
    return `<div class="leg unknown">${head}<div class="meta"><span class="error">Game not found for ${esc(leg.team)} on ${esc(leg.date)}${error ? " (ESPN unreachable?)" : ""}</span></div></div>`;
  }
  const ev = game.event;
  const comps = ev.competitions[0].competitors;
  const away = comps.find((c) => c.homeAway === "away") ?? comps[0];
  const home = comps.find((c) => c.homeAway === "home") ?? comps[1];
  const state = gameState(ev);
  const st = ev.status.type;
  let status = "";
  if (state === "scheduled") status = `Kickoff ${esc(fmtKickoff(ev.date))} · <span data-kickoff="${esc(ev.date)}">${esc(countdown(ev.date))}</span>`;
  else if (state === "live") status = `<span class="live-dot">● LIVE</span> ${esc(st.shortDetail || st.detail || "")}`;
  else status = esc(st.shortDetail || "Final");
  const watch = state === "final" ? "" : watchText(whereToWatch(ev));
  const link = gameLink(ev);
  const showScore = state !== "scheduled";
  return `<div class="leg ${grade.result}">${head}
    ${link ? `<a class="matchup" href="${esc(link)}" target="_blank" rel="noopener noreferrer" title="Open on ESPN">` : `<div class="matchup">`}
      ${teamHtml(away, "away", away === game.picked)}
      <div class="score">${showScore ? `${esc(away.score)} – ${esc(home.score)}` : "@"}</div>
      ${teamHtml(home, "home", home === game.picked)}
    ${link ? `</a>` : `</div>`}
    <div class="meta"><span>${status}${link ? ` · <a class="gc" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Gamecast ↗</a>` : ""}</span>${watch ? `<span class="watch">📺 ${esc(watch)}</span>` : ""}</div>
    ${leg.note ? `<div class="meta"><span>${esc(leg.note)}</span></div>` : ""}
  </div>`;
}

function statsHtml(ev) {
  const c = ev.counts;
  const next = ev.legs
    .filter((l) => l.game && gameState(l.game.event) === "scheduled")
    .map((l) => l.game.event.date)
    .sort()[0];
  return `<div class="stats">
    <span><b>${c.hit}</b>/${c.total} hit</span>
    ${c.live ? `<span><b>${c.live}</b> live</span>` : ""}
    ${c.pending ? `<span><b>${c.pending}</b> pending</span>` : ""}
    ${c.push ? `<span><b>${c.push}</b> push</span>` : ""}
    ${c.miss ? `<span><b>${c.miss}</b> missed</span>` : ""}
    ${c.unknown ? `<span><b>${c.unknown}</b> unresolved</span>` : ""}
    ${next ? `<span>Next kickoff: <b>${esc(fmtKickoff(next))}</b> (<span data-kickoff="${esc(next)}">${esc(countdown(next))}</span>)</span>` : ""}
  </div>`;
}

function sectionsHtml(legs, week) {
  const g = groupLegs(legs);
  const sec = (key, title, items) =>
    items.length ? `<h3 class="sec ${key}">${title} <span class="muted">(${items.length})</span></h3><div class="legs">${items.map((l) => legHtml(l, week)).join("")}</div>` : "";
  return sec("live", "🔴 Live now", g.live) + sec("upcoming", "Upcoming", g.upcoming) + sec("final", "Final", g.final);
}

function contributorsHtml(ev) {
  const rows = byContributor(ev.legs.map((l) => ({ leg: l.leg, result: l.grade.result })));
  if (!rows.length) return "";
  const chip = (c) => {
    const cls = c.miss ? "miss" : c.hit === c.total ? "hit" : "";
    const parts = [c.hit && `${c.hit}✓`, c.miss && `${c.miss}✗`, c.push && `${c.push} push`, c.live && `${c.live} live`, c.pending && `${c.pending} pending`, c.unknown && `${c.unknown} ?`].filter(Boolean);
    return `<span class="chip ${cls}"><b>${esc(c.name)}</b> ${parts.join(" ")}</span>`;
  };
  return `<div class="contrib">${rows.map(chip).join("")}</div>`;
}

// ---- Breakdown tab: one table across every week ------------------------------

let breakdownWho = "all";

function pill(result) {
  return `<span class="pill ${esc(result)}">${esc(RESULT_LABEL[result] ?? result)}</span>`;
}

function breakdownRowHtml(r) {
  return `<tr class="${esc(r.result)}">
    <td class="wk">${esc(r.week)}</td>
    <td>${r.by ? esc(r.by) : "—"}</td>
    <td class="pick-cell">${esc(r.pick)}${r.note ? `<span class="tiny">${esc(r.note)}</span>` : ""}</td>
    <td>${esc(r.type)}</td>
    <td class="num">${esc(r.spread)}</td>
    <td class="num"${r.oddsFull ? ` title="${esc(r.oddsFull)}"` : ""}>${esc(r.odds)}</td>
    <td>${pill(r.result)}</td>
    <td class="num ${esc(r.result)}">${esc(r.outcome)}</td>
  </tr>`;
}

function legTableHtml(rows) {
  return `<div class="table-wrap"><table class="bd">
    <thead><tr><th>Week</th><th>Who</th><th>Pick</th><th>Bet type</th><th class="num">Spread</th><th class="num">Odds</th><th>Result</th><th class="num">Won/lost by</th></tr></thead>
    <tbody>${rows.map(breakdownRowHtml).join("")}</tbody>
  </table></div>`;
}

function personTableHtml(rows) {
  const totals = personTotals(rows);
  if (!totals.length) return "";
  const fmt = (n) => {
    if (n == null) return "—";
    return n.toFixed(1);
  };
  const body = totals.map((p) => {
    const settled = p.hit + p.miss;
    const pct = settled ? `${Math.round((p.hit / settled) * 100)}%` : "—";
    return `<tr><td class="wk">${esc(p.name)}</td><td class="num">${p.total}</td><td class="num hit">${p.hit}</td><td class="num miss">${p.miss}</td><td class="num">${p.push}</td><td class="num">${p.live + p.pending + p.unknown}</td><td class="num">${pct}</td><td class="num">${p.avgLine > 0 ? "+" : ""}${fmt(p.avgLine)}</td><td class="num">${fmt(p.avgMiss)}</td></tr>`;
  }).join("");
  return `<h3 class="bd">By person (all weeks)</h3><div class="table-wrap"><table class="bd">
    <thead><tr><th>Who</th><th class="num">Legs</th><th class="num">Hit</th><th class="num">Miss</th><th class="num">Push</th><th class="num">Open</th><th class="num">Hit rate</th><th class="num">Avg line</th><th class="num">Avg miss</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div><p class="muted">Avg line: mean American odds for each pick with a listed price, including open picks; same-game legs use their own price when listed, otherwise the shared group price. Avg miss: mean points short on misses with a measured margin; manual props without one are excluded.</p>`;
}

function oddsResultsTableHtml(rows) {
  const people = resultsByOdds(rows);
  if (!people.length) return "";
  const headers = ODDS_BANDS.map((label) => `<th class="num">${esc(label)}</th>`).join("");
  const body = people.map((person) => `<tr><td class="wk">${esc(person.name)}</td>${person.records.map((record) => `<td class="num">${record.wins || record.losses ? `${record.wins}-${record.losses}` : ""}</td>`).join("")}</tr>`).join("");
  return `<h3 class="bd">Results by odds</h3><div class="table-wrap"><table class="bd">
    <thead><tr><th>Who</th>${headers}</tr></thead>
    <tbody>${body}</tbody>
  </table></div><p class="muted">Records are wins-losses for settled legs only. Pushes and open legs are excluded; SGP legs without their own odds use the shared SGP price. Boundary odds count once: -200 in the first band, -150 in the second, -120 in the third, +100 in the fourth, +125 in the fifth, and +200 in the last.</p>`;
}

function bettingWarTableHtml(rows) {
  const people = bettingWar(rows);
  if (!people.length) return "";
  const body = people.map((person) => `<tr><td class="wk">${esc(person.name)}</td><td class="num">${person.expected.toFixed(2)}</td><td class="num">${person.earned.toFixed(2)}</td><td class="num ${person.delta > 0 ? "won" : person.delta < 0 ? "lost" : ""}">${person.delta > 0 ? "+" : ""}${person.delta.toFixed(2)}</td></tr>`).join("");
  return `<h3 class="bd">Betting War</h3><div class="table-wrap"><table class="bd">
    <thead><tr><th>Who</th><th class="num">Expected Value</th><th class="num">Earned Value</th><th class="num">Delta EV</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div><p class="muted">Expected Value sums 1 ÷ decimal odds for every priced leg. Earned Value adds decimal odds for wins and subtracts 1 for losses; pushes and open legs add zero. Delta EV = Earned Value − Expected Value. SGP legs use their own odds when listed, otherwise the shared price.</p>`;
}

const WAR_COLORS = ["#58a6ff", "#ff7b72", "#3fb950", "#d29922", "#bc8cff", "#39c5cf", "#ffa657"];

function warByWeekHtml(rows) {
  const { people, weeks } = cumulativeWarByWeek(rows);
  if (!people.length || !weeks.length) return "";
  const left = 48, top = 25, plotHeight = 220, groupWidth = 140;
  const width = left + weeks.length * groupWidth + 20, height = top + plotHeight + 42;
  const baseline = top + plotHeight / 2;
  const values = weeks.flatMap((week) => week.values);
  const bound = Math.max(1, Math.ceil(Math.max(0, ...values.map(Math.abs))));
  const y = (value) => baseline - value * plotHeight / (2 * bound);
  const ticks = [-bound, -bound / 2, 0, bound / 2, bound].map((value) => {
    const yy = y(value);
    return `<line x1="${left}" y1="${yy}" x2="${width - 12}" y2="${yy}" class="war-grid${value === 0 ? " zero" : ""}"/><text x="${left - 8}" y="${yy + 4}" text-anchor="end" class="war-axis">${value > 0 ? "+" : ""}${Number(value.toFixed(1))}</text>`;
  }).join("");
  const weekLabels = weeks.map((week, i) => `<text x="${left + (i + 0.5) * groupWidth}" y="${height - 13}" text-anchor="middle" class="war-axis week">${esc(week.label)}</text>`).join("");
  const lines = people.map((name, j) => {
    const color = WAR_COLORS[j % WAR_COLORS.length];
    const points = weeks.map((week, i) => ({
      x: left + (i + 0.5) * groupWidth,
      y: y(week.values[j]),
      value: week.values[j],
      week: week.label,
    }));
    const path = points.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" ");
    const markers = points.map((point) => {
      const label = `${point.week} · ${name}: ${point.value > 0 ? "+" : ""}${point.value.toFixed(2)} cumulative delta EV`;
      return `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" stroke="#0d1117" stroke-width="1.5" tabindex="0" aria-label="${esc(label)}"><title>${esc(label)}</title></circle>`;
    }).join("");
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${markers}`;
  }).join("");
  const legend = people.map((name, i) => `<span><i style="background:${WAR_COLORS[i % WAR_COLORS.length]}"></i>${esc(name)}</span>`).join("");
  return `<h3 class="bd">WAR by week</h3><div class="war-chart-wrap"><svg class="war-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Cumulative Delta EV through each week for each person">${ticks}${weekLabels}${lines}</svg></div><div class="war-legend">${legend}</div><p class="muted">Each point sums that person's Delta EV through that week, using the Betting War calculation. Weeks without a bet carry the prior total forward. Hover or focus a point for its value.</p>`;
}

function moneyTableHtml(season) {
  const rows = season.weeks.map((w) => `<tr><td class="wk">${esc(w.label)}</td><td class="num">${esc(fmtMoney(w.stake))}</td><td class="num">${esc(fmtMoney(w.returned))}</td><td class="num ${w.net > 0 ? "won" : w.net < 0 ? "lost" : ""}">${esc(fmtNet(w.net))}</td></tr>`).join("");
  return `<h3 class="bd">Per week</h3><div class="table-wrap"><table class="bd">
    <thead><tr><th>Week</th><th class="num">Staked</th><th class="num">Returned</th><th class="num">Net</th></tr></thead>
    <tbody>${rows}<tr><td class="wk">Season</td><td class="num">${esc(fmtMoney(season.stake))}</td><td class="num">${esc(fmtMoney(season.returned))}</td><td class="num ${season.net > 0 ? "won" : season.net < 0 ? "lost" : ""}">${esc(fmtNet(season.net))}</td></tr></tbody>
  </table></div>`;
}

function breakdownHtml(everyLegOpen = false) {
  const all = breakdownRows(evaluated);
  if (!all.length) return `<p class="muted">No legs recorded yet. Add a week to <code>data/parlays.json</code>.</p>`;
  const people = peopleIn(all);
  const chips = ["all", ...people]
    .map((who) => `<button class="chip${breakdownWho === who ? " on" : ""}" data-by="${esc(who)}">${esc(who === "all" ? "All" : who)}</button>`)
    .join("");
  const shown = filterRows(all, breakdownWho);
  const rows = shown.length ? legTableHtml(shown) : `<p class="muted">No legs for ${esc(breakdownWho)}.</p>`;
  return `<div class="bd-head">
      <div class="bd-filters" role="group" aria-label="Filter by who picked it">${chips}</div>
    </div>
    <div class="money-line">Season: staked <b>${esc(fmtMoney(seasonMoney(evaluated).stake))}</b> · returned <b>${esc(fmtMoney(seasonMoney(evaluated).returned))}</b> · net <b class="${seasonMoney(evaluated).net > 0 ? "up" : seasonMoney(evaluated).net < 0 ? "down" : ""}">${esc(fmtNet(seasonMoney(evaluated).net))}</b></div>
    <details id="every-leg-details" class="every-leg"${everyLegOpen ? " open" : ""}>
      <summary>Every leg${breakdownWho === "all" ? "" : ` · ${esc(breakdownWho)}`} (${shown.length})</summary>
      ${rows}
    </details>
    ${personTableHtml(all)}
    ${oddsResultsTableHtml(all)}
    ${bettingWarTableHtml(all)}
    ${warByWeekHtml(all)}
    ${moneyTableHtml(seasonMoney(evaluated))}`;
}

function renderBreakdown(resetEveryLeg = false) {
  const el = $("breakdown");
  if (el) el.innerHTML = breakdownHtml(!resetEveryLeg && $("every-leg-details")?.open === true);
}

function showTab(name) {
  const target = name === "breakdown" ? "breakdown" : "parlays";
  document.querySelectorAll("#tabs .tab").forEach((b) => {
    const on = b.dataset.tab === target;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", String(on));
  });
  $("view-parlays").hidden = target !== "parlays";
  $("view-breakdown").hidden = target !== "breakdown";
  renderBreakdown(target === "breakdown");
  tick();
}

function setupTabs() {
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) showTab(btn.dataset.tab);
  });
  $("breakdown").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-by]");
    if (!chip) return;
    breakdownWho = chip.dataset.by;
    renderBreakdown();
  });
  showTab(location.hash === "#breakdown" ? "breakdown" : "parlays");
}

function parlayHtml(ev) {
  const w = ev.week;
  const money = [w.stake && `Stake ${esc(w.stake)}`, w.payout && `To win ${esc(w.payout)}`, w.boost && esc(w.boost), w.returned && `Returned ${esc(w.returned)}`].filter(Boolean).join(" · ");
  return `<article class="parlay">
    <div class="parlay-head"><div><h2>${esc(w.label)}</h2>${money ? `<div class="muted">${money}</div>` : ""}${w.note ? `<div class="muted">${esc(w.note)}</div>` : ""}</div><span class="pill ${ev.status}">${ev.status}</span></div>
    ${w.example ? `<div class="banner">Example data – edit <code>data/parlays.json</code> to enter the real parlay.</div>` : ""}
    ${statsHtml(ev)}
    ${contributorsHtml(ev)}
    ${sectionsHtml(ev.legs, ev.week)}
  </article>`;
}

function historyHtml(ev) {
  return `<details class="hist-week"><summary><span>${esc(ev.week.label)}</span><span class="pill ${ev.status}">${ev.status}</span></summary>
    ${ev.week.note ? `<p class="muted pad">${esc(ev.week.note)}</p>` : ""}${contributorsHtml(ev)}
    ${ev.legs.length ? `<div class="legs">${chronological(ev.legs).map((l) => legHtml(l, ev.week)).join("")}</div>` : `<p class="muted pad">Leg details weren't recorded for this week.</p>`}</details>`;
}

function render() {
  const [current, ...past] = evaluated;
  $("current").innerHTML = current ? parlayHtml(current) : `<p class="muted">No parlays yet. Add one to <code>data/parlays.json</code>.</p>`;
  const rec = seasonRecord(evaluated.filter((e) => !e.week.example).map((e) => e.status));
  $("record").innerHTML = `<p class="record">Season record: <b>${rec.won}</b> won · <b>${rec.lost}</b> busted${rec.open ? ` · <b>${rec.open}</b> open` : ""}</p>`;
  $("history-wrap").hidden = past.length === 0;
  $("history").innerHTML = past.map(historyHtml).join("");
  renderBreakdown();
  tick();
}

function tick() {
  document.querySelectorAll("[data-kickoff]").forEach((el) => (el.textContent = countdown(el.dataset.kickoff)));
}

function anyLive() {
  return evaluated.some((e) => e.counts.live > 0);
}

async function refresh() {
  clearCache();
  try {
    evaluated = await Promise.all(
      data.weeks.map(async (week) => {
        if (frozen.has(week.id)) return frozen.get(week.id);
        const ev = await evaluateWeek(week);
        const c = ev.counts;
        if (c.live === 0 && c.pending === 0 && c.unknown === 0) frozen.set(week.id, ev);
        return ev;
      })
    );
    render();
    $("updated").textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    $("updated").innerHTML = `<span class="error">Update failed: ${esc(e.message)}</span>`;
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, anyLive() ? 30_000 : 300_000);
}

async function main() {
  try {
    const res = await fetch("data/parlays.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`parlays.json ${res.status}`);
    data = await res.json();
    data.weeks.sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)); // newest first
  } catch (e) {
    $("current").innerHTML = `<p class="error">Could not load data/parlays.json: ${esc(e.message)}</p>`;
    return;
  }
  setInterval(tick, 1000);
  setupTabs();
  await refresh();
}

main();
