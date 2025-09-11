# File: ml/pipeline.py
import os, sys, json, argparse, datetime, time
from pathlib import Path
import math
import requests

OUT_DIR = Path("netlify/functions/nfl-predictions-get/_data")

def log(*a): print("[pipeline]", *a, flush=True)

def get_json(url, headers=None, params=None):
    r = requests.get(url, headers=headers or {}, params=params or {}, timeout=30)
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        # fallback csv? not needed here
        return None

def implied_prob_from_american(odds):
    # American odds to implied probability (no vig removed)
    try:
        o = float(odds)
    except Exception:
        return None
    if o > 0:
        return 100.0 / (o + 100.0)
    else:
        return (-o) / ((-o) + 100.0)

def choose_next_week(season, schedule_api_root):
    # naive probe: find earliest week with any future games
    # expects schedule API to serve ?season=YYYY&week=W returning {games:[{kickoff,home,away,...}]}
    now = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)
    first_future = None
    for w in range(1, 23):  # regular + partial postseason
        try:
            data = get_json(schedule_api_root, params={"season": season, "week": w})
        except Exception as e:
            continue
        games = data.get("games") or data.get("schedule") or data.get("items") or []
        if not isinstance(games, list): continue
        # detect future
        for g in games:
            ko = g.get("kickoff") or g.get("start") or g.get("gameTime") or g.get("date")
            try:
                # try parse as ISO
                dt = datetime.datetime.fromisoformat(ko.replace("Z","+00:00")) if isinstance(ko,str) else None
            except Exception:
                dt = None
            if dt and dt.replace(tzinfo=datetime.timezone.utc) > now:
                first_future = w if first_future is None else min(first_future, w)
        if first_future is not None:
            break
    return first_future or 1

def fetch_schedule(season, week, schedule_api_root):
    data = get_json(schedule_api_root, params={"season": season, "week": week})
    games = data.get("games") or data.get("schedule") or data.get("items") or []
    norm = []
    for g in games:
        home = g.get("home") or g.get("home_team") or g.get("homeTeam")
        away = g.get("away") or g.get("away_team") or g.get("awayTeam")
        kickoff = g.get("kickoff") or g.get("start") or g.get("gameTime") or g.get("date")
        game_id = g.get("id") or f"{season}_{week}_{away}_{home}"
        norm.append({
            "game_id": game_id,
            "home": home,
            "away": away,
            "kickoff": kickoff
        })
    return norm

def fetch_odds_for_week(season, week, odds_url, odds_key):
    if not odds_url:
        return {}
    headers = {}
    if odds_key: headers["Authorization"] = f"Bearer {odds_key}"
    try:
        data = get_json(odds_url, headers=headers, params={"season":season, "week":week})
    except Exception as e:
        log("odds fetch failed:", e)
        return {}
    # normalize: expect list with home/away/team abbreviations and markets
    out = {}
    items = data if isinstance(data, list) else (data.get("games") or [])
    for x in items:
        gid = x.get("game_id") or f"{season}_{week}_{x.get('away')}_{x.get('home')}"
        out[gid] = x
    return out

def build_predictions(season, week, schedule, odds):
    games = []
    for g in schedule:
        gid = g["game_id"]
        home = g["home"]; away = g["away"]
        od = odds.get(gid, {})
        # try reading moneyline, spread, total from odds object in a generic way
        ml_home = od.get("ml_home") or od.get("moneyline_home") or od.get("home_ml")
        ml_away = od.get("ml_away") or od.get("moneyline_away") or od.get("away_ml")
        spread_line = od.get("spread") or od.get("home_spread") or od.get("line")
        total_line = od.get("total") or od.get("over_under")

        # implied probabilities (baseline model)
        p_home = implied_prob_from_american(ml_home) if ml_home is not None else None
        p_away = implied_prob_from_american(ml_away) if ml_away is not None else None

        moneyline_pick = None
        if p_home is not None and p_away is not None:
            moneyline_pick = home if p_home >= p_away else away

        # spread pick: towards favorite if spread present
        spread_pick = None
        if spread_line is not None:
            try:
                s = float(spread_line)
                # convention: negative favors home; if s < 0 -> pick home; else pick away to cover
                spread_pick = home if s < 0 else away
            except Exception:
                pass

        total_pick = None
        if total_line is not None:
            # naive: no model yet -> default to "Under" if total > 46.5 else "Over" (placeholder prior)
            try:
                t = float(total_line)
                total_pick = "Under" if t > 46.5 else "Over"
            except Exception:
                pass

        games.append({
            "game_id": gid,
            "kickoff": g.get("kickoff"),
            "home": home,
            "away": away,
            "moneyline": {
                "pick": moneyline_pick,
                "home": ml_home,
                "away": ml_away,
                "implied_home": round(p_home,4) if p_home is not None else None,
                "implied_away": round(p_away,4) if p_away is not None else None
            },
            "spread": {
                "pick": spread_pick,
                "line": spread_line,
                "model": None,  # to be filled by Phase 2 ML
                "edge": None
            },
            "total": {
                "pick": total_pick,
                "line": total_line,
                "model": None,
                "edge": None
            },
            "alt_lines": [],
            "confidence": max(p_home or 0, p_away or 0) if (p_home or p_away) else None,
            "notes": []
        })
    # parlay suggestions
    # safety: top 3 highest confidence ML favorites
    games_sorted = sorted([g for g in games if g["moneyline"]["pick"]], key=lambda x: x["confidence"] or 0, reverse=True)
    safety_legs = [{"title": f"{g['moneyline']['pick']} ML ({g['away']}@{g['home']})"} for g in games_sorted[:3]]
    value_legs  = [{"title": f"{(g['spread']['pick'] or g['moneyline']['pick'])} spread/ML ({g['away']}@{g['home']})"} for g in games_sorted[:3]]

    out = {
        "season": season,
        "week": week,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "games": games,
        "parlays": [
            {"type": "safety", "legs": safety_legs},
            {"type": "value", "legs": value_legs}
        ]
    }
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2025)
    args = ap.parse_args()

    season = args.season
    schedule_api = os.getenv("SCHEDULE_API_ROOT", "").strip()
    if not schedule_api:
        raise SystemExit("SCHEDULE_API_ROOT secret is required (your schedule Netlify function URL).")

    week = choose_next_week(season, schedule_api)
    log("season", season, "week", week)

    sched = fetch_schedule(season, week, schedule_api)
    log("schedule games:", len(sched))

    odds_url = os.getenv("ODDS_API_URL","").strip()
    odds_key = os.getenv("ODDS_API_KEY","").strip()
    odds = fetch_odds_for_week(season, week, odds_url, odds_key)
    log("odds entries:", len(odds))

    preds = build_predictions(season, week, sched, odds)

    # write outputs
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / str(season)).mkdir(parents=True, exist_ok=True)

    week_path = OUT_DIR / str(season) / f"week{week}.json"
    curr_path = OUT_DIR / "current.json"

    with open(week_path, "w") as f:
        json.dump(preds, f, indent=2)
    with open(curr_path, "w") as f:
        json.dump(preds, f, indent=2)

    log("wrote", str(week_path))
    log("wrote", str(curr_path))

if __name__ == "__main__":
    main()
