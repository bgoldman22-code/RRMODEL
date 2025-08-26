
# Bonus Picks (Add-on)

This patch adds a second table labeled **Bonus picks (near threshold)** below the main 12. 
- It takes the next `BONUS_COUNT` best candidates by EV (default 8), not already selected in the top 12.
- Respects the same per-game cap (`MAX_PER_GAME`) to keep diversity.
- No changes to WHY text or existing layout above.

## Configure
- Set `VITE_BONUS_COUNT` (frontend) or `BONUS_COUNT` (build env) to change the count (5–10 recommended).

