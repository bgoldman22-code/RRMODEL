HEADER NAV PATCH (Non-destructive)

Goal:
- REMOVE: MLB SB, Soccer AGS, Parlays
- ADD: HRR
- Keep layout/classes exactly as-is.

How to apply:
1) Open your nav component (typically one of):
   - src/components/NavBar.jsx
   - src/components/Header.jsx
   - src/components/HeaderNav.jsx
   - src/layouts/Header.jsx
   (Pick the one that renders the top links you see on the site.)

2) Find where the links are defined (array or hard-coded <Link> tags).
   Remove the three and add HRR per the example below.
   DO NOT change classNames / styling / wrapper markup.

3) If your nav uses a `links` array, replace its contents with the example in `snippets/HeaderNav.links.example.js`.
   If your nav uses inline <Link> tags, copy/paste from `snippets/HeaderNav.inline.example.jsx`.

4) If you have explicit routes, make sure a route exists for '/hrr'
   pointing to your HRR page (or reuse HR RR page).

This is intentionally non-destructive to avoid overwriting your custom layout.

