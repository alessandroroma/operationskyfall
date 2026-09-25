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
| `note` | optional text shown on the card |
| `result` (on a leg) | optional manual override: `hit`, `miss` or `push` (use for `other` legs like props) |

Rules: one parlay per week, newest `weekOf` shows on top and the rest go under History. A single missed leg busts the parlay; pushes are dropped. Spreads are graded against **your** line (bet365's), not ESPN's. A week can also carry `"result": "WON" | "BUSTED" | "VOID"` (with `"legs": []`) to record a past parlay whose legs weren't saved; it counts toward the season record. Set `"example": true` on a week to mark it as demo data (excluded from the season record).

## Publish

Settings -> Pages -> Source: **Deploy from a branch** -> `main` / `(root)`.

## Develop

```sh
npm test                 # unit tests (node --test)
node scripts/smoke.mjs   # resolves every leg in data/parlays.json against live ESPN
python3 -m http.server   # then open http://localhost:8000
```

Grading and team-matching logic live in `js/grade.js` and `js/match.js` (pure, tested); ESPN fetching is in `js/espn.js`; rendering is in `js/app.js`.
