
# Historical HR Odds Data

## Structure
```
odds/
  2021/
    03-28.json  (Opening Day)
    03-29.json
    ...
  2022/
  2023/
  2024/
  2025/
```

## Format
```json
{
  "date": "2025-09-25",
  "lastUpdated": "2025-09-25T18:00:00Z",
  "players": [
    {
      "name": "Aaron Judge",
      "playerId": 592450,
      "team": "NYY",
      "opponent": "BAL",
      "isHome": true,
      "odds": {
        "fanduel": 300,
        "draftkings": 320,
        "betmgm": 310
      }
    }
  ]
}
```

## Collection Status
- 2021: ⏳ Awaiting user's odds source
- 2022: ⏳ Awaiting user's odds source
- 2023: ⏳ Awaiting user's odds source
- 2024: ⏳ Awaiting user's odds source
- 2025: ⏳ Awaiting user's odds source

## Notes
User will provide method to retrieve historical odds.
TheOddsAPI mentioned as potential source.
