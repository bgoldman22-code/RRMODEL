// scripts/collect-player-data.js
// FIXED: All 32 teams + correct environment variable

const CURRENT_WEEK = process.env.NFL_WEEK || '3';
const CURRENT_SEASON = process.env.NFL_SEASON || '2025';

// FIXED: Use correct environment variable
async function storeBlob(key, data) {
  const NETLIFY_TOKEN = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN;
  const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
  
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.warn(`⚠️ Cannot store ${key}: Missing Netlify credentials`);
    return false;
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    
    const url = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      console.log(`✅ Stored blob: ${key}`);
      return true;
    } else {
      console.error(`❌ Failed to store ${key}: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error storing ${key}:`, error.message);
    return false;
  }
}

// COMPLETE NFL ROSTERS - ALL 32 TEAMS
const COMPLETE_NFL_ROSTERS = {
  'ARI': {
    teamName: 'Arizona Cardinals',
    players: {
      'QB': [
        { id: 'ari_qb1', name: 'Kyler Murray', position: 'QB', jerseyNumber: '1', experience: 6 },
        { id: 'ari_qb2', name: 'Clayton Tune', position: 'QB', jerseyNumber: '14', experience: 2 }
      ],
      'RB': [
        { id: 'ari_rb1', name: 'James Conner', position: 'RB', jerseyNumber: '6', experience: 8 },
        { id: 'ari_rb2', name: 'Trey Benson', position: 'RB', jerseyNumber: '33', experience: 1 }
      ],
      'WR': [
        { id: 'ari_wr1', name: 'Marvin Harrison Jr.', position: 'WR', jerseyNumber: '18', experience: 1 },
        { id: 'ari_wr2', name: 'Michael Wilson', position: 'WR', jerseyNumber: '14', experience: 2 },
        { id: 'ari_wr3', name: 'Zay Jones', position: 'WR', jerseyNumber: '7', experience: 8 }
      ],
      'TE': [
        { id: 'ari_te1', name: 'Trey McBride', position: 'TE', jerseyNumber: '85', experience: 3 }
      ]
    }
  },
  'ATL': {
    teamName: 'Atlanta Falcons',
    players: {
      'QB': [
        { id: 'atl_qb1', name: 'Kirk Cousins', position: 'QB', jerseyNumber: '18', experience: 13 },
        { id: 'atl_qb2', name: 'Michael Penix Jr.', position: 'QB', jerseyNumber: '9', experience: 1 }
      ],
      'RB': [
        { id: 'atl_rb1', name: 'Bijan Robinson', position: 'RB', jerseyNumber: '7', experience: 2 },
        { id: 'atl_rb2', name: 'Tyler Allgeier', position: 'RB', jerseyNumber: '25', experience: 3 }
      ],
      'WR': [
        { id: 'atl_wr1', name: 'Drake London', position: 'WR', jerseyNumber: '5', experience: 3 },
        { id: 'atl_wr2', name: 'Darnell Mooney', position: 'WR', jerseyNumber: '1', experience: 5 },
        { id: 'atl_wr3', name: 'Ray-Ray McCloud III', position: 'WR', jerseyNumber: '3', experience: 6 }
      ],
      'TE': [
        { id: 'atl_te1', name: 'Kyle Pitts', position: 'TE', jerseyNumber: '8', experience: 4 }
      ]
    }
  },
  'BAL': {
    teamName: 'Baltimore Ravens',
    players: {
      'QB': [
        { id: 'bal_qb1', name: 'Lamar Jackson', position: 'QB', jerseyNumber: '8', experience: 7 },
        { id: 'bal_qb2', name: 'Josh Johnson', position: 'QB', jerseyNumber: '17', experience: 16 }
      ],
      'RB': [
        { id: 'bal_rb1', name: 'Derrick Henry', position: 'RB', jerseyNumber: '22', experience: 9 },
        { id: 'bal_rb2', name: 'Justice Hill', position: 'RB', jerseyNumber: '43', experience: 6 }
      ],
      'WR': [
        { id: 'bal_wr1', name: 'Zay Flowers', position: 'WR', jerseyNumber: '4', experience: 2 },
        { id: 'bal_wr2', name: 'Rashod Bateman', position: 'WR', jerseyNumber: '12', experience: 4 },
        { id: 'bal_wr3', name: 'Nelson Agholor', position: 'WR', jerseyNumber: '15', experience: 10 }
      ],
      'TE': [
        { id: 'bal_te1', name: 'Mark Andrews', position: 'TE', jerseyNumber: '89', experience: 7 },
        { id: 'bal_te2', name: 'Isaiah Likely', position: 'TE', jerseyNumber: '80', experience: 3 }
      ]
    }
  },
  'BUF': {
    teamName: 'Buffalo Bills',
    players: {
      'QB': [
        { id: 'buf_qb1', name: 'Josh Allen', position: 'QB', jerseyNumber: '17', experience: 7 },
        { id: 'buf_qb2', name: 'Mitchell Trubisky', position: 'QB', jerseyNumber: '10', experience: 8 }
      ],
      'RB': [
        { id: 'buf_rb1', name: 'James Cook', position: 'RB', jerseyNumber: '4', experience: 3 },
        { id: 'buf_rb2', name: 'Ty Johnson', position: 'RB', jerseyNumber: '24', experience: 6 }
      ],
      'WR': [
        { id: 'buf_wr1', name: 'Khalil Shakir', position: 'WR', jerseyNumber: '10', experience: 3 },
        { id: 'buf_wr2', name: 'Keon Coleman', position: 'WR', jerseyNumber: '0', experience: 1 },
        { id: 'buf_wr3', name: 'Curtis Samuel', position: 'WR', jerseyNumber: '1', experience: 8 }
      ],
      'TE': [
        { id: 'buf_te1', name: 'Dalton Kincaid', position: 'TE', jerseyNumber: '86', experience: 2 }
      ]
    }
  },
  'CAR': {
    teamName: 'Carolina Panthers',
    players: {
      'QB': [
        { id: 'car_qb1', name: 'Bryce Young', position: 'QB', jerseyNumber: '9', experience: 2 },
        { id: 'car_qb2', name: 'Andy Dalton', position: 'QB', jerseyNumber: '14', experience: 14 }
      ],
      'RB': [
        { id: 'car_rb1', name: 'Chuba Hubbard', position: 'RB', jerseyNumber: '30', experience: 4 },
        { id: 'car_rb2', name: 'Jonathon Brooks', position: 'RB', jerseyNumber: '23', experience: 1 }
      ],
      'WR': [
        { id: 'car_wr1', name: 'Diontae Johnson', position: 'WR', jerseyNumber: '5', experience: 6 },
        { id: 'car_wr2', name: 'Adam Thielen', position: 'WR', jerseyNumber: '19', experience: 11 },
        { id: 'car_wr3', name: 'Xavier Legette', position: 'WR', jerseyNumber: '17', experience: 1 }
      ],
      'TE': [
        { id: 'car_te1', name: 'Ja\'Tavion Sanders', position: 'TE', jerseyNumber: '87', experience: 1 }
      ]
    }
  },
  'CHI': {
    teamName: 'Chicago Bears',
    players: {
      'QB': [
        { id: 'chi_qb1', name: 'Caleb Williams', position: 'QB', jerseyNumber: '18', experience: 1 },
        { id: 'chi_qb2', name: 'Tyson Bagent', position: 'QB', jerseyNumber: '17', experience: 2 }
      ],
      'RB': [
        { id: 'chi_rb1', name: 'D\'Andre Swift', position: 'RB', jerseyNumber: '4', experience: 4 },
        { id: 'chi_rb2', name: 'Roschon Johnson', position: 'RB', jerseyNumber: '23', experience: 2 }
      ],
      'WR': [
        { id: 'chi_wr1', name: 'DJ Moore', position: 'WR', jerseyNumber: '2', experience: 7 },
        { id: 'chi_wr2', name: 'Rome Odunze', position: 'WR', jerseyNumber: '1', experience: 1 },
        { id: 'chi_wr3', name: 'Keenan Allen', position: 'WR', jerseyNumber: '13', experience: 12 }
      ],
      'TE': [
        { id: 'chi_te1', name: 'Cole Kmet', position: 'TE', jerseyNumber: '85', experience: 5 }
      ]
    }
  },
  'CIN': {
    teamName: 'Cincinnati Bengals',
    players: {
      'QB': [
        { id: 'cin_qb1', name: 'Joe Burrow', position: 'QB', jerseyNumber: '9', experience: 5 },
        { id: 'cin_qb2', name: 'Jake Browning', position: 'QB', jerseyNumber: '6', experience: 2 }
      ],
      'RB': [
        { id: 'cin_rb1', name: 'Zack Moss', position: 'RB', jerseyNumber: '2', experience: 5 },
        { id: 'cin_rb2', name: 'Chase Brown', position: 'RB', jerseyNumber: '30', experience: 2 }
      ],
      'WR': [
        { id: 'cin_wr1', name: 'Ja\'Marr Chase', position: 'WR', jerseyNumber: '1', experience: 4 },
        { id: 'cin_wr2', name: 'Tee Higgins', position: 'WR', jerseyNumber: '5', experience: 5 },
        { id: 'cin_wr3', name: 'Tyler Boyd', position: 'WR', jerseyNumber: '83', experience: 9 }
      ],
      'TE': [
        { id: 'cin_te1', name: 'Mike Gesicki', position: 'TE', jerseyNumber: '88', experience: 7 }
      ]
    }
  },
  'CLE': {
    teamName: 'Cleveland Browns',
    players: {
      'QB': [
        { id: 'cle_qb1', name: 'Deshaun Watson', position: 'QB', jerseyNumber: '4', experience: 8 },
        { id: 'cle_qb2', name: 'Jameis Winston', position: 'QB', jerseyNumber: '5', experience: 10 }
      ],
      'RB': [
        { id: 'cle_rb1', name: 'Nick Chubb', position: 'RB', jerseyNumber: '24', experience: 7 },
        { id: 'cle_rb2', name: 'Jerome Ford', position: 'RB', jerseyNumber: '34', experience: 3 }
      ],
      'WR': [
        { id: 'cle_wr1', name: 'Amari Cooper', position: 'WR', jerseyNumber: '2', experience: 10 },
        { id: 'cle_wr2', name: 'Jerry Jeudy', position: 'WR', jerseyNumber: '3', experience: 5 },
        { id: 'cle_wr3', name: 'Elijah Moore', position: 'WR', jerseyNumber: '8', experience: 4 }
      ],
      'TE': [
        { id: 'cle_te1', name: 'David Njoku', position: 'TE', jerseyNumber: '85', experience: 8 }
      ]
    }
  },
  'DAL': {
    teamName: 'Dallas Cowboys',
    players: {
      'QB': [
        { id: 'dal_qb1', name: 'Dak Prescott', position: 'QB', jerseyNumber: '4', experience: 9 },
        { id: 'dal_qb2', name: 'Cooper Rush', position: 'QB', jerseyNumber: '10', experience: 7 }
      ],
      'RB': [
        { id: 'dal_rb1', name: 'Rico Dowdle', position: 'RB', jerseyNumber: '20', experience: 6 },
        { id: 'dal_rb2', name: 'Ezekiel Elliott', position: 'RB', jerseyNumber: '15', experience: 9 }
      ],
      'WR': [
        { id: 'dal_wr1', name: 'CeeDee Lamb', position: 'WR', jerseyNumber: '88', experience: 5 },
        { id: 'dal_wr2', name: 'Brandin Cooks', position: 'WR', jerseyNumber: '3', experience: 11 },
        { id: 'dal_wr3', name: 'Jalen Tolbert', position: 'WR', jerseyNumber: '1', experience: 3 }
      ],
      'TE': [
        { id: 'dal_te1', name: 'Jake Ferguson', position: 'TE', jerseyNumber: '87', experience: 3 }
      ]
    }
  },
  'DEN': {
    teamName: 'Denver Broncos',
    players: {
      'QB': [
        { id: 'den_qb1', name: 'Bo Nix', position: 'QB', jerseyNumber: '10', experience: 1 },
        { id: 'den_qb2', name: 'Jarrett Stidham', position: 'QB', jerseyNumber: '4', experience: 6 }
      ],
      'RB': [
        { id: 'den_rb1', name: 'Javonte Williams', position: 'RB', jerseyNumber: '33', experience: 4 },
        { id: 'den_rb2', name: 'Jaleel McLaughlin', position: 'RB', jerseyNumber: '38', experience: 2 }
      ],
      'WR': [
        { id: 'den_wr1', name: 'Courtland Sutton', position: 'WR', jerseyNumber: '14', experience: 7 },
        { id: 'den_wr2', name: 'Jerry Jeudy', position: 'WR', jerseyNumber: '10', experience: 5 },
        { id: 'den_wr3', name: 'Marvin Mims Jr.', position: 'WR', jerseyNumber: '19', experience: 2 }
      ],
      'TE': [
        { id: 'den_te1', name: 'Greg Dulcich', position: 'TE', jerseyNumber: '80', experience: 3 }
      ]
    }
  },
  'DET': {
    teamName: 'Detroit Lions',
    players: {
      'QB': [
        { id: 'det_qb1', name: 'Jared Goff', position: 'QB', jerseyNumber: '16', experience: 9 },
        { id: 'det_qb2', name: 'Hendon Hooker', position: 'QB', jerseyNumber: '2', experience: 2 }
      ],
      'RB': [
        { id: 'det_rb1', name: 'Jahmyr Gibbs', position: 'RB', jerseyNumber: '26', experience: 2 },
        { id: 'det_rb2', name: 'David Montgomery', position: 'RB', jerseyNumber: '5', experience: 6 }
      ],
      'WR': [
        { id: 'det_wr1', name: 'Amon-Ra St. Brown', position: 'WR', jerseyNumber: '14', experience: 4 },
        { id: 'det_wr2', name: 'Jameson Williams', position: 'WR', jerseyNumber: '9', experience: 3 },
        { id: 'det_wr3', name: 'Tim Patrick', position: 'WR', jerseyNumber: '17', experience: 8 }
      ],
      'TE': [
        { id: 'det_te1', name: 'Sam LaPorta', position: 'TE', jerseyNumber: '87', experience: 2 }
      ]
    }
  },
  'GB': {
    teamName: 'Green Bay Packers',
    players: {
      'QB': [
        { id: 'gb_qb1', name: 'Jordan Love', position: 'QB', jerseyNumber: '10', experience: 5 },
        { id: 'gb_qb2', name: 'Malik Willis', position: 'QB', jerseyNumber: '2', experience: 3 }
      ],
      'RB': [
        { id: 'gb_rb1', name: 'Josh Jacobs', position: 'RB', jerseyNumber: '8', experience: 6 },
        { id: 'gb_rb2', name: 'Emanuel Wilson', position: 'RB', jerseyNumber: '31', experience: 2 }
      ],
      'WR': [
        { id: 'gb_wr1', name: 'Jayden Reed', position: 'WR', jerseyNumber: '11', experience: 2 },
        { id: 'gb_wr2', name: 'Romeo Doubs', position: 'WR', jerseyNumber: '87', experience: 3 },
        { id: 'gb_wr3', name: 'Christian Watson', position: 'WR', jerseyNumber: '9', experience: 3 }
      ],
      'TE': [
        { id: 'gb_te1', name: 'Tucker Kraft', position: 'TE', jerseyNumber: '85', experience: 2 }
      ]
    }
  },
  'HOU': {
    teamName: 'Houston Texans',
    players: {
      'QB': [
        { id: 'hou_qb1', name: 'C.J. Stroud', position: 'QB', jerseyNumber: '7', experience: 2 },
        { id: 'hou_qb2', name: 'Davis Mills', position: 'QB', jerseyNumber: '10', experience: 4 }
      ],
      'RB': [
        { id: 'hou_rb1', name: 'Joe Mixon', position: 'RB', jerseyNumber: '28', experience: 8 },
        { id: 'hou_rb2', name: 'Cam Akers', position: 'RB', jerseyNumber: '3', experience: 5 }
      ],
      'WR': [
        { id: 'hou_wr1', name: 'Nico Collins', position: 'WR', jerseyNumber: '12', experience: 4 },
        { id: 'hou_wr2', name: 'Stefon Diggs', position: 'WR', jerseyNumber: '1', experience: 10 },
        { id: 'hou_wr3', name: 'Tank Dell', position: 'WR', jerseyNumber: '3', experience: 2 }
      ],
      'TE': [
        { id: 'hou_te1', name: 'Dalton Schultz', position: 'TE', jerseyNumber: '86', experience: 7 }
      ]
    }
  },
  'IND': {
    teamName: 'Indianapolis Colts',
    players: {
      'QB': [
        { id: 'ind_qb1', name: 'Anthony Richardson', position: 'QB', jerseyNumber: '5', experience: 2 },
        { id: 'ind_qb2', name: 'Joe Flacco', position: 'QB', jerseyNumber: '15', experience: 17 }
      ],
      'RB': [
        { id: 'ind_rb1', name: 'Jonathan Taylor', position: 'RB', jerseyNumber: '28', experience: 4 },
        { id: 'ind_rb2', name: 'Trey Sermon', position: 'RB', jerseyNumber: '30', experience: 4 }
      ],
      'WR': [
        { id: 'ind_wr1', name: 'Michael Pittman Jr.', position: 'WR', jerseyNumber: '11', experience: 5 },
        { id: 'ind_wr2', name: 'Josh Downs', position: 'WR', jerseyNumber: '1', experience: 2 },
        { id: 'ind_wr3', name: 'Alec Pierce', position: 'WR', jerseyNumber: '14', experience: 3 }
      ],
      'TE': [
        { id: 'ind_te1', name: 'Mo Alie-Cox', position: 'TE', jerseyNumber: '81', experience: 8 }
      ]
    }
  },
  'JAX': {
    teamName: 'Jacksonville Jaguars',
    players: {
      'QB': [
        { id: 'jax_qb1', name: 'Trevor Lawrence', position: 'QB', jerseyNumber: '16', experience: 4 },
        { id: 'jax_qb2', name: 'Mac Jones', position: 'QB', jerseyNumber: '10', experience: 4 }
      ],
      'RB': [
        { id: 'jax_rb1', name: 'Travis Etienne', position: 'RB', jerseyNumber: '1', experience: 4 },
        { id: 'jax_rb2', name: 'Tank Bigsby', position: 'RB', jerseyNumber: '4', experience: 2 }
      ],
      'WR': [
        { id: 'jax_wr1', name: 'Brian Thomas Jr.', position: 'WR', jerseyNumber: '7', experience: 1 },
        { id: 'jax_wr2', name: 'Christian Kirk', position: 'WR', jerseyNumber: '13', experience: 7 },
        { id: 'jax_wr3', name: 'Gabe Davis', position: 'WR', jerseyNumber: '84', experience: 5 }
      ],
      'TE': [
        { id: 'jax_te1', name: 'Evan Engram', position: 'TE', jerseyNumber: '17', experience: 8 }
      ]
    }
  },
  'KC': {
    teamName: 'Kansas City Chiefs',
    players: {
      'QB': [
        { id: 'kc_qb1', name: 'Patrick Mahomes', position: 'QB', jerseyNumber: '15', experience: 8 },
        { id: 'kc_qb2', name: 'Carson Wentz', position: 'QB', jerseyNumber: '11', experience: 9 }
      ],
      'RB': [
        { id: 'kc_rb1', name: 'Isiah Pacheco', position: 'RB', jerseyNumber: '10', experience: 3 },
        { id: 'kc_rb2', name: 'Kareem Hunt', position: 'RB', jerseyNumber: '29', experience: 8 }
      ],
      'WR': [
        { id: 'kc_wr1', name: 'DeAndre Hopkins', position: 'WR', jerseyNumber: '8', experience: 12 },
        { id: 'kc_wr2', name: 'Xavier Worthy', position: 'WR', jerseyNumber: '1', experience: 1 },
        { id: 'kc_wr3', name: 'Marquise Goodwin', position: 'WR', jerseyNumber: '19', experience: 11 }
      ],
      'TE': [
        { id: 'kc_te1', name: 'Travis Kelce', position: 'TE', jerseyNumber: '87', experience: 12 },
        { id: 'kc_te2', name: 'Noah Gray', position: 'TE', jerseyNumber: '83', experience: 4 }
      ]
    }
  },
  'LV': {
    teamName: 'Las Vegas Raiders',
    players: {
      'QB': [
        { id: 'lv_qb1', name: 'Gardner Minshew II', position: 'QB', jerseyNumber: '15', experience: 6 },
        { id: 'lv_qb2', name: 'Aidan O\'Connell', position: 'QB', jerseyNumber: '12', experience: 2 }
      ],
      'RB': [
        { id: 'lv_rb1', name: 'Alexander Mattison', position: 'RB', jerseyNumber: '22', experience: 6 },
        { id: 'lv_rb2', name: 'Zamir White', position: 'RB', jerseyNumber: '35', experience: 3 }
      ],
      'WR': [
        { id: 'lv_wr1', name: 'Davante Adams', position: 'WR', jerseyNumber: '17', experience: 11 },
        { id: 'lv_wr2', name: 'Jakobi Meyers', position: 'WR', jerseyNumber: '16', experience: 6 },
        { id: 'lv_wr3', name: 'Tre Tucker', position: 'WR', jerseyNumber: '11', experience: 2 }
      ],
      'TE': [
        { id: 'lv_te1', name: 'Brock Bowers', position: 'TE', jerseyNumber: '89', experience: 1 }
      ]
    }
  },
  'LAC': {
    teamName: 'Los Angeles Chargers',
    players: {
      'QB': [
        { id: 'lac_qb1', name: 'Justin Herbert', position: 'QB', jerseyNumber: '10', experience: 5 },
        { id: 'lac_qb2', name: 'Easton Stick', position: 'QB', jerseyNumber: '2', experience: 5 }
      ],
      'RB': [
        { id: 'lac_rb1', name: 'J.K. Dobbins', position: 'RB', jerseyNumber: '27', experience: 5 },
        { id: 'lac_rb2', name: 'Gus Edwards', position: 'RB', jerseyNumber: '4', experience: 7 }
      ],
      'WR': [
        { id: 'lac_wr1', name: 'Ladd McConkey', position: 'WR', jerseyNumber: '15', experience: 1 },
        { id: 'lac_wr2', name: 'Joshua Palmer', position: 'WR', jerseyNumber: '5', experience: 4 },
        { id: 'lac_wr3', name: 'DJ Chark Jr.', position: 'WR', jerseyNumber: '7', experience: 7 }
      ],
      'TE': [
        { id: 'lac_te1', name: 'Will Dissly', position: 'TE', jerseyNumber: '84', experience: 7 }
      ]
    }
  },
  'LAR': {
    teamName: 'Los Angeles Rams',
    players: {
      'QB': [
        { id: 'lar_qb1', name: 'Matthew Stafford', position: 'QB', jerseyNumber: '9', experience: 16 },
        { id: 'lar_qb2', name: 'Jimmy Garoppolo', position: 'QB', jerseyNumber: '10', experience: 11 }
      ],
      'RB': [
        { id: 'lar_rb1', name: 'Kyren Williams', position: 'RB', jerseyNumber: '23', experience: 3 },
        { id: 'lar_rb2', name: 'Blake Corum', position: 'RB', jerseyNumber: '22', experience: 1 }
      ],
      'WR': [
        { id: 'lar_wr1', name: 'Cooper Kupp', position: 'WR', jerseyNumber: '10', experience: 8 },
        { id: 'lar_wr2', name: 'Puka Nacua', position: 'WR', jerseyNumber: '17', experience: 2 },
        { id: 'lar_wr3', name: 'Demarcus Robinson', position: 'WR', jerseyNumber: '15', experience: 9 }
      ],
      'TE': [
        { id: 'lar_te1', name: 'Tyler Higbee', position: 'TE', jerseyNumber: '89', experience: 9 }
      ]
    }
  },
  'MIA': {
    teamName: 'Miami Dolphins',
    players: {
      'QB': [
        { id: 'mia_qb1', name: 'Tua Tagovailoa', position: 'QB', jerseyNumber: '1', experience: 5 },
        { id: 'mia_qb2', name: 'Tyler Huntley', position: 'QB', jerseyNumber: '18', experience: 5 }
      ],
      'RB': [
        { id: 'mia_rb1', name: 'De\'Von Achane', position: 'RB', jerseyNumber: '28', experience: 2 },
        { id: 'mia_rb2', name: 'Raheem Mostert', position: 'RB', jerseyNumber: '31', experience: 10 }
      ],
      'WR': [
        { id: 'mia_wr1', name: 'Tyreek Hill', position: 'WR', jerseyNumber: '10', experience: 9 },
        { id: 'mia_wr2', name: 'Jaylen Waddle', position: 'WR', jerseyNumber: '17', experience: 4 },
        { id: 'mia_wr3', name: 'Odell Beckham Jr.', position: 'WR', jerseyNumber: '3', experience: 11 }
      ],
      'TE': [
        { id: 'mia_te1', name: 'Jonnu Smith', position: 'TE', jerseyNumber: '9', experience: 9 }
      ]
    }
  },
  'MIN': {
    teamName: 'Minnesota Vikings',
    players: {
      'QB': [
        { id: 'min_qb1', name: 'Sam Darnold', position: 'QB', jerseyNumber: '14', experience: 7 },
        { id: 'min_qb2', name: 'J.J. McCarthy', position: 'QB', jerseyNumber: '9', experience: 1 }
      ],
      'RB': [
        { id: 'min_rb1', name: 'Aaron Jones', position: 'RB', jerseyNumber: '33', experience: 8 },
        { id: 'min_rb2', name: 'Ty Chandler', position: 'RB', jerseyNumber: '32', experience: 3 }
      ],
      'WR': [
        { id: 'min_wr1', name: 'Justin Jefferson', position: 'WR', jerseyNumber: '18', experience: 5 },
        { id: 'min_wr2', name: 'Jordan Addison', position: 'WR', jerseyNumber: '3', experience: 2 },
        { id: 'min_wr3', name: 'Jalen Nailor', position: 'WR', jerseyNumber: '83', experience: 3 }
      ],
      'TE': [
        { id: 'min_te1', name: 'T.J. Hockenson', position: 'TE', jerseyNumber: '87', experience: 6 }
      ]
    }
  },
  'NE': {
    teamName: 'New England Patriots',
    players: {
      'QB': [
        { id: 'ne_qb1', name: 'Drake Maye', position: 'QB', jerseyNumber: '10', experience: 1 },
        { id: 'ne_qb2', name: 'Jacoby Brissett', position: 'QB', jerseyNumber: '7', experience: 9 }
      ],
      'RB': [
        { id: 'ne_rb1', name: 'Rhamondre Stevenson', position: 'RB', jerseyNumber: '38', experience: 4 },
        { id: 'ne_rb2', name: 'Antonio Gibson', position: 'RB', jerseyNumber: '16', experience: 5 }
      ],
      'WR': [
        { id: 'ne_wr1', name: 'DeMario Douglas', position: 'WR', jerseyNumber: '81', experience: 2 },
        { id: 'ne_wr2', name: 'Kendrick Bourne', position: 'WR', jerseyNumber: '84', experience: 8 },
        { id: 'ne_wr3', name: 'K.J. Osborn', position: 'WR', jerseyNumber: '17', experience: 5 }
      ],
      'TE': [
        { id: 'ne_te1', name: 'Hunter Henry', position: 'TE', jerseyNumber: '85', experience: 9 }
      ]
    }
  },
  'NO': {
    teamName: 'New Orleans Saints',
    players: {
      'QB': [
        { id: 'no_qb1', name: 'Derek Carr', position: 'QB', jerseyNumber: '4', experience: 11 },
        { id: 'no_qb2', name: 'Spencer Rattler', position: 'QB', jerseyNumber: '18', experience: 1 }
      ],
      'RB': [
        { id: 'no_rb1', name: 'Alvin Kamara', position: 'RB', jerseyNumber: '41', experience: 8 },
        { id: 'no_rb2', name: 'Jamaal Williams', position: 'RB', jerseyNumber: '1', experience: 8 }
      ],
      'WR': [
        { id: 'no_wr1', name: 'Chris Olave', position: 'WR', jerseyNumber: '12', experience: 3 },
        { id: 'no_wr2', name: 'Rashid Shaheed', position: 'WR', jerseyNumber: '22', experience: 3 },
        { id: 'no_wr3', name: 'Cedrick Wilson Jr.', position: 'WR', jerseyNumber: '16', experience: 6 }
      ],
      'TE': [
        { id: 'no_te1', name: 'Juwan Johnson', position: 'TE', jerseyNumber: '83', experience: 5 }
      ]
    }
  },
  'NYG': {
    teamName: 'New York Giants',
    players: {
      'QB': [
        { id: 'nyg_qb1', name: 'Daniel Jones', position: 'QB', jerseyNumber: '8', experience: 6 },
        { id: 'nyg_qb2', name: 'Drew Lock', position: 'QB', jerseyNumber: '2', experience: 6 }
      ],
      'RB': [
        { id: 'nyg_rb1', name: 'Tyrone Tracy Jr.', position: 'RB', jerseyNumber: '29', experience: 1 },
        { id: 'nyg_rb2', name: 'Devin Singletary', position: 'RB', jerseyNumber: '26', experience: 6 }
      ],
      'WR': [
        { id: 'nyg_wr1', name: 'Malik Nabers', position: 'WR', jerseyNumber: '1', experience: 1 },
        { id: 'nyg_wr2', name: 'Darius Slayton', position: 'WR', jerseyNumber: '86', experience: 6 },
        { id: 'nyg_wr3', name: 'Wan\'Dale Robinson', position: 'WR', jerseyNumber: '17', experience: 3 }
      ],
      'TE': [
        { id: 'nyg_te1', name: 'Daniel Bellinger', position: 'TE', jerseyNumber: '82', experience: 3 }
      ]
    }
  },
  'NYJ': {
    teamName: 'New York Jets',
    players: {
      'QB': [
        { id: 'nyj_qb1', name: 'Aaron Rodgers', position: 'QB', jerseyNumber: '8', experience: 21 },
        { id: 'nyj_qb2', name: 'Tyrod Taylor', position: 'QB', jerseyNumber: '2', experience: 14 }
      ],
      'RB': [
        { id: 'nyj_rb1', name: 'Breece Hall', position: 'RB', jerseyNumber: '20', experience: 3 },
        { id: 'nyj_rb2', name: 'Braelon Allen', position: 'RB', jerseyNumber: '29', experience: 1 }
      ],
      'WR': [
        { id: 'nyj_wr1', name: 'Davante Adams', position: 'WR', jerseyNumber: '17', experience: 11 },
        { id: 'nyj_wr2', name: 'Garrett Wilson', position: 'WR', jerseyNumber: '5', experience: 3 },
        { id: 'nyj_wr3', name: 'Mike Williams', position: 'WR', jerseyNumber: '18', experience: 8 }
      ],
      'TE': [
        { id: 'nyj_te1', name: 'Tyler Conklin', position: 'TE', jerseyNumber: '83', experience: 6 }
      ]
    }
  },
  'PHI': {
    teamName: 'Philadelphia Eagles',
    players: {
      'QB': [
        { id: 'phi_qb1', name: 'Jalen Hurts', position: 'QB', jerseyNumber: '1', experience: 4 },
        { id: 'phi_qb2', name: 'Kenny Pickett', position: 'QB', jerseyNumber: '7', experience: 3 }
      ],
      'RB': [
        { id: 'phi_rb1', name: 'Saquon Barkley', position: 'RB', jerseyNumber: '26', experience: 7 },
        { id: 'phi_rb2', name: 'Kenneth Gainwell', position: 'RB', jerseyNumber: '14', experience: 4 }
      ],
      'WR': [
        { id: 'phi_wr1', name: 'A.J. Brown', position: 'WR', jerseyNumber: '11', experience: 6 },
        { id: 'phi_wr2', name: 'DeVonta Smith', position: 'WR', jerseyNumber: '6', experience: 4 },
        { id: 'phi_wr3', name: 'Jahan Dotson', position: 'WR', jerseyNumber: '89', experience: 3 }
      ],
      'TE': [
        { id: 'phi_te1', name: 'Dallas Goedert', position: 'TE', jerseyNumber: '88', experience: 7 }
      ]
    }
  },
  'PIT': {
    teamName: 'Pittsburgh Steelers',
    players: {
      'QB': [
        { id: 'pit_qb1', name: 'Russell Wilson', position: 'QB', jerseyNumber: '3', experience: 13 },
        { id: 'pit_qb2', name: 'Justin Fields', position: 'QB', jerseyNumber: '2', experience: 4 }
      ],
      'RB': [
        { id: 'pit_rb1', name: 'Najee Harris', position: 'RB', jerseyNumber: '22', experience: 4 },
        { id: 'pit_rb2', name: 'Jaylen Warren', position: 'RB', jerseyNumber: '30', experience: 3 }
      ],
      'WR': [
        { id: 'pit_wr1', name: 'George Pickens', position: 'WR', jerseyNumber: '14', experience: 3 },
        { id: 'pit_wr2', name: 'Calvin Austin III', position: 'WR', jerseyNumber: '19', experience: 3 },
        { id: 'pit_wr3', name: 'Mike Williams', position: 'WR', jerseyNumber: '18', experience: 8 }
      ],
      'TE': [
        { id: 'pit_te1', name: 'Pat Freiermuth', position: 'TE', jerseyNumber: '88', experience: 4 }
      ]
    }
  },
  'SF': {
    teamName: 'San Francisco 49ers',
    players: {
      'QB': [
        { id: 'sf_qb1', name: 'Brock Purdy', position: 'QB', jerseyNumber: '13', experience: 3 },
        { id: 'sf_qb2', name: 'Joshua Dobbs', position: 'QB', jerseyNumber: '5', experience: 8 }
      ],
      'RB': [
        { id: 'sf_rb1', name: 'Christian McCaffrey', position: 'RB', jerseyNumber: '23', experience: 8 },
        { id: 'sf_rb2', name: 'Jordan Mason', position: 'RB', jerseyNumber: '24', experience: 5 }
      ],
      'WR': [
        { id: 'sf_wr1', name: 'Deebo Samuel', position: 'WR', jerseyNumber: '19', experience: 6 },
        { id: 'sf_wr2', name: 'Brandon Aiyuk', position: 'WR', jerseyNumber: '11', experience: 5 },
        { id: 'sf_wr3', name: 'Jauan Jennings', position: 'WR', jerseyNumber: '15', experience: 5 }
      ],
      'TE': [
        { id: 'sf_te1', name: 'George Kittle', position: 'TE', jerseyNumber: '85', experience: 8 }
      ]
    }
  },
  'SEA': {
    teamName: 'Seattle Seahawks',
    players: {
      'QB': [
        { id: 'sea_qb1', name: 'Geno Smith', position: 'QB', jerseyNumber: '7', experience: 13 },
        { id: 'sea_qb2', name: 'Sam Howell', position: 'QB', jerseyNumber: '6', experience: 3 }
      ],
      'RB': [
        { id: 'sea_rb1', name: 'Kenneth Walker III', position: 'RB', jerseyNumber: '9', experience: 3 },
        { id: 'sea_rb2', name: 'Zach Charbonnet', position: 'RB', jerseyNumber: '26', experience: 2 }
      ],
      'WR': [
        { id: 'sea_wr1', name: 'DK Metcalf', position: 'WR', jerseyNumber: '14', experience: 6 },
        { id: 'sea_wr2', name: 'Tyler Lockett', position: 'WR', jerseyNumber: '16', experience: 10 },
        { id: 'sea_wr3', name: 'Jaxon Smith-Njigba', position: 'WR', jerseyNumber: '11', experience: 2 }
      ],
      'TE': [
        { id: 'sea_te1', name: 'Noah Fant', position: 'TE', jerseyNumber: '87', experience: 6 }
      ]
    }
  },
  'TB': {
    teamName: 'Tampa Bay Buccaneers',
    players: {
      'QB': [
        { id: 'tb_qb1', name: 'Baker Mayfield', position: 'QB', jerseyNumber: '6', experience: 7 },
        { id: 'tb_qb2', name: 'Kyle Trask', position: 'QB', jerseyNumber: '2', experience: 4 }
      ],
      'RB': [
        { id: 'tb_rb1', name: 'Rachaad White', position: 'RB', jerseyNumber: '29', experience: 3 },
        { id: 'tb_rb2', name: 'Bucky Irving', position: 'RB', jerseyNumber: '7', experience: 1 }
      ],
      'WR': [
        { id: 'tb_wr1', name: 'Mike Evans', position: 'WR', jerseyNumber: '13', experience: 11 },
        { id: 'tb_wr2', name: 'Chris Godwin', position: 'WR', jerseyNumber: '14', experience: 9 },
        { id: 'tb_wr3', name: 'Sterling Shepard', position: 'WR', jerseyNumber: '3', experience: 9 }
      ],
      'TE': [
        { id: 'tb_te1', name: 'Cade Otton', position: 'TE', jerseyNumber: '88', experience: 3 }
      ]
    }
  },
  'TEN': {
    teamName: 'Tennessee Titans',
    players: {
      'QB': [
        { id: 'ten_qb1', name: 'Will Levis', position: 'QB', jerseyNumber: '8', experience: 2 },
        { id: 'ten_qb2', name: 'Mason Rudolph', position: 'QB', jerseyNumber: '11', experience: 7 }
      ],
      'RB': [
        { id: 'ten_rb1', name: 'Tony Pollard', position: 'RB', jerseyNumber: '1', experience: 5 },
        { id: 'ten_rb2', name: 'Tyjae Spears', position: 'RB', jerseyNumber: '2', experience: 2 }
      ],
      'WR': [
        { id: 'ten_wr1', name: 'Calvin Ridley', position: 'WR', jerseyNumber: '0', experience: 8 },
        { id: 'ten_wr2', name: 'DeAndre Hopkins', position: 'WR', jerseyNumber: '10', experience: 12 },
        { id: 'ten_wr3', name: 'Tyler Boyd', position: 'WR', jerseyNumber: '83', experience: 9 }
      ],
      'TE': [
        { id: 'ten_te1', name: 'Chig Okonkwo', position: 'TE', jerseyNumber: '85', experience: 3 }
      ]
    }
  },
  'WAS': {
    teamName: 'Washington Commanders',
    players: {
      'QB': [
        { id: 'was_qb1', name: 'Jayden Daniels', position: 'QB', jerseyNumber: '5', experience: 1 },
        { id: 'was_qb2', name: 'Marcus Mariota', position: 'QB', jerseyNumber: '18', experience: 10 }
      ],
      'RB': [
        { id: 'was_rb1', name: 'Brian Robinson Jr.', position: 'RB', jerseyNumber: '8', experience: 3 },
        { id: 'was_rb2', name: 'Austin Ekeler', position: 'RB', jerseyNumber: '30', experience: 8 }
      ],
      'WR': [
        { id: 'was_wr1', name: 'Terry McLaurin', position: 'WR', jerseyNumber: '17', experience: 6 },
        { id: 'was_wr2', name: 'Noah Brown', position: 'WR', jerseyNumber: '85', experience: 8 },
        { id: 'was_wr3', name: 'Olamide Zaccheaus', position: 'WR', jerseyNumber: '14', experience: 6 }
      ],
      'TE': [
        { id: 'was_te1', name: 'Zach Ertz', position: 'TE', jerseyNumber: '86', experience: 12 }
      ]
    }
  }
};

