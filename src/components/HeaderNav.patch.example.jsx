// src/components/HeaderNav.patch.example.jsx
// Apply this change to your actual header/nav component WITHOUT altering layout classes.
// Remove: MLB SB, SOCCER AGS, Parlays
// Add: HRR (Hits+Runs+RBIs)
//
// Example menu array BEFORE:
// const links = [
//   { key:'mlb_hr', label:'MLB HR', href:'/mlb-hr' },
//   { key:'mlb_hits2', label:'MLB 2+ Hits', href:'/mlb-hits2' },
//   { key:'mlb_sb', label:'MLB SB', href:'/mlb-sb' },
//   { key:'soccer_ags', label:'Soccer AGS', href:'/soccer-ags' },
//   { key:'parlays', label:'Parlays', href:'/parlays' },
//   { key:'nfl_td', label:'NFL TD', href:'/nfl-td' },
// ];
//
// AFTER (layout unchanged; same classes, same map render):
// const links = [
//   { key:'mlb_hr', label:'MLB HR', href:'/mlb-hr' },
//   { key:'mlb_hits2', label:'MLB 2+ Hits', href:'/mlb-hits2' },
//   { key:'mlb_hrr', label:'MLB HRR', href:'/mlb-hrr' }, // NEW
//   { key:'nfl_td', label:'NFL TD', href:'/nfl-td' },
// ];
//
// If your header uses a switch/case or <Route>, add a route/page for '/mlb-hrr' pointing to your HRR table view.

export default function HeaderNavPatchExample(){ return null; }
