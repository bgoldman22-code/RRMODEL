// NHL Team Abbreviation to Full Name Mapping
// For matching our data (abbreviations) to TheOddsAPI (full names)

export const NHL_TEAM_MAPPING = {
  'ANA': 'Anaheim Ducks',
  'ARI': 'Arizona Coyotes',
  'BOS': 'Boston Bruins',
  'BUF': 'Buffalo Sabres',
  'CAR': 'Carolina Hurricanes',
  'CBJ': 'Columbus Blue Jackets',
  'CGY': 'Calgary Flames',
  'CHI': 'Chicago Blackhawks',
  'COL': 'Colorado Avalanche',
  'DAL': 'Dallas Stars',
  'DET': 'Detroit Red Wings',
  'EDM': 'Edmonton Oilers',
  'FLA': 'Florida Panthers',
  'LAK': 'Los Angeles Kings',
  'MIN': 'Minnesota Wild',
  'MTL': 'Montréal Canadiens',
  'NJD': 'New Jersey Devils',
  'NSH': 'Nashville Predators',
  'NYI': 'New York Islanders',
  'NYR': 'New York Rangers',
  'OTT': 'Ottawa Senators',
  'PHI': 'Philadelphia Flyers',
  'PIT': 'Pittsburgh Penguins',
  'SEA': 'Seattle Kraken',
  'SJS': 'San Jose Sharks',
  'STL': 'St Louis Blues',
  'TBL': 'Tampa Bay Lightning',
  'TOR': 'Toronto Maple Leafs',
  'VAN': 'Vancouver Canucks',
  'VEG': 'Vegas Golden Knights',
  'WPG': 'Winnipeg Jets',
  'WSH': 'Washington Capitals',
  'UTA': 'Utah Mammoth', // New team 2024-25
};

// Reverse mapping: Full name to abbreviation
export const NHL_TEAM_REVERSE_MAPPING = {};
for (const [abbr, name] of Object.entries(NHL_TEAM_MAPPING)) {
  NHL_TEAM_REVERSE_MAPPING[name] = abbr;
}