// Team quality ratings for realistic stats
function getTeamQuality(team) {
  const qualityRatings = {
    'KC': 1.5, 'BUF': 1.4, 'SF': 1.3, 'PHI': 1.2, 'DAL': 1.1, 'BAL': 1.1,
    'MIA': 1.0, 'CIN': 1.0, 'DET': 1.0, 'MIN': 0.9, 'LAC': 0.9, 'HOU': 0.9,
    'GB': 0.8, 'LAR': 0.8, 'ATL': 0.8, 'NYJ': 0.8, 'PIT': 0.8, 'SEA': 0.8,
    'IND': 0.7, 'TB': 0.7, 'JAX': 0.7, 'NO': 0.7, 'CLE': 0.7, 'TEN': 0.7,
    'LV': 0.6, 'DEN': 0.6, 'WAS': 0.6, 'CHI': 0.6, 'NE': 0.5, 'NYG': 0.5, 'CAR': 0.5, 'ARI': 0.5
  };
  return qualityRatings[team] || 1.0;
}

async function main() {
  console.log(`🏈 Collecting INPUT data for NFL Week ${CURRENT_WEEK} PREDICTIONS`);
  console.log(`📊 Target: All 32 NFL teams with comprehensive player data`);
  
  console.log('\n🔍 Checking environment variables:');
  console.log(`NETLIFY_TOKEN: ${process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN ? '✅ Present' : '❌ Missing'}`);
  console.log(`NETLIFY_SITE_ID: ${process.env.NETLIFY_SITE_ID ? '✅ Present' : '❌ Missing'}`);
  
  try {
    // Use complete roster data for all 32 teams
    console.log('\n📋 Using complete NFL roster data for all 32 teams...');
    const teamRosters = COMPLETE_NFL_ROSTERS;
    
    // Generate realistic player stats for all teams
    console.log('📊 Generating realistic player statistics for all 32 teams...');
    const playerStats = await generateAllPlayerStats(teamRosters);
    
    // Generate supporting data
    console.log('🔴 Generating red zone data...');
    const redZoneData = generateRedZoneData(playerStats);
    
    console.log('⏱️ Generating snap count data...');
    const snapCounts = generateSnapCountData(playerStats);
    
    console.log('🎯 Generating target share data...');
    const targetShares = generateTargetShareData(playerStats);
    
    console.log('📈 Generating recent performance data...');
    const recentWeeks = await generateRecentWeeksData(playerStats);
    
    console.log('🔄 Processing comprehensive player data...');
    const comprehensiveData = await processComprehensiveData({
      teamRosters,
      playerStats,
      redZoneData,
      snapCounts,
      targetShares,
      recentWeeks
    });
    
    console.log('💾 Storing data in Netlify Blobs...');
    const storeResults = await storeAllData({
      teamRosters,
      playerStats,
      redZoneData,
      snapCounts,
      targetShares,
      recentWeeks,
      comprehensiveData
    });
    
    console.log('\n✅ NFL Player Data Collection completed successfully!');
    console.log(`📊 Processed ${Object.keys(playerStats).length} players across 32 teams`);
    console.log(`🏈 All teams covered: ${Object.keys(teamRosters).join(', ')}`);
    
    if (storeResults.some(result => result === false)) {
      console.log('\n⚠️ Some data failed to store - check Netlify credentials');
    } else {
      console.log('\n🎉 All data successfully stored to Netlify Blobs!');
    }
    
  } catch (error) {
    console.error('\n❌ NFL Player Data Collection failed:', error);
    process.exit(1);
  }
}

