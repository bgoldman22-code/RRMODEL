HOW TO APPLY (safe; keeps your Generate button & tables)

1) Add imports at the top of src/MLB.jsx (with your other imports):
   import BetStructureNote from './components/BetStructureNote.jsx';
   import GameDiversification from './components/GameDiversification.jsx';

2) Keep a copy of the full ranked list in state (add next to your existing useState lines):
   const [allCandidates, setAllCandidates] = useState([]);

3) Inside your build() function, RIGHT AFTER you sort the candidates with:
     rows.sort((a,b)=> b.ev - a.ev);
   add this line to store them for the diversification table:
     setAllCandidates(rows);

4) Render the banner under your page title (above Generate):
     <BetStructureNote />

5) Render the diversification table UNDER your Bonus table:
     <GameDiversification selected={picks} candidates={allCandidates} targetGames={8} />

Notes:
- If allCandidates isn’t ready yet, the component renders nothing (no crash).
- Change targetGames to 9 if you want 9 unique games.
