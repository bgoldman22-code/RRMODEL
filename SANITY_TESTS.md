
NFL Anytime TD — Sanity Tests

1) Backend health (no odds, fast path)
curl -s https://<your-site>.netlify.app/.netlify/functions/nfl-anytime-td-candidates?odds=0 | jq '.ok, .season, .week, .games, (.candidates | length)'

Expect: ok = true, games > 0 during season weeks, candidates > 0

2) Cache hit
Repeat the same request; expect info.cached = true on the second call
curl -s https://<site>/.netlify/functions/nfl-anytime-td-candidates?odds=0 | jq '.info.cached'

3) Odds snapshot exists (if you have a recent snapshot)
curl -s https://<site>/.netlify/functions/nfl-anytime-td-candidates | jq '.info.usingOddsApi, (.candidates[] | select(.american != "") ) | length'

Expect: usingOddsApi true and some candidates have american odds

4) Deterministic shape
curl -s https://<site>/.netlify/functions/nfl-anytime-td-candidates?odds=0 | jq '.candidates[0] | keys'

Expect: ["EV","Game","Player","Why","actualOdds","american","expPath","modelAmerican","modelProb","rzPath"]

5) Basic value bounds
curl -s https://<site>/.netlify/functions/nfl-anytime-td-candidates?odds=0 | jq '[ .candidates[].modelProb | select(. < 0 or . > 1) ] | length'

Expect: 0
