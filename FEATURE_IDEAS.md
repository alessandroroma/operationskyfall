# Feature ideas

Brainstorm for Operation Skyfall. Nothing here is a commitment, and nothing here
reimplements what the Parlays / Breakdown / Shadow Book tabs already do.

**How to read an entry.** Effort is relative to this codebase:

- **small** — a pure function in `js/breakdown.js` (or a sibling) plus a table and a
  test. One sitting.
- **medium** — a new pure module, a chart or a new UI region, tests, and a README
  paragraph. A day or two.
- **large** — a new page, a vendored dependency, or a per-game fetch fan-out.

"Deps" names what the idea needs beyond the two JSON files. Anything needing a
server or a database is called out explicitly and parked in
[§9](#9-bigger-lifts--parked), not smuggled into an estimate.

## What the platform actually supports

Verified live against ESPN on 2026-11-14, because three ideas below live or die on
these details:

| Fact | Consequence |
| --- | --- |
| `site.api.espn.com` sends `access-control-allow-origin: *` on both `scoreboard` and `summary?event=<id>` | Browser-side fetching stays viable for both endpoints; no proxy needed |
| The **scoreboard** drops the `odds` block once a game is final | You cannot read a closing line off the scoreboard after the fact |
| **`summary?event=<id>` keeps `pickcenter[0]`** with `pointSpread`/`moneyline`/`total`, each carrying `open` **and** `close` (line + price), for games that finished weeks ago — confirmed on both NFL and CFB | Closing-line value is **backfillable** for all 156 historical legs, one request per game |
| `summary` also retains `scoringPlays` (each with `awayScore`, `homeScore`, `period`, `clock`), `winprobability` (~190 points/game), `againstTheSpread`, `drives`, `boxscore.teams[].statistics` (25 season stats), `injuries`, `lastFiveGames`, `standings` | Score-over-time reconstruction and matchup context are available without a scraper |
| Pre-kickoff scoreboard odds come from **one** provider (DraftKings), with `favoriteAtOpen` | No multi-book consensus; "the market" means DraftKings here, and the group bets bet365 — say so in any CLV copy |
| CFB competitors carry `curatedRank.current`; teams carry a numeric `team.conferenceId` (no conference name anywhere in the payload) | Rank splits are free; conference splits need a small static id→name map in `data/` |
| `weather` (`displayValue`, `temperature`) is on **upcoming** events only — 11/12 NFL and 56/56 CFB on the dates sampled — and is gone from both scoreboard and `summary.gameInfo` post-game | Weather analytics requires capture-at-entry; it can never be backfilled |
| `gameInfo.venue` (incl. `grass`, `indoor`, city/state) and `attendance` **are** retained post-game | Venue/surface splits are backfillable; weather is not |
| `sports.core.api.espn.com/.../probabilities` returns HTTP 400 "not supported for sport: football" | The core-API probability feed is a dead end; use `summary.winprobability` |

Current data footprint, for sample-size sanity: 13 real weeks, 156 legs, 8
contributors (Dalton 35, Roma 31, Paul 22, Mark 17, Vuke 15, Luke 10, Matt 9,
Jacob 6, plus 11 unattributed), 136 CFB vs 20 NFL, 62 distinct teams of which 42
were picked more than once. Bet types: 89 spread, 22 over, 19 moneyline, 13 under,
9 prop/other, 4 team total. Of the 89 spread legs, **64 lay points and only 25
take them**.

---

## 1. Analytics on data that is already in the repo

Everything in this section is a pure function over `breakdownRows` output plus the
ESPN game objects the app already fetches. No new data entry, no new endpoint.

### 1.1 Killshot Report

For every busted week, the chronologically first miss is the leg that killed the
slip; everything after it is an accessory. Rank people by kills, and weight each
kill by how many legs were still alive when it landed — killing a 13-leg slip on
the Thursday nightcap is a different crime from killing it on the last Sunday game.

*Why it fits:* this is the single most argued-about fact in any parlay group, it is
currently invisible on the site, and the ordering data is already in hand via
`chronological()` in `js/order.js`.
*Effort:* small–medium.
*Deps:* kickoff times (already loaded). One wrinkle to decide: legs kicking off at
the same time can't be ordered by kickoff, so either settle ties by game end and
accept the approximation, or mark a shared kill and say so in the footnote.

### 1.2 Survival curve per week

A step chart per week showing legs-still-alive against clock time across the
Thursday→Monday slate, so the moment a week died is a visible cliff rather than a
status pill.

*Why it fits:* weeks carry 10–14 legs spread over four days; "we were 9/10 going
into Sunday night" is the story the current UI can't tell.
*Effort:* medium.
*Deps:* ESPN kickoff times; a leg's *settle* time has to be approximated (kickoff +
~3.5h, or the first refresh where its state flipped to final). Label the
approximation in the chart footnote rather than implying precision.

