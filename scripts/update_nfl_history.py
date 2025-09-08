import os, json, datetime as dt
import pandas as pd
import requests
import nfl_data_py as nfl

SITE_ID = os.environ.get("SITE_ID")
TOKEN = os.environ.get("NETLIFY_API_TOKEN") or os.environ.get("BLOBS_TOKEN")
STORE = os.environ.get("BLOBS_STORE_NFL", "nfl-td")

def put_blob(key: str, data: bytes, content_type="application/json"):
    url = f"https://api.netlify.com/api/v1/sites/{SITE_ID}/blobs/{STORE}/{key}"
    r = requests.put(url, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": content_type}, data=data)
    r.raise_for_status()
    return True

def main():
    season = dt.datetime.now(dt.timezone.utc).year
    # Last 3 seasons play-by-play and weekly advanced receiver rushing/targets
    seasons = list(range(season-2, season+1))
    pbp = nfl.import_pbp_data(seasons, downcast=False)
    rec = nfl.import_weekly_data(seasons)
    # Trim columns to what we need to compute TD model features
    keep_pbp = [c for c in pbp.columns if c in ("season","week","game_id","posteam","defteam","yardline_100","qtr","down","ydstogo","epa","rush","pass","rusher_player_name","receiver_player_name","touchdown","pass_touchdown","rush_touchdown","goal_to_go")]
    pbp = pbp[keep_pbp]
    keep_rec = [c for c in rec.columns if c in ("season","week","team","player_name","position","rush_attempts","targets","redzone_targets","air_yards","receiving_tds","rushing_tds")]
    rec = rec[keep_rec]

    # Save to Netlify blobs
    put_blob(f"history/{season}/pbp-last3.json", pbp.to_json(orient="records").encode("utf-8"))
    put_blob(f"history/{season}/weekly-last3.json", rec.to_json(orient="records").encode("utf-8"))
    print("Uploaded history to blobs.")

if __name__ == "__main__":
    main()
