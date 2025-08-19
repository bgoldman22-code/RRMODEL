
Patch: utils/why.js — opponent pitcher fix
==========================================
Files included:
- src/utils/why.js (replace your existing file)

What it does:
- Ensures the WHY line uses the TRUE opponent pitcher.
- Accepts many possible data shapes (probables arrays, home/away objects, single fields).
- Prevents "vs own pitcher" mistakes by dropping the pitcher line if we can’t reliably find the opponent.

Install:
1) Place `src/utils/why.js` into your repo (overwrite).
2) Commit and deploy.

Optional (future):
- In your MLB.jsx, when you assemble the object for buildWhy(...), pass an explicit `opponentPitcher` if you have it handy:
    const why = buildWhy({ ...row, opponentPitcher }, 1);