### 1.3 Team report card

One row per team ever picked: times picked, record, net units, and which people
keep going back. Oklahoma State and Notre Dame have been picked 7 times each, Ohio
State and Michigan 6.

*Why it fits:* 42 teams have multiple picks, so "we have to stop betting Oklahoma
State" becomes a settled question instead of a vibe.
*Effort:* small.
*Deps:* none. Needs light name normalization so "Ole Miss" and "Mississippi
Rebels" merge — `norm()` in `js/match.js` already exists for exactly this, or key
off the resolved ESPN `team.id` when the game resolved.

### 1.4 Conference and rank splits (CFB)

Split CFB records by the picked team's conference and by rank bucket: ranked
favorite, ranked dog, unranked against a ranked team, unranked-vs-unranked.

*Why it fits:* 136 of 156 legs are college football, so this is where the volume
actually is, and the group's CFB picks swing from Ohio State to North Dakota State
to Portland State.
*Effort:* medium.
*Deps:* `curatedRank.current` and `team.conferenceId` are both on the scoreboard
competitor (verified). ESPN exposes no conference *name*, so ship a small static
`data/conferences.json` id→name map (the ~11 FBS ids plus FCS) rather than
fetching a lookup at page load.

### 1.5 Chalk index — favorite vs dog, laying vs taking

Split every priced leg by which side of the number it took, and give each person a
chalk index: share of legs laying points or at a negative price. The group-wide
baseline is already lopsided — 64 of 89 spread legs lay points, and the moneyline
legs skew to favorites (one is -305).

*Why it fits:* Betting War already rewards taking price; this shows who actually
does it, and whether the chalk is paying for itself.
*Effort:* small.
*Deps:* none — sign of `leg.line` and `leg.odds`, both in the JSON.

### 1.6 Totals calibration strip

For every over/under leg, plot the game's actual total minus the number as a dot
strip, overs and unders separated, with per-person records. Currently 22 overs vs
13 unders.

*Why it fits:* tells you whether the group's totals reads are directionally right
and unlucky, or just loud. `legMargin()` already computes the exact quantity.
*Effort:* small.
*Deps:* none.

### 1.7 Kickoff-window splits

Records bucketed by kickoff slot: CFB noon / afternoon / primetime / weeknight, NFL
early / late / national window.

*Why it fits:* "never bet the noon Big Ten game" is precisely the kind of claim
this group makes and never checks.
*Effort:* small–medium.
*Deps:* kickoff times come from ESPN, not the JSON (legs only carry a `date`), so
bucket from the event's ISO timestamp converted to US Eastern.

### 1.8 Hook tax audit

Tally legs that landed inside half a point, one point, and the key numbers (3, 7)
of the line, split by whether the hook saved the leg or killed it.

*Why it fits:* "Worst Beats" shows the five closest losses; a systematic key-number
ledger is a different and more damning statistic.
*Effort:* small.
*Deps:* none — `margin` is already on every row.

### 1.9 Venue and surface splits

Backfillable splits on indoor vs outdoor, grass vs turf, neutral site, and
conference game vs non-conference.

*Why it fits:* cheap to add once the per-game fetch from §2.1 exists, and it's the
kind of split nobody would hand-tally. Temper expectations on the neutral-site
cell: the group's 13 weeks contain no neutral-site leg so far, even though the NFL
slates they pick from include international games.
*Effort:* small, *if* §2.1's snapshot job exists; medium standalone.
*Deps:* `gameInfo.venue.grass` / `.indoor` and `competitions[0].neutralSite` /
`.conferenceCompetition`, all retained post-game (verified).

---

## 2. Closing-line value and price integrity

