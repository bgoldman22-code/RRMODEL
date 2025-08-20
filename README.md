# Patch MLB v3

This patch fixes the Netlify build errors (unterminated regex, duplicate helpers)
and adds the Pure EV table + Bonus table alignment.

## How to apply

1. Open your project in your editor.
2. Replace the Pure EV block in `src/MLB.jsx` with the code from `snippets/pure-ev-block.jsx`.
3. Fix the Bonus table alignment by using the code in `snippets/bonus-row-fix.txt`.
4. If you still get duplicate helper errors, replace the helper functions with those in `snippets/helpers-v2.js`.

That's it! Save, commit, and redeploy.