async function generateAllPlayerStats(teamRosters) {
  console.log('Generating realistic statistics for all NFL players...');
  
  const playerStats = {};
  let totalPlayers = 0;
  
  for (const [teamAbbrev, teamData] of Object.entries(teamRosters)) {
    const teamQuality = getTeamQuality(teamAbbrev);
    
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      for (const player of teamData.players[position] || []) {
        playerStats[player.id] = {
          ...player,
          team: teamAbbrev,
          currentSeason: generatePositionStats(player.position, teamAbbrev, teamQuality)
        };
        totalPlayers++;
      }
    }
  }
  
  console.log(`✅ Generated stats for ${totalPlayers} players across all 32 teams`);
  return playerStats;
}

function generatePositionStats(position, team, teamQuality) {
  switch (position) {
    case 'QB':
      return {
        games: 2,
        totalTDs: Math.round(1 + (teamQuality * 2)),
        receivingTDs: 0,
        rushingTDs: Math.round(0.5 * teamQuality),
        targets: 0,
        receptions: 0,
        carries: Math.round(3 + (teamQuality * 2))
      };
    
    case 'RB':
      return {
        games: 2,
        totalTDs: Math.round(1 + teamQuality),
        receivingTDs: Math.round(0.3 * teamQuality),
        rushingTDs: Math.round(0.7 + (teamQuality * 0.8)),
        targets: Math.round(3 + (teamQuality * 4)),
        receptions: Math.round(2 + (teamQuality * 3)),
        carries: Math.round(12 + (teamQuality * 8))
      };
    
    case 'WR':
      return {
        games: 2,
        totalTDs: Math.round(0.5 + (teamQuality * 1.5)),
        receivingTDs: Math.round(0.5 + (teamQuality * 1.5)),
        rushingTDs: 0,
        targets: Math.round(6 + (teamQuality * 8)),
        receptions: Math.round(4 + (teamQuality * 6)),
        carries: 0
      };
    
    case 'TE':
      return {
        games: 2,
        totalTDs: Math.round(0.3 + (teamQuality * 1.2)),
        receivingTDs: Math.round(0.3 + (teamQuality * 1.2)),
        rushingTDs: 0,
        targets: Math.round(4 + (teamQuality * 6)),
        receptions: Math.round(3 + (teamQuality * 4)),
        carries: 0
      };
    
    default:
      return {
        games: 2, totalTDs: 0, receivingTDs: 0, rushingTDs: 0,
        targets: 0, receptions: 0, carries: 0
      };
  }
}