The highest-value analytics on this list, and the ones that need a new capture
step. Group these behind one script so the fetch fan-out happens once, offline,
and the site renders from stored JSON.

### 2.1 Odds snapshot script

`scripts/capture-odds.mjs <week-id>`: resolve each leg's ESPN event, pull
`pickcenter[0]`'s `open` and `close` for the relevant market, and write them onto
the leg as a `market: { open, close, capturedAt, source }` block.

*Why it fits:* the Shadow Book already does this by hand and the README documents
the ritual; formalizing it unlocks 2.2–2.4 permanently and costs one command per
week. Because `summary` retains open/close indefinitely, **the 13 existing weeks
can be backfilled in one run**.
*Effort:* small–medium.
*Deps:* `summary?event=<id>`, ~1 request per distinct game (≈130 across the whole
season). Runs in node alongside `scripts/smoke.mjs`; nothing new in the browser.

### 2.2 Closing-line value per leg and per person

Compare each leg's entered line and price to DraftKings' close: did the pick beat
the number it was graded against? Roll up per person as "beat the close N of M."

*Why it fits:* it is the one statistic that separates "good bet, bad result" from
"bad bet," which is exactly the argument Betting War's Delta EV *gestures* at
without resolving. For a group that enjoys a derived stat with a silly name, CLV is
the real version.
*Effort:* medium (small once 2.1 lands).
*Deps:* 2.1. Caveat that belongs in the UI copy, not a footnote: the group bets
bet365 and ESPN only publishes DraftKings, so CLV here is cross-book and ±half a
point of noise. Don't rank people by hundredths.

### 2.3 Transcription guard

Compare every entered `line`/`odds` against the captured market and warn when
they're implausibly far apart — the wrong team's side of a spread, a missing minus,
a line off by a full point.

*Why it fits:* Week 9's own `note` field documents three legs where the planning
notes and the bet slip disagreed. This catches that class of error before it's
graded.
*Effort:* small.
*Deps:* 2.1; pre-kickoff capture is strictly better here, since a live `close` is
the most direct comparison.

### 2.4 Weather capture at entry

Record `weather.displayValue` and `temperature` on each leg at entry time, enabling
cold-weather-under and wind-game splits later.

*Why it fits:* nearly free when the snapshot script is already running.
*Effort:* small.
*Deps:* **capture-only — this is the one field that cannot be backfilled.** Weather
is present on upcoming events and absent from both the scoreboard and
`summary.gameInfo` once a game is final (verified). Either capture it weekly from
now on or drop the idea; a half-populated weather split is worse than none.

---

## 3. Parlay construction insight

### 3.1 Correlation flags

Detect legs within a slip that share a game or a team, label them on the card, and
report how correlated clusters have actually resolved (all-hit / all-miss / split)
versus independent legs. Week 5.5 stacked three legs on BYU/Notre Dame; Week 9
doubles up on two games; nine of thirteen weeks have at least one shared game.

*Why it fits:* a 13-leg slip priced as if every leg is independent isn't, and the
group is already building SGPs by hand with `groups`. This makes the dependency
visible at the point where it changes the bet.
*Effort:* medium.
*Deps:* none for detection (team/opponent keys). The "do clusters cluster"
statistic has a handful of samples, so present it as a labelled list of clusters,
not a rate with a decimal point.

### 3.2 Slip price audit

Multiply every leg's decimal odds for a week and compare to the slip's stated
`stake` → `payout` multiple, surfacing the gap as implied boost or book margin.
Weeks 5 and 2.5 already carry boost amounts inside the `payout` string.

*Why it fits:* `shadowQuote()` in `js/shadow.js` already performs exactly this
computation for the Shadow Book, including the SGP single-pricing rule. Pointing it
at real slips is reuse, not new math, and it turns the hand-parsed "(incl. $8,823.16
parlay boost)" text into a number.
*Effort:* small.
*Deps:* none. Weeks with unpriced legs should render "—" rather than a wrong total.

### 3.3 Drop-one counterfactual

For each settled week, show what the slip would have returned with each single leg
removed, and how many weeks would have cashed at N−1 legs.

*Why it fits:* Weeks 4.5, 5.5 and 8.5 are this maneuver *performed by hand* — 8.5
is literally Week 8 minus the busted Nebraska leg. The site should do the arithmetic
the group is already doing in chat.
*Effort:* medium.
*Deps:* none, and pricing coverage is better than you'd expect — only Week 6 has
unpriced legs (2 of 12), so every other week can show a real number.

