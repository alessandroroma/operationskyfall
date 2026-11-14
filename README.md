# Operation Skyfall

Weekly football parlay tracker (NFL + college). Static site for GitHub Pages: live kickoff times, scores and per-leg grading pulled from ESPN in the browser. No backend, no build step.

## Add a week

Edit `data/parlays.json` and add an object to `weeks` (commit to `main`; the site updates in about a minute):

```json
{
  "id": "2026-w5",
  "label": "Week 5",
  "weekOf": "2026-10-01",
  "stake": "$20",
  "payout": "$480",
  "legs": [
    { "id": "l1", "league": "college-football", "team": "Ohio State", "opponent": "Illinois",
      "type": "spread", "line": -14.5, "date": "2026-10-03" }
  ]
}
```

Leg fields:

| field | meaning |
| --- | --- |
| `league` | `nfl` or `college-football` |
| `team` | side you picked: name, nickname or ESPN abbreviation (`Ohio State`, `Buckeyes`, `OSU`) |
| `opponent` | optional, but recommended; disambiguates the game |
| `type` | `spread`, `moneyline`, `total_over`, `total_under` (game total), `team_total_over`, `team_total_under` (picked team's own points), or `other` (props etc.; set `result` manually) |
| `line` | spread from the picked team's view (`-3.5`, `+7`), or the total for over/under; ignored for moneyline |
| `date` | game date `YYYY-MM-DD` (US Eastern, as ESPN lists it; the day before/after is also searched) |
| `by` | who contributed the pick (`Roma`, `Dalton`, ...); shown as a tag on the card and tallied per person for the week |
| `odds` | American odds for the leg (`-115`, `100`), shown on the card |
| `group` | name of a same-game-parlay group; its shared price lives on the week as `"groups": { "sgp": { "label": "Same-game parlay", "odds": 260 } }`. A leg's own `odds`, when provided, takes precedence for that leg |
| `note` | optional text shown on the card |
| `result` (on a leg) | optional manual override: `hit`, `miss` or `push` (use for `other` legs like props) |
| `weather` | optional, set by `scripts/capture-weather.mjs` — `{ "displayValue": "Sunny", "temperature": 70 }`. Not meant to be hand-edited; see below |

Rules: one parlay per week, newest `weekOf` shows on top and the rest go under History. A single missed leg busts the parlay; pushes are dropped. Spreads are graded against **your** line (bet365's), not ESPN's. A week can also carry `"result": "WON" | "BUSTED" | "VOID"` (with `"legs": []`) to record a past parlay whose legs weren't saved; it counts toward the season record. Set `"example": true` on a week to mark it as demo data (excluded from the season record).

After adding a week's legs, and **before any of its games kick off**, run:

```sh
node scripts/capture-weather.mjs            # most recent week by weekOf
node scripts/capture-weather.mjs --week=2026-w9   # or target one explicitly
```

ESPN only exposes `event.weather` while a game is still upcoming — it disappears from
both the scoreboard and the summary endpoint the moment a game goes live or final.
That makes this **capture-only**: run it before kickoff or the window is gone for
good, and there is no way to backfill weather onto a past week. The script skips
legs that already have `weather`, legs whose game has already started, and legs
ESPN has no game for; it writes straight back into `data/parlays.json`, same as
any other edit, and logs what it did and why for every leg.

Unlike weather, venue data (surface, neutral site, conference game) is retained by ESPN
indefinitely, so there's no rush: run `node scripts/capture-venue.mjs` whenever, including
long after a week is over — it fills in `venue` on any leg (across every week) that doesn't
have it yet, see the Breakdown tab section below.

## Breakdown tab

The site has two tabs: **Parlays** (current week + history) and **Breakdown** — a single table with one row per leg across every week ever entered:

Week · who picked it · pick · bet type · spread · odds · result · won/lost by

`Won/lost by` is the graded margin in points versus your number (`won by 10.5`, `lost by 1.5`, `on the number (push)`; live legs read `up 4 (live)`). Props and `other` legs have no margin and show `—`. The odds cell shows the leg price, or the shared same-game price (hover for the group name). Rows are newest week first, kickoff order inside a week; the filter chips narrow the table to one person.

Below the leg table the tab shows **By person (all weeks)** (legs, hits, misses, pushes, open legs, hit rate, and current consecutive win/loss streak across settled legs), **Results by odds** (each person's W-L record across seven American-odds bands; settled legs only), **Win-loss by league** (each person's NFL and CFB win-loss records, plus a combined All row; settled, attributed legs only), **Betting War** (Expected Value = sum of `1 / decimal odds` for every priced leg; Earned Value adds `decimal odds - 1` for wins and zero for losses; Delta EV = earned minus expected; Net Units adds `decimal odds - 1` for wins and subtracts 1 for losses), **WAR by week** (a line chart of each person's cumulative Delta EV through each week, with the same formula), **Team report card**, **Division report card**, **Venue and surface splits**, **Per week** money (staked, returned, net) and a season line. For all odds-based totals, SGP legs use their own price or the shared price when none is listed.

Row building is pure and lives in `js/breakdown.js` (`breakdownRows`, `personTotals`, `resultsByOdds`, `bettingWar`, `warByWeek`, `cumulativeWarByWeek`, `weekMoney`, `seasonMoney`, `contributorColors`), tested in `tests/breakdown.test.mjs`.
Below WAR by week, one tabbed ranking area switches between **Best Wins**, **Worst Losses**, and **Worst Beats**: the five largest winning margins, largest losing margins, and closest losses respectively. Each bet shows its American odds in parentheses. Week 2.5 is excluded from these rankings. Only settled legs with a numeric point margin are ranked; manual props without a margin are excluded.

**WAR by week**'s colors are a fixed, validated 8-slot palette (`js/breakdown.js`'s `WAR_COLORS`/`contributorColors`) assigned alphabetically by name, not by current ranking — a color always means the same person, even as records (and sort order) shift week to week. A 9th contributor would fall to a shared muted color rather than generating a new hue. Each line carries a direct end-label, and a "View as table" toggle below the chart shows the same numbers as a plain table.

**Team report card**, **Division report card**, and **Venue and surface splits** are pure cross-cutting analytics in `js/reports.js` (`teamReportRows`, `conferenceReportRows`, `venueReportRows`, `collisionRows`), tested in `tests/reports.test.mjs`:
- **Team report card** is one row per team picked on a side (spread, moneyline, or team total — not a game total, which isn't "picking a team"), with record, net units, and who picked it. Merges by ESPN's resolved team id when the game resolved, otherwise by the typed name, so a spelling difference doesn't split a team across two rows.
- **Division report card** splits CFB legs by the picked team's conference. ESPN exposes a numeric `conferenceId` but no conference name anywhere in its payload, so `data/conferences.json` is a small hand-maintained id→name map (confirmed against ESPN's groups endpoint); an id that isn't in the map shows as `Conference <id>` instead of erroring — add it to the JSON when that happens.
- **Venue and surface splits** cover grass vs. turf, neutral site vs. home/away, and (CFB only) conference game vs. non-conference, backfilled by `scripts/capture-venue.mjs`. Unlike weather, ESPN retains venue data indefinitely, so this is a one-time backfill (safe to re-run after adding a week — it only fills legs that don't have `venue` yet), not a weekly ritual. There's no verified `indoor` field anywhere in ESPN's per-game response (checked directly against a dome venue), so this does not claim an indoor/outdoor split, only surface type.

## Shadow Book tab

`data/shadow-book.json` holds the agent's **hypothetical** weekly NFL + CFB parlays, separately from real group slips in `data/parlays.json`. The first slate is Oct 17–18, 2026: 11 distinct games, a virtual $7 stake, and a projected $6,749.69 return (×964.24). The odds are DraftKings prices exposed in ESPN's scoreboard feed, recorded at the `capturedAt` timestamp; they are **not** repriced when the market moves. Game results are graded with the same ESPN score logic as the group slips. The tab shows its own record and settled virtual net. Shadow legs never enter Breakdown, Betting WAR, or the group's season money.

To add the next slate, fetch ESPN's single-date NFL/CFB scoreboards (CFB uses `groups=80&limit=400`), choose distinct unstarted games, record the exact `close` odds and spread `line` for the selected side plus `capturedAt` and `eventId`, and prepend a week in `data/shadow-book.json`. Give every pick a short `reasoning` excerpt, shown as a "Why" note on its card and grounded in the recorded line and price — cite the open-to-close movement when the feed provides it, and say plainly when a move went against the pick. Check `shadowQuote`'s return against the real slips' approximate 700–1,300× stake target. Run `npm test` and confirm each team/opponent resolves on ESPN before publishing. These are simulated picks, not placed bets or claims of an edge.

Above the weekly cards, the **Collision log** lists every (shadow pick, real leg) pair that landed on the same ESPN event, tagged "Agreed" (same side), "Faded" (opposite side), or "Different market" (not a clean head-to-head, e.g. a spread against a total) — the shadow pick's `reasoning` shows alongside it. It's a list, not a win rate: most games have no shadow pick at all, or no real leg. Pure logic lives in `collisionRows` (`js/reports.js`), tested in `tests/reports.test.mjs`.

## This Week tab

A browse/filter view of upcoming NFL + CFB games — not a pick-submission tool, just a
way to shop games before placing the weekly slip. On first open it fetches ESPN's
scoreboard for today through the next 5 days (both leagues don't line up Thu–Mon
exactly, so this window is a fixed default, shown in the tab's own subhead) and lists
kickoff time, matchup (with a `#rank` badge for ranked CFB teams), spread, total and
moneyline. Odds are DraftKings prices off ESPN's scoreboard feed — the only provider
ESPN exposes without an API key, so treat it as one market's number, not a shopped
consensus line. Filter by league or search a team name; both just re-filter the
already-fetched games client-side, no extra requests. The tab refetches on the site's
normal periodic refresh once it's been opened. Row-building and filtering logic is
pure and lives in `js/slate.js` (`buildRows`, `filterRows`), tested in
`tests/slate.test.mjs`; the network fetch and DOM wiring live in `js/app.js` next to
the other tabs' equivalents.

## Publish

Settings -> Pages -> Source: **Deploy from a branch** -> `main` / `(root)`.

## Develop

```sh
npm test                 # unit tests (node --test)
node scripts/smoke.mjs   # resolves every leg in data/parlays.json against live ESPN
python3 -m http.server   # then open http://localhost:8000
```

Grading and team-matching logic live in `js/grade.js` and `js/match.js` (pure, tested); ESPN fetching is in `js/espn.js`; rendering is in `js/app.js`.
