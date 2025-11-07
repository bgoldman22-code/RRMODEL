# Enhanced Week Preview Feature

## What Changed

The "Looking Ahead" section in weekly roasts is now **much more detailed** with comprehensive matchup analysis, injury reports, and playoff implications.

## New Features

### 1. **Matchup Classification**
Each Week preview matchup is now categorized:
- 🔥 **PLAYOFF SHOWDOWN** - Both teams in playoff spots (top 6)
- 🗑️ **BATTLE FOR LAST PLACE** - Teams fighting to avoid last place (bottom 3)
- ⚔️ **NAIL-BITER** - Close projections (within 10 points)
- 📊 **KEY MATCHUP** - Standard matchups

### 2. **Score Projections**
Every matchup shows projected scores for both teams:
```
Team A (7-2, #2) 125.3pts vs Team B (5-4, #5) 118.7pts
```

### 3. **Injury Reports**
Lists injured/out players for each team with their status:
- **IR** - Injured Reserve
- **O** - Out
- **D** - Doubtful
- **Q** - Questionable

Example:
```
🔥 PLAYOFF SHOWDOWN: Elite Squad (7-2, #2) 125.3pts vs Comeback Kids (6-3, #3) 122.1pts
  Elite Squad injuries: Christian McCaffrey (IR), Deebo Samuel (Q)
  Comeback Kids injuries: None
```

### 4. **Expanded Preview Section**
- Increased from generic 1-2 sentence preview to **150+ words**
- AI now focuses heavily on:
  - Top playoff matchups and their implications
  - Bottom teams fighting for draft position
  - Injury impacts that could swing games
  - Bold predictions with reasoning
  - Season context and urgency

### 5. **Overall Length Increase**
- Total roast length: 400 words → **500 words**
- Preview section alone: ~50 words → **150+ words**

## Technical Implementation

### Data Fetching
```javascript
// Fetch NEXT week's matchups with projections
const nextWeekMatchups = await getLeagueScoreboard(accessToken, leagueKey, currentWeek);

// Fetch NEXT week's rosters to check injuries
const nextWeekRoster = await getTeamRoster(accessToken, standing.team_key, currentWeek);

// Identify injured players (IR/O/D/Q status)
const injuredNextWeek = nextWeekRoster.filter(p => 
  p.status && ['IR', 'O', 'D', 'Q'].includes(p.status) && p.slot !== 'BN'
);
```

### Prompt Enhancement
The AI is now explicitly instructed:
```
6. <h3>Looking Ahead to Week ${currentWeek}</h3> - **DETAILED PREVIEW** (150+ words):
   - Highlight TOP playoff matchups (teams fighting for postseason spots)
   - Call out BOTTOM matchups (last place battles) 
   - Mention projected score predictions for key games
   - Note ANY injured/out players that could swing matchups
   - Build drama around close projections and playoff implications
   - Make bold predictions about who wins/loses and why
```

## Performance Impact

- **Additional API Calls**: 12 extra roster fetches (one per team for next week)
- **Estimated Time Added**: 1-2 seconds
- **Token Usage**: Increased from 1200 to 1500 max_tokens
- **Total Function Time**: Still well under 30s (typically 14-20s)

## Example Output

### Before (Generic)
```html
<h3>Looking Ahead</h3>
<p>Week 10 is here! Top teams face tough matchups while bottom teams fight for pride. 
Playoff implications are huge!</p>
```

### After (Detailed - adapts to character voice)

**Trump Character:**
```html
<h3>Looking Ahead to Week 10</h3>
<p>Folks, Week 10 is ABSOLUTELY CRITICAL! The playoff picture is getting clearer!</p>

<p><strong>TOP MATCHUP:</strong> Elite Squad (7-2, #2) takes on Comeback Kids (6-3, #3) 
in a MASSIVE playoff showdown! Projected at 125.3 vs 122.1, this one's gonna be TIGHT! 
But watch out - Elite Squad has CMC on IR and Deebo questionable. That could be 
DISASTROUS! Comeback Kids might steal this one!</p>

<p><strong>LAST PLACE BATTLE:</strong> Bottom Dwellers (2-7, #11) vs The Strugglers (1-8, #12) 
- somebody's gotta lose! Projected at 87.4 vs 82.1, this is the definition of mediocrity! 
Both teams have given up, but The Strugglers have Mahomes on bye week. YIKES!</p>

<p>My prediction? Elite Squad stumbles without CMC, Comeback Kids capitalize. 
Bottom Dwellers finally win one. Week 10 is gonna be HUGE!</p>
```

**Gandalf Character:**
```html
<h3>Looking Ahead to Week 10</h3>
<p>A great shadow falls upon the coming battles, my friends. The fates of many 
shall be decided in Week 10.</p>

<p>Elite Squad, once mighty warriors of the realm, now march into battle with 
McCaffrey fallen to injury's curse. They face Comeback Kids in a contest that 
may determine their path to the postseason. The projections speak of 125.3 
against 122.1 - a close affair indeed.</p>

<p>In the depths below, Bottom Dwellers and The Strugglers wage their own war - 
not for glory, but to avoid the shame of finishing last. Both have suffered 
greatly this season. The cards predict 87.4 and 82.1 - neither impressive.</p>

<p>Heed my words: injuries shall swing these battles. The loss of McCaffrey 
may doom Elite Squad. Victory favors the bold, but also the healthy!</p>
```

**Leslie Knope Character:**
```html
<h3>Looking Ahead to Week 10</h3>
<p>OH MY GOSH you guys, Week 10 is literally the most important week of the 
ENTIRE SEASON! I am SO EXCITED!</p>

<p>Elite Squad versus Comeback Kids is going to be AMAZING! These are two 
INCREDIBLE teams - 7-2 and 6-3! - and they're projected super close at 
125.3 and 122.1! Though I'm a teensy bit worried about CMC being on IR 
because that's not ideal, but you know what? They can TOTALLY still pull 
this off with teamwork and positive attitudes!</p>

<p>And even Bottom Dwellers and The Strugglers deserve our support! Yes, 
they're 2-7 and 1-8, but that just means they've had CHARACTER-BUILDING 
experiences! Every team matters in our beautiful fantasy league family!</p>

<p>I predict everyone is going to try their ABSOLUTE BEST and we're going 
to see some FANTASTIC football! GO TEAM!</p>
```

## User Benefits

1. **More Context** - Users understand the stakes for each matchup
2. **Injury Awareness** - Know which teams are dealing with key injuries
3. **Playoff Clarity** - See which matchups matter most for postseason
4. **Entertainment Value** - More dramatic predictions and analysis in character voice
5. **Strategic Value** - Injury info helps with waiver wire decisions
6. **Character Consistency** - Each tone/character interprets the data in their unique voice

## API Cost Impact

- **Before**: ~12 API calls per roast generation
- **After**: ~24 API calls per roast generation (doubled)
- **Yahoo API**: Free tier is generous, no cost impact expected
- **OpenAI API**: Minimal increase (~300 tokens = $0.0001 more per roast)

## Configuration

No configuration changes needed - enhancement is automatic for all tones:
- `default` (savage)
- `trump`
- `obama`
- `rodney`
- `leslie`
- `valleygirl`
- `viking`
- `tarot`
- `yoda`
- `gandalf`

All characters now provide detailed Week previews in their unique voice!

---

**Deployed**: November 7, 2024  
**Commit**: b576e777  
**Branch**: main42