### 3.4 Leg-count tradeoff curve

Plot empirical survival by leg index and odds band against the payout multiple, and
mark where this group's observed hit rate breaks even on leg count.

*Why it fits:* answers "are 13-leg slips just lottery tickets" with the group's own
156 legs instead of theory.
*Effort:* medium.
*Deps:* none. Thirteen weeks is a small sample — the honest version shows the
confidence band, or shows none and says the number is indicative.

### 3.5 Per-person payout equity

Each person's share of the week's total multiplier: whose legs are actually
generating the payout versus who is padding the slip with -110 chalk. Dalton has 35
legs and Jacob 6 — but share-of-multiplier is a different ranking from share-of-legs.

*Why it fits:* a natural companion to Betting War that nobody in the group has a
way to compute, and a fresh source of argument.
*Effort:* small.
*Deps:* none — decimal odds per leg, which `bettingWar()` already resolves,
including the SGP split rule.

---

## 4. Competitive and social

### 4.1 Head-to-head grid

An 8×8 matrix: for every pair, the record of weeks where A's legs outperformed B's
(by hit rate, with units as the tiebreak), plus an all-time H2H line.

*Why it fits:* the leaderboard is a single ranking; a grid creates 28 individual
rivalries, which is what a banter-heavy group actually wants.
*Effort:* medium.
*Deps:* none. Viz note: a sequential single-hue heatmap, which sidesteps the
categorical-palette cap entirely — but it needs the table view (§6.1) to be
readable at all for colorblind users.

### 4.2 Badges