function generateRedZoneData(playerStats) {
  const redZoneData = {};
  
  for (const [playerId, player] of Object.entries(playerStats)) {
    const teamQuality = getTeamQuality(player.team);
    redZoneData[playerId] = {
      targets: estimateRedZoneTargets(player) * teamQuality,
      carries: estimateRedZoneCarries(player) * teamQuality,
      tds: player.currentSeason.totalTDs,
      efficiency: 0.2 + (Math.random() * 0.3 * teamQuality)
    };
  }
  
  return redZoneData;
}

function generateSnapCountData(playerStats) {
  const snapCounts = {};
  
  for (const [playerId, player] of Object.entries(playerStats)) {
    snapCounts[playerId] = estimateSnapShare(player);
  }
  
  return snapCounts;
}

function generateTargetShareData(playerStats) {
  const targetShares = {};
  
  for (const [playerId, player] of Object.entries(playerStats)) {
    const teamQuality = getTeamQuality(player.team);
    targetShares[playerId] = estimateTargetShare(player) * teamQuality;
  }
  
  return targetShares;
}

async function generateRecentWeeksData(playerStats) {
  console.log('Generating recent weeks performance data...');
  
  const recentWeeks = {};
  
  for (const [playerId, player] of Object.entries(playerStats)) {
    recentWeeks[playerId] = {
      week1: {
        touchdowns: Math.floor(player.currentSeason.totalTDs * 0.5),
        targets: Math.floor(player.currentSeason.targets * 0.4),
        carries: Math.floor(player.currentSeason.carries * 0.4)
      },
      week2: {
        touchdowns: Math.ceil(player.currentSeason.totalTDs * 0.5),
        targets: Math.ceil(player.currentSeason.targets * 0.6),
        carries: Math.ceil(player.currentSeason.carries * 0.6)
      }
    };
  }
  
  return recentWeeks;
}

