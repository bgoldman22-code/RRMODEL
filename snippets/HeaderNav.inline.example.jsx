// snippets/HeaderNav.inline.example.jsx
// If your header renders <Link> tags inline, copy & paste these (preserve your classes).
import { Link } from 'react-router-dom';

export function HeaderLinksInline() {
  return (
    <nav className="YOUR_EXISTING_NAV_CLASSES">
      <Link className="YOUR_LINK_CLASSES" to="/">Home</Link>
      <Link className="YOUR_LINK_CLASSES" to="/mlb-hr">MLB HR</Link>
      <Link className="YOUR_LINK_CLASSES" to="/mlb-hits2">MLB 2+ Hits</Link>
      <Link className="YOUR_LINK_CLASSES" to="/hrr">HRR</Link> {/* NEW */}
      <Link className="YOUR_LINK_CLASSES" to="/nfl-td">NFL TD</Link>
      <Link className="YOUR_LINK_CLASSES" to="/nfl-negcorr">NFL NegCorr</Link>
      {/* Removed: MLB SB, Soccer AGS, Parlays */}
    </nav>
  );
}