Derived achievements, never hand-entered, shown as chips on a person's row:
*Killshot* (busted the slip), *Perfect Week* (every leg hit), *Bag Fumbler* (lost by
≤1), *Chalk Eater* (five straight legs at -150 or worse), *Dog Walker* (cashed a
+200 or longer), *Iron Man* (a leg in every week — currently **unclaimed**, with
Dalton, Roma, Paul and Mark all stuck at 12 of 13), *Lead-Off Hitter* (owned the
slate's first kickoff), *Arsonist* (two kills in one season).

*Why it fits:* the group already enjoys derived stats with invented names; badges
are the same instinct made collectible, and every input exists in `breakdownRows`.
*Effort:* medium — the plumbing is trivial, the definitions and thresholds are the
real work, and they should be tuned against the actual data so nothing is either
unearnable or universal.
*Deps:* none. Pure, unit-testable, no new fields.

### 4.3 Discord-ready week recap

One auto-generated block per week naming the MVP leg, the LVP leg, the killshot and
the per-person line, with a Copy button.

*Why it fits:* the site is downstream of a Discord channel, and the thing people
want to do with a stat is paste it. Matches the existing house style for Discord:
bullets, compact, no tables.
*Effort:* small.
*Deps:* none; `navigator.clipboard` on a static page.

### 4.4 Streaks and droughts

Beyond the existing current-streak column: longest win and loss streaks ever,
weeks since each person's last hit, and the group's longest all-hit run inside a
single slate.

*Why it fits:* `personTotals()` already walks rows in order to compute the current
streak, so the historical extremes are a few lines further.
*Effort:* small.
*Deps:* none.

### 4.5 Per-person permalink

`#breakdown/dalton` renders one person's full page: every leg, their splits, their
badges, their WAR line.

*Why it fits:* makes a stat linkable in chat, which is how anything on this site
actually gets used. `showTab()` already reads `location.hash`.
*Effort:* medium.
*Deps:* none — extend the existing hash routing rather than adding a router.

### 4.6 Cold-streak callout

A single generated line at the top of the Parlays tab naming whoever is on the
longest active losing streak.

*Why it fits:* the roasting is the point, and the data is already computed.
*Effort:* small.
*Deps:* none.

---

## 5. Shadow Book rivalry

### 5.1 Group vs MitsNemo scoreboard

A head-to-head panel on the Shadow Book tab: group aggregate against MitsNemo on
the same metrics (hit rate, net units, Delta EV, CLV once §2.2 exists), per week
and cumulative.

*Why it fits:* the Shadow Book is currently scored on its own terms and folded
quietly into the stats tables. An explicit challenge is the obvious hook, and the
rows already flow through `breakdownRows` via `statsEligible()`.
*Effort:* medium.
*Deps:* none. Keep the existing wall intact — shadow money must stay out of season
money, same as today.

### 5.2 Collision log

Games where a Shadow Book pick and a real slip landed on the same event: same side
(agreement) or opposite sides (a head-on fade). Show who won each collision, with
the shadow pick's written `reasoning` next to the group's leg.

*Why it fits:* shadow legs carry a `reasoning` string and group legs don't, so a
collision is the only place the two sides can be compared argument-to-argument.
Easily the funniest artifact an agent-versus-humans rivalry can produce.
*Effort:* medium.
*Deps:* none. Few samples so far — render it as a list of collisions, never a win
rate.

### 5.3 Reasoning retrospective

For settled shadow legs, show the recorded `reasoning` next to the result, and tag
each as held up / didn't. Over a season this becomes an honest accuracy log for the
written analysis, not just the picks.

*Why it fits:* the README explicitly commits to grounded reasoning rather than line
movement; this is the audit that keeps that commitment honest, including the legs
where the stated rationale was right and the bet still lost.
*Effort:* small.
*Deps:* none — the `reasoning` field already exists on every shadow leg.

### 5.4 Uploaded-slip gallery

The Shadow Book already holds four member-uploaded slips (Dalton ×3, Jacob ×1,
including a Caesars slip from Vegas), all `excludeFromStats`. Give them their own
view with their own mini-leaderboard, kept out of the group stats exactly as now.

*Why it fits:* these entries are structurally different from MitsNemo's slates and
currently sit awkwardly in the same list, distinguished only by a line of card
text.
*Effort:* small.
*Deps:* none — `author` and `excludeFromStats` already carry the distinction.

---

## 6. Visualization and UX

The target is the dataviz method: pick the form first, assign color by the job it
does, **run the palette validator rather than eyeballing it**, thin marks, one axis
per chart, a hover layer by default, and a table view so identity is never
color-alone.

### 6.1 Re-ground the WAR chart on a validated palette

`WAR_COLORS` in `js/app.js:202` holds **seven** colors and is indexed
`WAR_COLORS[j % WAR_COLORS.length]` — with eight contributors, the eighth person
(Jacob) is painted the same `#58a6ff` blue as the first (Roma). Switch to the
validated 8-slot categorical palette, which fits exactly eight people, assign the
hue to the *person* so a filter never repaints survivors, add a crosshair tooltip
instead of per-point `<title>` only, direct-label the lines, and ship the table
view.

*Why it fits:* it's a live correctness bug in the chart the group looks at most, and
eight contributors is precisely the palette's capacity — a ninth name (MitsNemo
already exists, though it's filtered out of this chart today) must fold into "Other"
or facet rather than generate a hue.
*Effort:* medium.
*Deps:* none. Run the skill's `scripts/validate_palette.js` against the chosen hexes
and the `#0d1117` surface before shipping; the line-chart case is validated on the
adjacent pairlist, which the 8-slot order passes.

### 6.2 Selected light mode

`css/style.css` is 123 lines of dark-only raw hex with no `prefers-color-scheme`
block (verified: zero occurrences). Move to role-based custom properties and add a
*selected* light palette plus a `data-theme` toggle — per the method, the light set
is chosen and validated against the light surface, not an automatic inversion.

*Why it fits:* the site gets opened on phones in daylight. Mechanical but broad,
since it touches nearly every rule.
*Effort:* medium.
*Deps:* none.

### 6.3 Cover-path chart ("the sweat")

For a finished game, reconstruct score-over-time from `summary.scoringPlays` — each
play carries `awayScore`, `homeScore`, `period` and `clock` — and draw the leg's
margin against *its own number* as a line crossing zero. You see exactly when a
cover was in hand and when it evaporated.

*Why it fits:* turns Worst Beats from a number into the actual story, and the
spread-versus-your-line framing is already the house grading rule.
*Effort:* large.
*Deps:* one `summary?event=<id>` per game. `eventId` is on shadow legs but **absent
from `parlays.json` legs** (see §7.3), so either add it or resolve at runtime. Fetch
lazily on expand and cache — don't fan out 130 requests on page load. ESPN's
`winprobability` (~190 points) is also available but answers a different question
(who wins the game, not who covers your line), so prefer the reconstruction.

### 6.4 War-room view

A game-day screen: every live and upcoming leg as one compact row — score, time
remaining, margin versus the number — sorted by proximity to the line, with a
legs-alive counter, on the existing 30-second refresh.

*Why it fits:* 10–14 legs across a Saturday makes the current card layout a long
scroll exactly when scanning speed matters most.
*Effort:* medium.
*Deps:* none beyond what `refresh()` already fetches.

### 6.5 Shareable filter state

Encode the active tab, person filter and margin sub-tab in the URL so a filtered
view can be pasted into Discord.

*Why it fits:* the chips work but the state is invisible and unshareable, and the
hash router is already there.
*Effort:* small.
*Deps:* none.

### 6.6 Sparkline column

A 2px cumulative-units sparkline inside each row of the By Person table, as a
small-multiples alternative that keeps working past eight people where a single
multi-series line chart stops.

*Why it fits:* same data as `cumulativeWarByWeek()`, and it sidesteps the
categorical-palette ceiling entirely — one series per row needs no legend.
*Effort:* small–medium.
*Deps:* none.

---

## 7. Data entry and automation

### 7.1 Slate picker

A static `entry.html` that fetches a week's scoreboard (`leagues[0].calendar` gives
the week boundaries; `?dates=YYYYMMDD` per day), lets you click a side or total,
and emits a pasteable `legs` array pre-filled with `league`, `team`, `opponent`,
`date`, `eventId`, and DraftKings' current line and price.