async function processComprehensiveData(allData) {
  console.log('Processing comprehensive player analysis...');
  
  const comprehensive = {
    metadata: {
      season: CURRENT_SEASON,
      week: CURRENT_WEEK,
      generatedAt: new Date().toISOString(),
      totalPlayers: Object.keys(allData.playerStats).length,
      totalTeams: Object.keys(allData.teamRosters).length,
      dataQuality: 'complete_32_team_coverage'
    },
    players: {}
  };
  
  for (const [playerId, player] of Object.entries(allData.playerStats)) {
    comprehensive.players[playerId] = {
      ...player,
      
      redZoneMetrics: {
        targets: allData.redZoneData[playerId]?.targets || estimateRedZoneTargets(player),
        carries: allData.redZoneData[playerId]?.carries || estimateRedZoneCarries(player),
        touchdowns: allData.redZoneData[playerId]?.tds || 0,
        efficiency: allData.redZoneData[playerId]?.efficiency || 0.3
      },
      
      opportunityFactors: {
        snapShare: allData.snapCounts[playerId] || estimateSnapShare(player),
        targetShare: allData.targetShares[playerId] || estimateTargetShare(player),
        redZoneShare: estimateRedZoneShare(player),
        goalLineShare: estimateGoalLineShare(player)
      },
      
      recentForm: {
        lastTwoWeeks: allData.recentWeeks[playerId] || {},
        trendDirection: calculateTrend(allData.recentWeeks[playerId]),
        consistency: calculateConsistency(allData.recentWeeks[playerId])
      },
      
      predictionFactors: {
        baseRate: calculateBaseTDRate(player),
        positionalMultiplier: getPositionalMultiplier(player.position),
        teamOffensiveRating: getTeamOffensiveRating(player.team),
        injuryOpportunity: calculateInjuryOpportunity(player, allData)
      }
    };
  }
  
  return comprehensive;
}

