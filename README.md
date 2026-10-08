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

Rules: one parlay per week, newest `weekOf` shows on top and the rest go under History. A single missed leg busts the parlay; pushes are dropped. Spreads are graded against **your** line (bet365's), not ESPN's. A week can also carry `"result": "WON" | "BUSTED" | "VOID"` (with `"legs": []`) to record a past parlay whose legs weren't saved; it counts toward the season record. Set `"example": true` on a week to mark it as demo data (excluded from the season record).

## Breakdown tab

The site has two tabs: **Parlays** (current week + history) and **Breakdown** — a single table with one row per leg across every week ever entered:

Week · who picked it · pick · bet type · spread · odds · result · won/lost by

`Won/lost by` is the graded margin in points versus your number (`won by 10.5`, `lost by 1.5`, `on the number (push)`; live legs read `up 4 (live)`). Props and `other` legs have no margin and show `—`. The odds cell shows the leg price, or the shared same-game price (hover for the group name). Rows are newest week first, kickoff order inside a week; the filter chips narrow the table to one person.

Below the leg table the tab shows **By person (all weeks)** (legs, hits, misses, pushes, open legs, hit rate, average odds and average miss), **Results by odds** (each person's W-L record across seven American-odds bands; settled legs only), **Betting War** (Expected Value = sum of `1 / decimal odds` for every priced leg; Earned Value adds `decimal odds - 1` for wins and zero for losses; Delta EV = earned minus expected), **WAR by week** (a line chart of each person's cumulative Delta EV through each week, with the same formula), **Per week** money (staked, returned, net) and a season line. For all odds-based totals, SGP legs use their own price or the shared price when none is listed.

Row building is pure and lives in `js/breakdown.js` (`breakdownRows`, `personTotals`, `resultsByOdds`, `bettingWar`, `warByWeek`, `cumulativeWarByWeek`, `weekMoney`, `seasonMoney`), tested in `tests/breakdown.test.mjs`.
Below WAR by week, one tabbed ranking area switches between **Best Wins**, **Worst Losses**, and **Worst Beats**: the five largest winning margins, largest losing margins, and closest losses respectively. Each bet shows its American odds in parentheses. Week 2.5 is excluded from these rankings. Only settled legs with a numeric point margin are ranked; manual props without a margin are excluded.

## Publish

Settings -> Pages -> Source: **Deploy from a branch** -> `main` / `(root)`.

## Develop

```sh
npm test                 # unit tests (node --test)
node scripts/smoke.mjs   # resolves every leg in data/parlays.json against live ESPN
python3 -m http.server   # then open http://localhost:8000
```

Grading and team-matching logic live in `js/grade.js` and `js/match.js` (pure, tested); ESPN fetching is in `js/espn.js`; rendering is in `js/app.js`.
