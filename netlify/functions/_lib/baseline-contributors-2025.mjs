// NFL 2025 Season Baseline Contributors
// Players who played significant snaps in Weeks 1-6 and ARE baked into team EPA baselines
// Used to determine if IR players should receive injury adjustments

export const BASELINE_CONTRIBUTORS_2025 = {
  'ARI': {
    'QB': ['Kyler Murray'],
    'RB': ['James Conner'], // On IR but WAS in baseline
    'WR': ['Marvin Harrison Jr.', 'Michael Wilson'],
    'TE': ['Trey McBride']
  },
  'ATL': {
    'QB': ['Kirk Cousins'],
    'RB': ['Bijan Robinson', 'Tyler Allgeier'],
    'WR': ['Drake London', 'Darnell Mooney'],
    'TE': ['Kyle Pitts']
  },
  'BAL': {
    'QB': ['Lamar Jackson'],
    'RB': ['Derrick Henry', 'Justice Hill'],
    'WR': ['Zay Flowers', 'Rashod Bateman'],
    'TE': ['Mark Andrews', 'Isaiah Likely']
  },
  'BUF': {
    'QB': ['Josh Allen'],
    'RB': ['James Cook III'],
    'WR': ['Khalil Shakir', 'Keon Coleman'],
    'TE': ['Dalton Kincaid']
  },
  'CAR': {
    'QB': ['Bryce Young', 'Andy Dalton'],
    'RB': ['Chuba Hubbard', 'Miles Sanders'],
    'WR': ['Diontae Johnson', 'Adam Thielen'],
    'TE': ['Tommy Tremble']
  },
  'CHI': {
    'QB': ['Caleb Williams'],
    'RB': ['D\'Andre Swift', 'Roschon Johnson'],
    'WR': ['DJ Moore', 'Keenan Allen', 'Rome Odunze'],
    'TE': ['Cole Kmet']
  },
  'CIN': {
    'QB': ['Joe Burrow'],
    'RB': ['Chase Brown', 'Zack Moss'],
    'WR': ['Ja\'Marr Chase', 'Tee Higgins', 'Andrei Iosivas'],
    'TE': ['Mike Gesicki']
  },
  'CLE': {
    'QB': ['Deshaun Watson', 'Jameis Winston'],
    'RB': ['Nick Chubb', 'Jerome Ford'],
    'WR': ['Amari Cooper', 'Jerry Jeudy'],
    'TE': ['David Njoku']
  },
  'DAL': {
    'QB': ['Dak Prescott'],
    'RB': ['Rico Dowdle', 'Ezekiel Elliott'],
    'WR': ['CeeDee Lamb', 'Brandin Cooks'],
    'TE': ['Jake Ferguson']
  },
  'DEN': {
    'QB': ['Bo Nix'],
    'RB': ['Javonte Williams', 'Jaleel McLaughlin'],
    'WR': ['Courtland Sutton', 'Josh Reynolds'],
    'TE': ['Greg Dulcich']
  },
  'DET': {
    'QB': ['Jared Goff'],
    'RB': ['David Montgomery', 'Jahmyr Gibbs'],
    'WR': ['Amon-Ra St. Brown', 'Jameson Williams'],
    'TE': ['Sam LaPorta']
  },
  'GB': {
    'QB': ['Jordan Love'],
    'RB': ['Josh Jacobs', 'Emanuel Wilson'],
    'WR': ['Jayden Reed', 'Romeo Doubs', 'Christian Watson'],
    'TE': ['Tucker Kraft']
  },
  'HOU': {
    'QB': ['C.J. Stroud'],
    'RB': ['Joe Mixon', 'Dameon Pierce'],
    'WR': ['Nico Collins', 'Tank Dell', 'Stefon Diggs'],
    'TE': ['Dalton Schultz']
  },
  'IND': {
    'QB': ['Anthony Richardson', 'Joe Flacco'],
    'RB': ['Jonathan Taylor', 'Trey Sermon'],
    'WR': ['Michael Pittman Jr.', 'Josh Downs', 'Alec Pierce'],
    'TE': ['Kylen Granson']
  },
  'JAX': {
    'QB': ['Trevor Lawrence'],
    'RB': ['Travis Etienne Jr.', 'Tank Bigsby'],
    'WR': ['Brian Thomas Jr.', 'Christian Kirk'],
    'TE': ['Evan Engram']
  },
  'KC': {
    'QB': ['Patrick Mahomes II'],
    'RB': ['Kareem Hunt'],
    'WR': ['DeAndre Hopkins', 'Xavier Worthy'],
    'TE': ['Travis Kelce']
  },
  'LAC': {
    'QB': ['Justin Herbert'],
    'RB': ['J.K. Dobbins', 'Gus Edwards'],
    'WR': ['Ladd McConkey', 'Quentin Johnston', 'DJ Chark Jr.'],
    'TE': ['Will Dissly']
  },
  'LAR': {
    'QB': ['Matthew Stafford'],
    'RB': ['Kyren Williams', 'Blake Corum'],
    'WR': ['Cooper Kupp', 'Puka Nacua', 'Demarcus Robinson'],
    'TE': ['Colby Parkinson']
  },
  'LV': {
    'QB': ['Gardner Minshew II', 'Aidan O\'Connell'],
    'RB': ['Alexander Mattison', 'Zamir White'],
    'WR': ['Jakobi Meyers', 'Tre Tucker'],
    'TE': ['Brock Bowers']
  },
  'MIA': {
    'QB': ['Tua Tagovailoa', 'Tyler Huntley'],
    'RB': ['De\'Von Achane', 'Raheem Mostert'],
    'WR': ['Tyreek Hill', 'Jaylen Waddle'],
    'TE': ['Jonnu Smith']
  },
  'MIN': {
    'QB': ['Sam Darnold'],
    'RB': ['Aaron Jones', 'Ty Chandler'],
    'WR': ['Justin Jefferson', 'Jordan Addison', 'Jalen Nailor'],
    'TE': ['T.J. Hockenson', 'Josh Oliver']
  },
  'NE': {
    'QB': ['Drake Maye', 'Jacoby Brissett'],
    'RB': ['Rhamondre Stevenson', 'Antonio Gibson'],
    'WR': ['Demario Douglas', 'Kendrick Bourne'],
    'TE': ['Hunter Henry']
  },
  'NO': {
    'QB': ['Derek Carr', 'Spencer Rattler'],
    'RB': ['Alvin Kamara', 'Jamaal Williams'],
    'WR': ['Chris Olave', 'Rashid Shaheed'],
    'TE': ['Juwan Johnson']
  },
  'NYG': {
    'QB': ['Daniel Jones'],
    'RB': ['Devin Singletary', 'Tyrone Tracy Jr.'],
    'WR': ['Malik Nabers', 'Darius Slayton', 'Wan\'Dale Robinson'], // Nabers WAS active Weeks 1-3, IS in baseline
    'TE': ['Theo Johnson', 'Daniel Bellinger']
  },
  'NYJ': {
    'QB': ['Aaron Rodgers'],
    'RB': ['Breece Hall', 'Braelon Allen'],
    'WR': ['Garrett Wilson', 'Allen Lazard', 'Mike Williams'],
    'TE': ['Tyler Conklin']
  },
  'PHI': {
    'QB': ['Jalen Hurts'],
    'RB': ['Saquon Barkley', 'Kenneth Gainwell'],
    'WR': ['A.J. Brown', 'DeVonta Smith'],
    'TE': ['Dallas Goedert']
  },
  'PIT': {
    'QB': ['Russell Wilson', 'Justin Fields'],
    'RB': ['Najee Harris', 'Jaylen Warren'],
    'WR': ['George Pickens', 'Van Jefferson', 'Calvin Austin III'],
    'TE': ['Pat Freiermuth']
  },
  'SF': {
    'QB': ['Brock Purdy'],
    'RB': ['Christian McCaffrey', 'Jordan Mason'], // CMC on IR but WAS in baseline
    'WR': ['Deebo Samuel', 'Brandon Aiyuk'],
    'TE': ['George Kittle']
  },
  'SEA': {
    'QB': ['Geno Smith'],
    'RB': ['Kenneth Walker III', 'Zach Charbonnet'],
    'WR': ['DK Metcalf', 'Tyler Lockett', 'Jaxon Smith-Njigba'],
    'TE': ['Noah Fant']
  },
  'TB': {
    'QB': ['Baker Mayfield'],
    'RB': ['Rachaad White', 'Bucky Irving'],
    'WR': ['Mike Evans', 'Chris Godwin'],
    'TE': ['Cade Otton']
  },
  'TEN': {
    'QB': ['Will Levis', 'Mason Rudolph'],
    'RB': ['Tony Pollard', 'Tyjae Spears'],
    'WR': ['DeAndre Hopkins', 'Calvin Ridley'],
    'TE': ['Chig Okonkwo']
  },
  'WAS': {
    'QB': ['Jayden Daniels'],
    'RB': ['Brian Robinson Jr.', 'Austin Ekeler'],
    'WR': ['Terry McLaurin', 'Noah Brown'],
    'TE': ['Zach Ertz']
  }
};