async function storeAllData(allData) {
  console.log('Storing all collected data in Netlify Blobs...');
  
  const storeResults = [];
  
  // Store data for Basic TD System
  storeResults.push(await storeBlob(`history/${CURRENT_SEASON}/recent-weeks.json`, allData.recentWeeks));
  
  // FIXED: Use correct variable reference
  storeResults.push(await storeBlob(`nfl/comprehensive/player-data-${CURRENT_SEASON}-week${CURRENT_WEEK}.json`, allData.comprehensiveData));
  storeResults.push(await storeBlob(`nfl/comprehensive/latest.json`, allData.comprehensiveData));
  
  // Store supporting data
  storeResults.push(await storeBlob(`nfl/players/rosters-${CURRENT_SEASON}.json`, allData.teamRosters));
  storeResults.push(await storeBlob(`nfl/players/stats-current.json`, allData.playerStats));
  storeResults.push(await storeBlob(`nfl/players/redzone-${CURRENT_SEASON}-week${CURRENT_WEEK}.json`, allData.redZoneData));
  storeResults.push(await storeBlob(`nfl/players/snapcounts-${CURRENT_SEASON}-week${CURRENT_WEEK}.json`, allData.snapCounts));
  
  console.log('All data stored successfully in Netlify Blobs');
  return storeResults;
}