*Why it fits:* the highest-leverage automation that stays fully static. It kills
both failure modes at once — the fuzzy team-name match and the transcription errors
Week 9's note documents — and it produces the `eventId` that §6.3 and §7.3 want.
*Effort:* large (it's a small app), but it needs no backend: output goes to a
textarea for hand-pasting into `parlays.json`, same as every other edit.
*Deps:* scoreboard only. Capture is pre-kickoff by nature, which is also when
you're building the slip anyway.

### 7.2 Bet-slip screenshot → JSON draft

Drop a bet365 slip screenshot on the entry page, OCR it in the browser with a
vendored `tesseract.js` build, and emit a draft `legs` array for hand-correction.

*Why it fits:* the input cost of this project is one person retyping 14 legs a week
off a phone screenshot.
*Effort:* large.
*Deps:* no backend, but several MB of vendored WASM (the repo has an established
no-CDN vendoring practice), and OCR accuracy on `-3.5` versus `-35` and `+115`
versus `-115` will need a human pass regardless. **Honest framing:** the agent
transcribing a screenshot out-of-band and committing JSON is already more accurate
than browser OCR, so the real value here is *self-serve entry by group members*,
not automating the current workflow. Build 7.1 first; this is only worth it if
members start entering their own slips.

### 7.3 `eventId` on every leg, plus a drift guard

Shadow legs carry `eventId`; group legs resolve by fuzzy name on every page load —
156 matches per view, and the one genuine correctness risk in the app (two schools
share a nickname, two teams are "Miami"). Add optional `eventId` to parlays legs,
prefer it in `findLegGame()`, and have `scripts/smoke.mjs` warn when the name match
and the id disagree.

*Why it fits:* cheap, removes a whole class of silent mis-grading, and makes §6.3
possible. ESPN event ids are stable.
*Effort:* small.
*Deps:* none — an id fast path in `js/espn.js` over events already fetched for that
date.

### 7.4 Data schema check in `npm test`

`scripts/validate-data.mjs`: valid `type` values, a `line` present where the type
requires one, every leg `group` resolving to an entry in `week.groups`, `by` within
the known roster, no duplicate leg ids within a week, `weekOf` parseable.

*Why it fits:* `parlays.json` is 1,930 hand-edited lines and the git log shows the
Week 9 SGP pricing merged, un-merged, re-merged and un-merged again — exactly the
churn that leaves an unpriced group leg behind.
*Effort:* small.
*Deps:* none. Runs as part of `node --test`.

### 7.5 Retire the hardcoded week-merge map

`WAR_WEEK_MERGE` in `js/app.js:207` hardcodes `2026-w4-5` → Week 4 and `2026-w5-5`
→ Week 5, but Week 8.5 — the same kind of re-bet ticket — isn't in it. Replace the
map with a declared `rebetOf: "2026-w8"` field on the week itself.

*Why it fits:* the pattern recurs roughly monthly and currently requires editing
JavaScript to add a week, which breaks the "weeks are data" property the rest of
the project holds to.
*Effort:* small.
*Deps:* none. Fixing the Week 8.5 omission will shift the WAR chart, so check
whether the current rendering is the intended one before changing it.

---

## 8. Degenerate fun

### 8.1 Live payout ticker

On the active slip, what it's worth right now if every live leg holds, counting
down as legs settle: "9 down, 5 alive, $19,930.90 still on the table."

*Why it fits:* a $7 stake chasing $19,930.90 *is* the emotional content of this
project, and `shadowQuote()`'s math already handles the leg-by-leg product
including SGP single-pricing.
*Effort:* small.
*Deps:* none.

### 8.2 Degen Index

A tongue-in-cheek composite per person from existing columns — average price taken,
share of legs at +200 or longer, margin variance, over/under lean — with the
components always shown next to the score.

*Why it fits:* this group demonstrably enjoys a derived stat with an invented name
("Betting War", "UGpB"). Showing the components keeps it arguable, which is the
point.
*Effort:* small.
*Deps:* none.

### 8.3 Near-miss museum

A permanent page for the worst beats: final score, the line, the margin, and an
optional one-line post-mortem, each entry deep-linkable.

*Why it fits:* Worst Beats is currently a transient top-five that scrolls away; the
genuinely painful ones deserve tenure.
*Effort:* small–medium.
*Deps:* an optional `postmortem` string on a leg — the only hand-written field
proposed anywhere in this document.

### 8.4 Week recap image

A client-side canvas render of the week — per-person records, killshot, payout —
downloadable as a PNG for the channel.

*Why it fits:* the natural end state of 4.3 for a group that communicates in
screenshots.
*Effort:* medium.
*Deps:* **check before building.** Drawing ESPN logos from `a.espncdn.com` onto a
canvas taints it unless the CDN sends permissive CORS headers, and a tainted canvas
makes `toDataURL()` throw. Verify with one image first; fall back to type-only
output or vendor the handful of logos the group actually picks.

---

## 9. Bigger lifts — parked

Flagged rather than estimated, because each one breaks the no-backend property.

### 9.1 Self-serve pick submission

Anything where Dalton types his legs and they appear on the site needs a writable
store. The static-ish middle path is a GitHub issue form plus an Action that
validates and commits to `data/parlays.json` — that keeps "no server," but it does
add CI, a token, and a merge policy to a repo that currently has none of the three.
A real backend is only required if you want writes to appear instantly. The honest
alternative: the orchestrator already reads the Discord channel, so the existing
agent workflow *is* the submission path.

### 9.2 Line movement over time

ESPN publishes exactly one `open`/`close` pair per market, so a movement *chart*
requires polling and storing a time series. The static-friendly version is §2.1
extended to append a timestamped snapshot per run and commit it — real, but it
grows the repo every week and is a cron job, not a page.

### 9.3 Accounts, auth, push notifications

Out of scope and unnecessary: the Discord channel already is the notification
layer, and there is nothing on this site worth gating.

### 9.4 Automated prop grading

ESPN's public feeds don't settle player props, which is why the 9 `other` legs
carry manual `result` overrides. Grading them automatically means a props data
source; the manual override is the right design and should stay.

### 9.5 Multi-book odds

Pre-kickoff scoreboard odds carry one provider (DraftKings) and `pickcenter`
likewise returned a single entry on every game sampled. A real consensus number
means a second data source, which means a key, which means a backend. Treat
DraftKings as "the market" and label it as such wherever a price is compared.

---

## If you only build three

1. **§2.1 + §2.2 — odds snapshot and CLV.** Backfillable across all 13 weeks,
   unlocks three other ideas, and settles the "who is actually good" argument that
   Delta EV only gestures at.
2. **§1.1 — the Killshot Report.** Smallest effort-to-banter ratio on the list, no
   new data, and it's the fact the group talks about every single week.
3. **§6.1 — fix and validate the WAR palette.** It's a live bug: with eight
   contributors and seven colors, Jacob and Roma are currently the same blue on the
   chart people look at most.
