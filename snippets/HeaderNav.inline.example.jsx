// snippets/HeaderNav.inline.example.jsx
// Use this if your header renders <Link> tags directly.
import { Link } from 'react-router-dom';

export function HeaderLinksInline() {
  return (
    <nav className="your-existing-nav-classes">
      <Link className="your-existing-link-classes" to="/">Home</Link>
      <Link className="your-existing-link-classes" to="/mlb-hr">MLB HR</Link>
      <Link className="your-existing-link-classes" to="/mlb-hits2">MLB 2+ Hits</Link>
      <Link className="your-existing-link-classes" to="/hrr">HRR</Link> {/* NEW */}
      <Link className="your-existing-link-classes" to="/nfl-td">NFL TD</Link>
      <Link className="your-existing-link-classes" to="/nfl-negcorr">NFL NegCorr</Link>
      {/* Removed: MLB SB, Soccer AGS, Parlays */}
    </nav>
  );
}