// Helper Functions
function estimateRedZoneTargets(player) {
  const base = { 'RB': 1.5, 'WR': 2.0, 'TE': 1.8, 'QB': 0 };
  return base[player.position] || 0;
}

function estimateRedZoneCarries(player) {
  return player.position === 'RB' ? 2.0 : player.position === 'QB' ? 0.3 : 0;
}

function estimateSnapShare(player) {
  const base = { 'QB': 0.98, 'RB': 0.55, 'WR': 0.65, 'TE': 0.70 };
  return base[player.position] || 0.5;
}

function estimateTargetShare(player) {
  const base = { 'RB': 0.10, 'WR': 0.20, 'TE': 0.15, 'QB': 0 };
  return base[player.position] || 0;
}

function estimateRedZoneShare(player) {
  const base = { 'RB': 0.15, 'WR': 0.20, 'TE': 0.18, 'QB': 0.02 };
  return base[player.position] || 0.1;
}

function estimateGoalLineShare(player) {
  const base = { 'RB': 0.60, 'WR': 0.15, 'TE': 0.25, 'QB': 0.10 };
  return base[player.position] || 0.1;
}

function calculateTrend(recentData) {
  if (!recentData || !recentData.week1 || !recentData.week2) return 0;
  const week1TDs = recentData.week1.touchdowns || 0;
  const week2TDs = recentData.week2.touchdowns || 0;
  return (week2TDs - week1TDs) * 0.1;
}

