import { findLegGame } from "./espn.js";
import { clearCache } from "./espn.js";
import { whereToWatch, watchText } from "./watch.js";
import { chronological, groupLegs } from "./order.js";
import { gradeLeg, weekStatus, seasonRecord, describeLeg, gameState } from "./grade.js";

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

function legHtml({ leg, game, grade, error }) {
  const label = RESULT_LABEL[grade.result] ?? grade.result;
  const badge = `<span class="pill ${grade.result}">${label}${grade.margin != null && grade.result !== "pending" ? ` (${grade.margin > 0 ? "+" : ""}${grade.margin.toFixed(1).replace(/\.0$/, "")})` : ""}</span>`;
  const head = `<div class="leg-top"><span class="pick">${esc(describeLeg(leg))}</span>${badge}</div>`;
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
  const showScore = state !== "scheduled";
  return `<div class="leg ${grade.result}">${head}
    <div class="matchup">
      ${teamHtml(away, "away", away === game.picked)}
      <div class="score">${showScore ? `${esc(away.score)} – ${esc(home.score)}` : "@"}</div>
      ${teamHtml(home, "home", home === game.picked)}
    </div>
    <div class="meta"><span>${status}</span>${watch ? `<span class="watch">📺 ${esc(watch)}</span>` : ""}</div>
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

function sectionsHtml(legs) {
  const g = groupLegs(legs);
  const sec = (key, title, items) =>
    items.length ? `<h3 class="sec ${key}">${title} <span class="muted">(${items.length})</span></h3><div class="legs">${items.map(legHtml).join("")}</div>` : "";
  return sec("live", "🔴 Live now", g.live) + sec("upcoming", "Upcoming", g.upcoming) + sec("final", "Final", g.final);
}

function parlayHtml(ev) {
  const w = ev.week;
  const money = [w.stake && `Stake ${esc(w.stake)}`, w.payout && `To win ${esc(w.payout)}`].filter(Boolean).join(" · ");
  return `<article class="parlay">
    <div class="parlay-head"><div><h2>${esc(w.label)}</h2>${money ? `<div class="muted">${money}</div>` : ""}</div><span class="pill ${ev.status}">${ev.status}</span></div>
    ${w.example ? `<div class="banner">Example data – edit <code>data/parlays.json</code> to enter the real parlay.</div>` : ""}
    ${statsHtml(ev)}
    ${sectionsHtml(ev.legs)}
  </article>`;
}

function historyHtml(ev) {
  return `<details class="hist-week"><summary><span>${esc(ev.week.label)}</span><span class="pill ${ev.status}">${ev.status}</span></summary>
    ${ev.legs.length ? `<div class="legs">${chronological(ev.legs).map(legHtml).join("")}</div>` : `<p class="muted pad">Leg details weren't recorded for this week.</p>`}</details>`;
}

function render() {
  const [current, ...past] = evaluated;
  $("current").innerHTML = current ? parlayHtml(current) : `<p class="muted">No parlays yet. Add one to <code>data/parlays.json</code>.</p>`;
  const rec = seasonRecord(evaluated.filter((e) => !e.week.example).map((e) => e.status));
  $("record").innerHTML = `<p class="record">Season record: <b>${rec.won}</b> won · <b>${rec.lost}</b> busted${rec.open ? ` · <b>${rec.open}</b> open` : ""}</p>`;
  $("history-wrap").hidden = past.length === 0;
  $("history").innerHTML = past.map(historyHtml).join("");
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
  await refresh();
}

main();