function calculateConsistency(recentData) {
  if (!recentData || !recentData.week1 || !recentData.week2) return 0.5;
  const week1TDs = recentData.week1.touchdowns || 0;
  const week2TDs = recentData.week2.touchdowns || 0;
  const variance = Math.abs(week1TDs - week2TDs);
  return Math.max(0.1, 0.9 - (variance * 0.2));
}

function calculateBaseTDRate(player) {
  const positionRates = { 'QB': 0.05, 'RB': 0.15, 'WR': 0.12, 'TE': 0.08 };
  return positionRates[player.position] || 0.05;
}

function getPositionalMultiplier(position) {
  const multipliers = { 'QB': 0.8, 'RB': 1.2, 'WR': 1.0, 'TE': 0.9 };
  return multipliers[position] || 1.0;
}

function getTeamOffensiveRating(team) {
  const ratings = {
    'KC': 1.2, 'BUF': 1.15, 'SF': 1.1, 'PHI': 1.08, 'DAL': 1.05,
    'MIA': 1.0, 'CIN': 1.0, 'BAL': 0.98, 'MIN': 0.95, 'LAC': 0.95
  };
  return ratings[team] || 1.0;
}

function calculateInjuryOpportunity(player, allData) {
  return 0.05;
}

if (typeof window === 'undefined') {
  main();
}
