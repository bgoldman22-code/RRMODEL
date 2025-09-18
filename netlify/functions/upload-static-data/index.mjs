import { getStore } from '@netlify/blobs';

export async function handler(event) {
  if (event.queryStringParameters?.key !== 'upload-static-2025') {
    return { statusCode: 403, body: 'Unauthorized' };
  }

  try {
    const store = getStore({ 
      name: 'nfl-td', 
      siteID: process.env.NETLIFY_SITE_ID, 
      token: process.env.NETLIFY_TOKEN 
    });

    const depthCharts = {
      "ARI": {
        "QB": ["Kyler Murray", "Jacoby Brissett"],
        "RB": ["James Conner", "Trey Benson", "Emari Demercado"],
        "WR": ["Marvin Harrison Jr.", "Michael Wilson", "Zay Jones", "Greg Dortch"],
        "TE": ["Trey McBride", "Elijah Higgins"]
      },
      "ATL": {
        "QB": ["Michael Penix Jr.", "Kirk Cousins"],
        "RB": ["Bijan Robinson", "Tyler Allgeier"],
        "WR": ["Drake London", "Darnell Mooney", "Ray-Ray McCloud III", "Chris Blair"],
        "TE": ["Kyle Pitts Sr."]
      },
      "BAL": {
        "QB": ["Lamar Jackson", "Cooper Rush"],
        "RB": ["Derrick Henry", "Justice Hill", "Rasheen Ali", "Keaton Mitchell", "D'Ernest Johnson"],
        "WR": ["Zay Flowers", "Rashod Bateman", "DeAndre Hopkins", "Devontez Walker", "Tylan Wallace"],
        "TE": ["Mark Andrews", "Charlie Kolar", "Isaiah Likely"]
      },
      "BUF": {
        "QB": ["Josh Allen", "Mitchell Trubisky"],
        "RB": ["James Cook III", "Ray Davis", "Ty Johnson"],
        "WR": ["Keon Coleman", "Khalil Shakir", "Joshua Palmer", "Elijah Moore", "Curtis Samuel", "Tyrell Shavers", "Gabe Davis"],
        "TE": ["Dalton Kincaid", "Dawson Knox"]
      },
      "CAR": {
        "QB": ["Bryce Young", "Andy Dalton", "Hendon Hooker"],
        "RB": ["Chuba Hubbard", "Rico Dowdle", "Trevor Etienne"],
        "WR": ["Tetairoa McMillan", "Xavier Legette", "Hunter Renfrow", "Brycen Tremayne", "Jalen Coker", "Jimmy Horn Jr."],
        "TE": ["Ja'Tavion Sanders", "Tommy Tremble", "Mitchell Evans"]
      },
      "CHI": {
        "QB": ["Caleb Williams", "Tyson Bagent"],
        "RB": ["D'Andre Swift", "Kyle Monangai", "Roschon Johnson"],
        "WR": ["Rome Odunze", "DJ Moore", "Olamide Zaccheaus", "Luther Burden III"],
        "TE": ["Colston Loveland", "Cole Kmet"]
      },
      "CIN": {
        "QB": ["Jake Browning", "Joe Burrow"],
        "RB": ["Chase Brown", "Samaje Perine", "Tahj Brooks"],
        "WR": ["Ja'Marr Chase", "Tee Higgins", "Andrei Iosivas", "Mitchell Tinsley", "Jermaine Burton"],
        "TE": ["Mike Gesicki", "Noah Fant", "Drew Sample", "Tanner Hudson"]
      },
      "CLE": {
        "QB": ["Joe Flacco", "Dillon Gabriel", "Shedeur Sanders", "Deshaun Watson"],
        "RB": ["Quinshon Judkins", "Dylan Sampson", "Jerome Ford", "Raheim Sanders"],
        "WR": ["Jerry Jeudy", "Cedric Tillman", "Isaiah Bond", "Jamari Thrash", "DeAndre Carter", "Malachi Corley"],
        "TE": ["Harold Fannin Jr.", "David Njoku"]
      },
      "DAL": {
        "QB": ["Dak Prescott", "Joe Milton III"],
        "RB": ["Javonte Williams", "Miles Sanders", "Hunter Luepke", "Jaydon Blue", "Phil Mafah"],
        "WR": ["CeeDee Lamb", "George Pickens", "KaVontae Turpin", "Jalen Tolbert", "Jonathan Mingo"],
        "TE": ["Jake Ferguson", "Luke Schoonmaker"]
      },
      "DEN": {
        "QB": ["Bo Nix", "Jarrett Stidham"],
        "RB": ["J.K. Dobbins", "RJ Harvey", "Tyler Badie", "Jaleel McLaughlin", "Adam Prentice"],
        "WR": ["Courtland Sutton", "Troy Franklin", "Marvin Mims Jr.", "Pat Bryant"],
        "TE": ["Evan Engram", "Adam Trautman", "Lucas Krull"]
      },
      "DET": {
        "QB": ["Jared Goff", "Kyle Allen"],
        "RB": ["Jahmyr Gibbs", "David Montgomery", "Craig Reynolds", "Sione Vaki"],
        "WR": ["Amon-Ra St. Brown", "Jameson Williams", "Isaac TeSlaa", "Kalif Raymond"],
        "TE": ["Sam LaPorta", "Brock Wright"]
      },
      "GB": {
        "QB": ["Jordan Love", "Malik Willis"],
        "RB": ["Josh Jacobs", "Chris Brooks", "Emanuel Wilson", "MarShawn Lloyd"],
        "WR": ["Romeo Doubs", "Matthew Golden", "Dontayvion Wicks", "Savion Williams", "Jayden Reed", "Christian Watson"],
        "TE": ["Tucker Kraft", "Luke Musgrave", "John FitzPatrick"]
      },
      "HOU": {
        "QB": ["C.J. Stroud", "Davis Mills"],
        "RB": ["Nick Chubb", "Woody Marks", "Dameon Pierce", "Dare Ogunbowale", "Joe Mixon"],
        "WR": ["Nico Collins", "Christian Kirk", "Jayden Higgins", "Xavier Hutchinson", "Jaylin Noel", "Tank Dell"],
        "TE": ["Dalton Schultz", "Harrison Bryant", "Cade Stover"]
      },
      "IND": {
        "QB": ["Daniel Jones", "Anthony Richardson Sr."],
        "RB": ["Jonathan Taylor", "DJ Giddens", "Tyler Goodson"],
        "WR": ["Michael Pittman Jr.", "Josh Downs", "Alec Pierce", "Adonai Mitchell"],
        "TE": ["Tyler Warren", "Mo Alie-Cox"]
      },
      "JAX": {
        "QB": ["Trevor Lawrence", "Nick Mullens"],
        "RB": ["Travis Etienne Jr.", "Bhayshul Tuten", "LeQuint Allen Jr.", "Ja'Quinden Jackson"],
        "WR": ["Brian Thomas Jr.", "Travis Hunter", "Dyami Brown", "Parker Washington", "Tim Patrick"],
        "TE": ["Brenton Strange", "Hunter Long", "Johnny Mundt"]
      },
      "KC": {
        "QB": ["Patrick Mahomes II", "Gardner Minshew II"],
        "RB": ["Isiah Pacheco", "Kareem Hunt", "Brashard Smith", "Elijah Mitchell", "Carson Steele", "Clyde Edwards-Helaire"],
        "WR": ["Marquise Brown", "Tyquan Thornton", "Xavier Worthy", "JuJu Smith-Schuster", "Rashee Rice", "Jalen Royals"],
        "TE": ["Travis Kelce", "Noah Gray", "Jared Wiley", "Robert Tonyan"]
      },
      "LAC": {
        "QB": ["Justin Herbert", "Trey Lance"],
        "RB": ["Omarion Hampton", "Najee Harris", "Hassan Haskins", "Kimani Vidal"],
        "WR": ["Ladd McConkey", "Keenan Allen", "Quentin Johnston", "Tre Harris", "KeAndre Lambert-Smith"],
        "TE": ["Will Dissly", "Tyler Conklin", "Oronde Gadsden II"]
      },
      "LAR": {
        "QB": ["Matthew Stafford", "Jimmy Garoppolo"],
        "RB": ["Kyren Williams", "Blake Corum", "Jarquez Hunter", "Ronnie Rivers"],
        "WR": ["Puka Nacua", "Davante Adams", "Tutu Atwell", "Jordan Whittington"],
        "TE": ["Tyler Higbee", "Terrance Ferguson", "Davis Allen", "Colby Parkinson"]
      },
      "LV": {
        "QB": ["Geno Smith", "Kenny Pickett", "Aidan O'Connell"],
        "RB": ["Ashton Jeanty", "Zamir White", "Dylan Laube", "Raheem Mostert"],
        "WR": ["Jakobi Meyers", "Tre Tucker", "Dont'e Thornton Jr.", "Jack Bech"],
        "TE": ["Brock Bowers", "Michael Mayer"]
      },
      "MIA": {
        "QB": ["Tua Tagovailoa", "Zach Wilson", "Quinn Ewers"],
        "RB": ["De'Von Achane", "Ollie Gordon II", "Jaylen Wright", "Alec Ingold"],
        "WR": ["Tyreek Hill", "Jaylen Waddle", "Malik Washington", "Nick Westbrook-Ikhine", "Theo Wease Jr."],
        "TE": ["Tanner Conner", "Julian Hill", "Darren Waller", "Greg Dulcich"]
      },
      "MIN": {
        "QB": ["Carson Wentz", "J.J. McCarthy"],
        "RB": ["Jordan Mason", "Cam Akers", "Xazavian Valladay", "Aaron Jones Sr.", "Ty Chandler"],
        "WR": ["Justin Jefferson", "Jalen Nailor", "Adam Thielen", "Zavier Scott", "Tai Felton", "Jordan Addison"],
        "TE": ["T.J. Hockenson", "Josh Oliver"]
      },
      "NE": {
        "QB": ["Drake Maye", "Joshua Dobbs"],
        "RB": ["Rhamondre Stevenson", "TreVeyon Henderson", "Antonio Gibson"],
        "WR": ["Stefon Diggs", "Kayshon Boutte", "DeMario Douglas", "Mack Hollins", "Kyle Williams", "Efton Chism III"],
        "TE": ["Hunter Henry", "Austin Hooper"]
      },
      "NO": {
        "QB": ["Spencer Rattler", "Tyler Shough"],
        "RB": ["Alvin Kamara", "Kendre Miller", "Devin Neal", "Chris Tyree"],
        "WR": ["Chris Olave", "Rashid Shaheed", "Brandin Cooks", "Devaughn Vele"],
        "TE": ["Juwan Johnson", "Taysom Hill", "Foster Moreau"]
      },
      "NYG": {
        "QB": ["Russell Wilson", "Jaxson Dart", "Jameis Winston"],
        "RB": ["Cam Skattebo", "Tyrone Tracy Jr.", "Devin Singletary"],
        "WR": ["Malik Nabers", "Wan'Dale Robinson", "Darius Slayton", "Jalin Hyatt"],
        "TE": ["Theo Johnson", "Daniel Bellinger"]
      },
      "NYJ": {
        "QB": ["Tyrod Taylor", "Justin Fields"],
        "RB": ["Breece Hall", "Braelon Allen", "Isaiah Davis"],
        "WR": ["Garrett Wilson", "Tyler Johnson", "Allen Lazard", "Arian Smith", "Josh Reynolds"],
        "TE": ["Mason Taylor", "Jeremy Ruckert", "Stone Smartt", "Jelani Woods"]
      },
      "PHI": {
        "QB": ["Jalen Hurts", "Tanner McKee", "Sam Howell"],
        "RB": ["Saquon Barkley", "A.J. Dillon", "Tank Bigsby", "Will Shipley"],
        "WR": ["A.J. Brown", "DeVonta Smith", "Jahan Dotson", "Javon Baker"],
        "TE": ["Dallas Goedert", "Grant Calcaterra", "Kylen Granson"]
      },
      "PIT": {
        "QB": ["Aaron Rodgers", "Mason Rudolph", "Will Howard"],
        "RB": ["Jaylen Warren", "Kenneth Gainwell", "Kaleb Johnson", "Trey Sermon"],
        "WR": ["DK Metcalf", "Calvin Austin III", "Roman Wilson", "Ben Skowronek", "Scotty Miller"],
        "TE": ["Jonnu Smith", "Pat Freiermuth", "Darnell Washington"]
      },
      "SF": {
        "QB": ["Mac Jones", "Brock Purdy"],
        "RB": ["Christian McCaffrey", "Brian Robinson Jr.", "Isaac Guerendo", "Sincere McCormick", "Kyle Juszczyk", "Jordan James"],
        "WR": ["Jauan Jennings", "Ricky Pearsall", "Kendrick Bourne", "Marquez Valdes-Scantling", "Russell Gage Jr.", "Brandon Aiyuk", "Demarcus Robinson", "Skyy Moore", "Jacob Cowing", "Jordan Watkins"],
        "TE": ["Jake Tonges", "Luke Farrell", "George Kittle"]
      },
      "SEA": {
        "QB": ["Sam Darnold", "Jalen Milroe", "Drew Lock"],
        "RB": ["Kenneth Walker III", "Zach Charbonnet", "George Holani", "Damien Martinez"],
        "WR": ["Jaxon Smith-Njigba", "Cooper Kupp", "Tory Horton", "Jake Bobo", "Ricky White III"],
        "TE": ["AJ Barner", "Elijah Arroyo"]
      },
      "TB": {
        "QB": ["Baker Mayfield", "Teddy Bridgewater"],
        "RB": ["Bucky Irving", "Rachaad White", "Sean Tucker"],
        "WR": ["Mike Evans", "Emeka Egbuka", "Sterling Shepard", "Tez Johnson", "Chris Godwin Jr.", "Jalen McMillan"],
        "TE": ["Cade Otton", "Payne Durham"]
      },
      "TEN": {
        "QB": ["Cam Ward"],
        "RB": ["Tony Pollard", "Julius Chestnut", "Jordan Mims", "Tyjae Spears", "Kalel Mullings"],
        "WR": ["Calvin Ridley", "Elic Ayomanor", "Tyler Lockett", "Chimere Dike", "Xavier Restrepo", "Van Jefferson"],
        "TE": ["Chig Okonkwo", "Gunnar Helm"]
      },
      "WAS": {
        "QB": ["Jayden Daniels", "Marcus Mariota"],
        "RB": ["Jacory Croskey-Merritt", "Jeremy McNichols", "Chris Rodriguez Jr.", "Donovan Edwards"],
        "WR": ["Deebo Samuel Sr.", "Terry McLaurin", "Noah Brown", "Jaylin Lane", "Luke McCaffrey"],
        "TE": ["Zach Ertz", "Ben Sinnott", "John Bates"]
      }
    };

    const schedule = {
      "season": "2025",
      "generated_at": "2025-09-17T14:00:00Z",
      "current_week": 3,
      "weeks": {
        "1": {
          "matchups": [
            {"id": "2025_01_DAL_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Dallas Cowboys", "kickoff": "2025-09-05T00:20:00Z", "week": 1},
            {"id": "2025_01_KC_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-09-06T00:00:00Z", "week": 1},
            {"id": "2025_01_TB_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_CIN_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_MIA_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Miami Dolphins", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_CAR_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Carolina Panthers", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_ARI_NO", "homeTeam": "New Orleans Saints", "awayTeam": "Arizona Cardinals", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_LV_NE", "homeTeam": "New England Patriots", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_PIT_NYJ", "homeTeam": "New York Jets", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_NYG_WAS", "homeTeam": "Washington Commanders", "awayTeam": "New York Giants", "kickoff": "2025-09-07T17:00:00Z", "week": 1},
            {"id": "2025_01_TEN_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Tennessee Titans", "kickoff": "2025-09-07T20:05:00Z", "week": 1},
            {"id": "2025_01_SF_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "San Francisco 49ers", "kickoff": "2025-09-07T20:05:00Z", "week": 1},
            {"id": "2025_01_DET_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Detroit Lions", "kickoff": "2025-09-07T20:25:00Z", "week": 1},
            {"id": "2025_01_HOU_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Houston Texans", "kickoff": "2025-09-07T20:25:00Z", "week": 1},
            {"id": "2025_01_BAL_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Baltimore Ravens", "kickoff": "2025-09-08T00:20:00Z", "week": 1},
            {"id": "2025_01_MIN_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Minnesota Vikings", "kickoff": "2025-09-09T00:15:00Z", "week": 1}
          ]
        },
        "2": {
          "matchups": [
            {"id": "2025_02_WAS_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Washington Commanders", "kickoff": "2025-09-12T00:15:00Z", "week": 2},
            {"id": "2025_02_JAX_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_NYG_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "New York Giants", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_CHI_DET", "homeTeam": "Detroit Lions", "awayTeam": "Chicago Bears", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_NE_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "New England Patriots", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_SF_NO", "homeTeam": "New Orleans Saints", "awayTeam": "San Francisco 49ers", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_BUF_NYJ", "homeTeam": "New York Jets", "awayTeam": "Buffalo Bills", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_LAR_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Los Angeles Rams", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_SEA_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Seattle Seahawks", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_CLE_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Cleveland Browns", "kickoff": "2025-09-14T17:00:00Z", "week": 2},
            {"id": "2025_02_DEN_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Denver Broncos", "kickoff": "2025-09-14T20:05:00Z", "week": 2},
            {"id": "2025_02_CAR_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Carolina Panthers", "kickoff": "2025-09-14T20:05:00Z", "week": 2},
            {"id": "2025_02_PHI_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-09-14T20:25:00Z", "week": 2},
            {"id": "2025_02_ATL_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Atlanta Falcons", "kickoff": "2025-09-14T20:20:00Z", "week": 2},
            {"id": "2025_02_TB_HOU", "homeTeam": "Houston Texans", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-09-15T23:00:00Z", "week": 2},
            {"id": "2025_02_LAC_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-09-16T02:00:00Z", "week": 2}
          ]
        },
        "3": {
          "matchups": [
            {"id": "2025_03_MIA_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Miami Dolphins", "kickoff": "2025-09-19T00:15:00Z", "week": 3},
            {"id": "2025_03_ATL_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Atlanta Falcons", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_GB_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Green Bay Packers", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_HOU_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Houston Texans", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_CIN_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_PIT_NE", "homeTeam": "New England Patriots", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_IND_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Indianapolis Colts", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_LAR_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Los Angeles Rams", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_NYJ_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "New York Jets", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_LV_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-09-21T17:00:00Z", "week": 3},
            {"id": "2025_03_DEN_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Denver Broncos", "kickoff": "2025-09-21T20:05:00Z", "week": 3},
            {"id": "2025_03_NO_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "New Orleans Saints", "kickoff": "2025-09-21T20:05:00Z", "week": 3},
            {"id": "2025_03_DAL_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Dallas Cowboys", "kickoff": "2025-09-21T20:25:00Z", "week": 3},
            {"id": "2025_03_ARI_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Arizona Cardinals", "kickoff": "2025-09-21T20:25:00Z", "week": 3},
            {"id": "2025_03_KC_NYG", "homeTeam": "New York Giants", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-09-22T00:20:00Z", "week": 3},
            {"id": "2025_03_DET_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Detroit Lions", "kickoff": "2025-09-23T00:15:00Z", "week": 3}
          ]
        },
        "4": {
          "matchups": [
            {"id": "2025_04_SEA_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Seattle Seahawks", "kickoff": "2025-09-26T00:15:00Z", "week": 4},
            {"id": "2025_04_MIN_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Minnesota Vikings", "kickoff": "2025-09-28T13:30:00Z", "week": 4},
            {"id": "2025_04_WAS_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Washington Commanders", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_NO_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "New Orleans Saints", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_CLE_DET", "homeTeam": "Detroit Lions", "awayTeam": "Cleveland Browns", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_TEN_HOU", "homeTeam": "Houston Texans", "awayTeam": "Tennessee Titans", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_CAR_NE", "homeTeam": "New England Patriots", "awayTeam": "Carolina Panthers", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_LAC_NYG", "homeTeam": "New York Giants", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_PHI_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-09-28T17:00:00Z", "week": 4},
            {"id": "2025_04_IND_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Indianapolis Colts", "kickoff": "2025-09-28T20:05:00Z", "week": 4},
            {"id": "2025_04_JAX_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-09-28T20:05:00Z", "week": 4},
            {"id": "2025_04_BAL_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Baltimore Ravens", "kickoff": "2025-09-28T20:25:00Z", "week": 4},
            {"id": "2025_04_CHI_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Chicago Bears", "kickoff": "2025-09-28T20:25:00Z", "week": 4},
            {"id": "2025_04_GB_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Green Bay Packers", "kickoff": "2025-09-29T00:20:00Z", "week": 4},
            {"id": "2025_04_NYJ_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "New York Jets", "kickoff": "2025-09-29T23:15:00Z", "week": 4},
            {"id": "2025_04_CIN_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-09-30T00:15:00Z", "week": 4}
          ]
        },
        "5": {
          "matchups": [
            {"id": "2025_05_SF_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "San Francisco 49ers", "kickoff": "2025-10-03T00:15:00Z", "week": 5},
            {"id": "2025_05_MIN_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Minnesota Vikings", "kickoff": "2025-10-05T13:30:00Z", "week": 5},
            {"id": "2025_05_MIA_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Miami Dolphins", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_LV_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_NYG_NO", "homeTeam": "New Orleans Saints", "awayTeam": "New York Giants", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_DAL_NYJ", "homeTeam": "New York Jets", "awayTeam": "Dallas Cowboys", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_DEN_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Denver Broncos", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_HOU_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Houston Texans", "kickoff": "2025-10-05T17:00:00Z", "week": 5},
            {"id": "2025_05_TEN_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Tennessee Titans", "kickoff": "2025-10-05T20:05:00Z", "week": 5},
            {"id": "2025_05_TB_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-10-05T20:05:00Z", "week": 5},
            {"id": "2025_05_DET_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Detroit Lions", "kickoff": "2025-10-05T20:25:00Z", "week": 5},
            {"id": "2025_05_WAS_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Washington Commanders", "kickoff": "2025-10-05T20:25:00Z", "week": 5},
            {"id": "2025_05_NE_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "New England Patriots", "kickoff": "2025-10-06T00:20:00Z", "week": 5},
            {"id": "2025_05_KC_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-10-07T00:15:00Z", "week": 5}
          ]
        },
        "6": {
          "matchups": [
            {"id": "2025_06_PHI_NYG", "homeTeam": "New York Giants", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-10-10T00:15:00Z", "week": 6},
            {"id": "2025_06_DEN_NYJ", "homeTeam": "New York Jets", "awayTeam": "Denver Broncos", "kickoff": "2025-10-12T13:30:00Z", "week": 6},
            {"id": "2025_06_DAL_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Dallas Cowboys", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_ARI_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Arizona Cardinals", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_SEA_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Seattle Seahawks", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_LAC_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_CLE_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Cleveland Browns", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_LAR_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Los Angeles Rams", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_SF_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "San Francisco 49ers", "kickoff": "2025-10-12T17:00:00Z", "week": 6},
            {"id": "2025_06_TEN_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Tennessee Titans", "kickoff": "2025-10-12T20:05:00Z", "week": 6},
            {"id": "2025_06_CIN_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-10-12T20:25:00Z", "week": 6},
            {"id": "2025_06_NE_NO", "homeTeam": "New Orleans Saints", "awayTeam": "New England Patriots", "kickoff": "2025-10-12T20:25:00Z", "week": 6},
            {"id": "2025_06_DET_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Detroit Lions", "kickoff": "2025-10-13T00:20:00Z", "week": 6},
            {"id": "2025_06_BUF_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Buffalo Bills", "kickoff": "2025-10-13T23:15:00Z", "week": 6},
            {"id": "2025_06_CHI_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Chicago Bears", "kickoff": "2025-10-14T00:15:00Z", "week": 6}
          ]
        },
        "7": {
          "matchups": [
            {"id": "2025_07_PIT_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-10-17T00:15:00Z", "week": 7},
            {"id": "2025_07_LAR_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Los Angeles Rams", "kickoff": "2025-10-19T13:30:00Z", "week": 7},
            {"id": "2025_07_NO_CHI", "homeTeam": "Chicago Bears", "awayTeam": "New Orleans Saints", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_MIA_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Miami Dolphins", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_LV_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_PHI_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_CAR_NYJ", "homeTeam": "New York Jets", "awayTeam": "Carolina Panthers", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_NE_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "New England Patriots", "kickoff": "2025-10-19T17:00:00Z", "week": 7},
            {"id": "2025_07_NYG_DEN", "homeTeam": "Denver Broncos", "awayTeam": "New York Giants", "kickoff": "2025-10-19T20:05:00Z", "week": 7},
            {"id": "2025_07_IND_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Indianapolis Colts", "kickoff": "2025-10-19T20:05:00Z", "week": 7},
            {"id": "2025_07_GB_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Green Bay Packers", "kickoff": "2025-10-19T20:25:00Z", "week": 7},
            {"id": "2025_07_WAS_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Washington Commanders", "kickoff": "2025-10-19T20:25:00Z", "week": 7},
            {"id": "2025_07_ATL_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Atlanta Falcons", "kickoff": "2025-10-20T00:20:00Z", "week": 7},
            {"id": "2025_07_TB_DET", "homeTeam": "Detroit Lions", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-10-20T23:00:00Z", "week": 7},
            {"id": "2025_07_HOU_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Houston Texans", "kickoff": "2025-10-21T02:00:00Z", "week": 7}
          ]
        },
        "8": {
          "matchups": [
            {"id": "2025_08_MIN_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Minnesota Vikings", "kickoff": "2025-10-24T00:15:00Z", "week": 8},
            {"id": "2025_08_MIA_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Miami Dolphins", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_BUF_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Buffalo Bills", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_NYJ_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "New York Jets", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_SF_HOU", "homeTeam": "Houston Texans", "awayTeam": "San Francisco 49ers", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_CLE_NE", "homeTeam": "New England Patriots", "awayTeam": "Cleveland Browns", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_NYG_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "New York Giants", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_CHI_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Chicago Bears", "kickoff": "2025-10-26T17:00:00Z", "week": 8},
            {"id": "2025_08_TB_NO", "homeTeam": "New Orleans Saints", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-10-26T20:05:00Z", "week": 8},
            {"id": "2025_08_TEN_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Tennessee Titans", "kickoff": "2025-10-26T20:25:00Z", "week": 8},
            {"id": "2025_08_DAL_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Dallas Cowboys", "kickoff": "2025-10-26T20:25:00Z", "week": 8},
            {"id": "2025_08_GB_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Green Bay Packers", "kickoff": "2025-10-27T00:20:00Z", "week": 8},
            {"id": "2025_08_WAS_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Washington Commanders", "kickoff": "2025-10-28T00:15:00Z", "week": 8}
          ]
        },
        "9": {
          "matchups": [
            {"id": "2025_09_BAL_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Baltimore Ravens", "kickoff": "2025-10-31T00:15:00Z", "week": 9},
            {"id": "2025_09_CHI_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Chicago Bears", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_MIN_DET", "homeTeam": "Detroit Lions", "awayTeam": "Minnesota Vikings", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_CAR_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Carolina Panthers", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_DEN_HOU", "homeTeam": "Houston Texans", "awayTeam": "Denver Broncos", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_ATL_NE", "homeTeam": "New England Patriots", "awayTeam": "Atlanta Falcons", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_SF_NYG", "homeTeam": "New York Giants", "awayTeam": "San Francisco 49ers", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_LAC_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_IND_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Indianapolis Colts", "kickoff": "2025-11-02T17:00:00Z", "week": 9},
            {"id": "2025_09_JAX_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-11-02T20:05:00Z", "week": 9},
            {"id": "2025_09_NO_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "New Orleans Saints", "kickoff": "2025-11-02T20:05:00Z", "week": 9},
            {"id": "2025_09_KC_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-11-02T20:25:00Z", "week": 9},
            {"id": "2025_09_SEA_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Seattle Seahawks", "kickoff": "2025-11-03T00:20:00Z", "week": 9},
            {"id": "2025_09_ARI_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Arizona Cardinals", "kickoff": "2025-11-04T00:15:00Z", "week": 9}
          ]
        },
        "10": {
          "matchups": [
            {"id": "2025_10_LV_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-11-07T00:15:00Z", "week": 10},
            {"id": "2025_10_ATL_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Atlanta Falcons", "kickoff": "2025-11-09T13:30:00Z", "week": 10},
            {"id": "2025_10_NO_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "New Orleans Saints", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_NYG_CHI", "homeTeam": "Chicago Bears", "awayTeam": "New York Giants", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_JAX_HOU", "homeTeam": "Houston Texans", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_BUF_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Buffalo Bills", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_BAL_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Baltimore Ravens", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_CLE_NYJ", "homeTeam": "New York Jets", "awayTeam": "Cleveland Browns", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_NE_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "New England Patriots", "kickoff": "2025-11-09T17:00:00Z", "week": 10},
            {"id": "2025_10_ARI_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Arizona Cardinals", "kickoff": "2025-11-09T20:05:00Z", "week": 10},
            {"id": "2025_10_LAR_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Los Angeles Rams", "kickoff": "2025-11-09T20:25:00Z", "week": 10},
            {"id": "2025_10_DET_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Detroit Lions", "kickoff": "2025-11-09T20:25:00Z", "week": 10},
            {"id": "2025_10_PIT_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-11-10T00:20:00Z", "week": 10},
            {"id": "2025_10_PHI_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-11-11T00:15:00Z", "week": 10}
          ]
        },
        "11": {
          "matchups": [
            {"id": "2025_11_NYJ_NE", "homeTeam": "New England Patriots", "awayTeam": "New York Jets", "kickoff": "2025-11-14T00:15:00Z", "week": 11},
            {"id": "2025_11_WAS_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Washington Commanders", "kickoff": "2025-11-16T13:30:00Z", "week": 11},
            {"id": "2025_11_CAR_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Carolina Panthers", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_TB_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_LAC_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_CHI_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Chicago Bears", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_GB_NYG", "homeTeam": "New York Giants", "awayTeam": "Green Bay Packers", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_HOU_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Houston Texans", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_CIN_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-11-16T17:00:00Z", "week": 11},
            {"id": "2025_11_SF_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "San Francisco 49ers", "kickoff": "2025-11-16T20:05:00Z", "week": 11},
            {"id": "2025_11_SEA_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Seattle Seahawks", "kickoff": "2025-11-16T20:05:00Z", "week": 11},
            {"id": "2025_11_BAL_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Baltimore Ravens", "kickoff": "2025-11-16T20:25:00Z", "week": 11},
            {"id": "2025_11_KC_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-11-16T20:25:00Z", "week": 11},
            {"id": "2025_11_DET_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Detroit Lions", "kickoff": "2025-11-17T00:20:00Z", "week": 11},
            {"id": "2025_11_DAL_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Dallas Cowboys", "kickoff": "2025-11-18T00:15:00Z", "week": 11}
          ]
        },
        "12": {
          "matchups": [
            {"id": "2025_12_BUF_HOU", "homeTeam": "Houston Texans", "awayTeam": "Buffalo Bills", "kickoff": "2025-11-21T00:15:00Z", "week": 12},
            {"id": "2025_12_PIT_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_NE_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "New England Patriots", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_NYG_DET", "homeTeam": "Detroit Lions", "awayTeam": "New York Giants", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_MIN_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Minnesota Vikings", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_IND_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Indianapolis Colts", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_SEA_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Seattle Seahawks", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_NYJ_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "New York Jets", "kickoff": "2025-11-23T17:00:00Z", "week": 12},
            {"id": "2025_12_JAX_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-11-23T20:05:00Z", "week": 12},
            {"id": "2025_12_CLE_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Cleveland Browns", "kickoff": "2025-11-23T20:05:00Z", "week": 12},
            {"id": "2025_12_PHI_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-11-23T20:25:00Z", "week": 12},
            {"id": "2025_12_ATL_NO", "homeTeam": "New Orleans Saints", "awayTeam": "Atlanta Falcons", "kickoff": "2025-11-23T20:25:00Z", "week": 12},
            {"id": "2025_12_TB_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-11-24T00:20:00Z", "week": 12},
            {"id": "2025_12_CAR_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Carolina Panthers", "kickoff": "2025-11-25T00:15:00Z", "week": 12}
          ]
        },
        "13": {
          "matchups": [
            {"id": "2025_13_GB_DET", "homeTeam": "Detroit Lions", "awayTeam": "Green Bay Packers", "kickoff": "2025-11-27T17:00:00Z", "week": 13},
            {"id": "2025_13_KC_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-11-27T20:30:00Z", "week": 13},
            {"id": "2025_13_CIN_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-11-28T00:20:00Z", "week": 13},
            {"id": "2025_13_CHI_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Chicago Bears", "kickoff": "2025-11-28T19:00:00Z", "week": 13},
            {"id": "2025_13_LAR_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Los Angeles Rams", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_SF_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "San Francisco 49ers", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_HOU_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Houston Texans", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_NO_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "New Orleans Saints", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_ATL_NYJ", "homeTeam": "New York Jets", "awayTeam": "Atlanta Falcons", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_JAX_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_ARI_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "Arizona Cardinals", "kickoff": "2025-11-30T17:00:00Z", "week": 13},
            {"id": "2025_13_MIN_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Minnesota Vikings", "kickoff": "2025-11-30T20:05:00Z", "week": 13},
            {"id": "2025_13_BUF_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Buffalo Bills", "kickoff": "2025-11-30T20:25:00Z", "week": 13},
            {"id": "2025_13_LV_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-11-30T20:25:00Z", "week": 13},
            {"id": "2025_13_DEN_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Denver Broncos", "kickoff": "2025-12-01T00:20:00Z", "week": 13},
            {"id": "2025_13_NYG_NE", "homeTeam": "New England Patriots", "awayTeam": "New York Giants", "kickoff": "2025-12-02T00:15:00Z", "week": 13}
          ]
        },
        "14": {
          "matchups": [
            {"id": "2025_14_DAL_DET", "homeTeam": "Detroit Lions", "awayTeam": "Dallas Cowboys", "kickoff": "2025-12-05T00:15:00Z", "week": 14},
            {"id": "2025_14_SEA_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Seattle Seahawks", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_TEN_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Tennessee Titans", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_CHI_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Chicago Bears", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_IND_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Indianapolis Colts", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_WAS_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Washington Commanders", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_MIA_NYJ", "homeTeam": "New York Jets", "awayTeam": "Miami Dolphins", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_PIT_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_NO_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "New Orleans Saints", "kickoff": "2025-12-07T17:00:00Z", "week": 14},
            {"id": "2025_14_DEN_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Denver Broncos", "kickoff": "2025-12-07T20:05:00Z", "week": 14},
            {"id": "2025_14_CIN_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-12-07T20:25:00Z", "week": 14},
            {"id": "2025_14_LAR_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Los Angeles Rams", "kickoff": "2025-12-07T20:25:00Z", "week": 14},
            {"id": "2025_14_HOU_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Houston Texans", "kickoff": "2025-12-08T00:20:00Z", "week": 14},
            {"id": "2025_14_PHI_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-12-09T00:15:00Z", "week": 14}
          ]
        },
        "15": {
          "matchups": [
            {"id": "2025_15_ATL_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "Atlanta Falcons", "kickoff": "2025-12-12T00:15:00Z", "week": 15},
            {"id": "2025_15_CLE_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Cleveland Browns", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_BAL_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Baltimore Ravens", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_ARI_HOU", "homeTeam": "Houston Texans", "awayTeam": "Arizona Cardinals", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_NYJ_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "New York Jets", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_LAC_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_BUF_NE", "homeTeam": "New England Patriots", "awayTeam": "Buffalo Bills", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_WAS_NYG", "homeTeam": "New York Giants", "awayTeam": "Washington Commanders", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_LV_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-12-14T17:00:00Z", "week": 15},
            {"id": "2025_15_GB_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Green Bay Packers", "kickoff": "2025-12-14T20:25:00Z", "week": 15},
            {"id": "2025_15_CAR_NO", "homeTeam": "New Orleans Saints", "awayTeam": "Carolina Panthers", "kickoff": "2025-12-14T20:25:00Z", "week": 15},
            {"id": "2025_15_DET_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Detroit Lions", "kickoff": "2025-12-14T20:25:00Z", "week": 15},
            {"id": "2025_15_IND_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Indianapolis Colts", "kickoff": "2025-12-14T20:25:00Z", "week": 15},
            {"id": "2025_15_TEN_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Tennessee Titans", "kickoff": "2025-12-14T20:25:00Z", "week": 15},
            {"id": "2025_15_MIN_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Minnesota Vikings", "kickoff": "2025-12-15T00:20:00Z", "week": 15},
            {"id": "2025_15_MIA_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Miami Dolphins", "kickoff": "2025-12-16T00:15:00Z", "week": 15}
          ]
        },
        "16": {
          "matchups": [
            {"id": "2025_16_LAR_SEA", "homeTeam": "Seattle Seahawks", "awayTeam": "Los Angeles Rams", "kickoff": "2025-12-19T00:15:00Z", "week": 16},
            {"id": "2025_16_GB_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Green Bay Packers", "kickoff": "2025-12-20T17:00:00Z", "week": 16},
            {"id": "2025_16_PHI_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-12-20T17:00:00Z", "week": 16},
            {"id": "2025_16_TB_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_BUF_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Buffalo Bills", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_LAC_DAL", "homeTeam": "Dallas Cowboys", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_NYJ_NO", "homeTeam": "New Orleans Saints", "awayTeam": "New York Jets", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_MIN_NYG", "homeTeam": "New York Giants", "awayTeam": "Minnesota Vikings", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_KC_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_NE_BAL", "homeTeam": "Baltimore Ravens", "awayTeam": "New England Patriots", "kickoff": "2025-12-21T17:00:00Z", "week": 16},
            {"id": "2025_16_ATL_ARI", "homeTeam": "Arizona Cardinals", "awayTeam": "Atlanta Falcons", "kickoff": "2025-12-21T20:05:00Z", "week": 16},
            {"id": "2025_16_JAX_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-12-21T20:05:00Z", "week": 16},
            {"id": "2025_16_PIT_DET", "homeTeam": "Detroit Lions", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-12-21T20:25:00Z", "week": 16},
            {"id": "2025_16_LV_HOU", "homeTeam": "Houston Texans", "awayTeam": "Las Vegas Raiders", "kickoff": "2025-12-21T20:25:00Z", "week": 16},
            {"id": "2025_16_CIN_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Cincinnati Bengals", "kickoff": "2025-12-22T00:20:00Z", "week": 16},
            {"id": "2025_16_SF_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "San Francisco 49ers", "kickoff": "2025-12-23T00:15:00Z", "week": 16}
          ]
        },
        "17": {
          "matchups": [
            {"id": "2025_17_DAL_WAS", "homeTeam": "Washington Commanders", "awayTeam": "Dallas Cowboys", "kickoff": "2025-12-25T17:00:00Z", "week": 17},
            {"id": "2025_17_DET_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Detroit Lions", "kickoff": "2025-12-25T20:30:00Z", "week": 17},
            {"id": "2025_17_DEN_KC", "homeTeam": "Kansas City Chiefs", "awayTeam": "Denver Broncos", "kickoff": "2025-12-26T00:15:00Z", "week": 17},
            {"id": "2025_17_SEA_CAR", "homeTeam": "Carolina Panthers", "awayTeam": "Seattle Seahawks", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_ARI_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Arizona Cardinals", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_PIT_CLE", "homeTeam": "Cleveland Browns", "awayTeam": "Pittsburgh Steelers", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_JAX_IND", "homeTeam": "Indianapolis Colts", "awayTeam": "Jacksonville Jaguars", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_BAL_GB", "homeTeam": "Green Bay Packers", "awayTeam": "Baltimore Ravens", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_TB_MIA", "homeTeam": "Miami Dolphins", "awayTeam": "Tampa Bay Buccaneers", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_NE_NYJ", "homeTeam": "New York Jets", "awayTeam": "New England Patriots", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_NO_TEN", "homeTeam": "Tennessee Titans", "awayTeam": "New Orleans Saints", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_NYG_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "New York Giants", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_HOU_LAC", "homeTeam": "Los Angeles Chargers", "awayTeam": "Houston Texans", "kickoff": "2025-12-28T17:00:00Z", "week": 17},
            {"id": "2025_17_PHI_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "Philadelphia Eagles", "kickoff": "2025-12-28T20:25:00Z", "week": 17},
            {"id": "2025_17_CHI_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Chicago Bears", "kickoff": "2025-12-29T00:20:00Z", "week": 17},
            {"id": "2025_17_LAR_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "Los Angeles Rams", "kickoff": "2025-12-30T00:15:00Z", "week": 17}
          ]
        },
        "18": {
          "matchups": [
            {"id": "2025_18_NO_ATL", "homeTeam": "Atlanta Falcons", "awayTeam": "New Orleans Saints", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_NYJ_BUF", "homeTeam": "Buffalo Bills", "awayTeam": "New York Jets", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_DET_CHI", "homeTeam": "Chicago Bears", "awayTeam": "Detroit Lions", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_CLE_CIN", "homeTeam": "Cincinnati Bengals", "awayTeam": "Cleveland Browns", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_LAC_DEN", "homeTeam": "Denver Broncos", "awayTeam": "Los Angeles Chargers", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_IND_HOU", "homeTeam": "Houston Texans", "awayTeam": "Indianapolis Colts", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_TEN_JAX", "homeTeam": "Jacksonville Jaguars", "awayTeam": "Tennessee Titans", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_GB_MIN", "homeTeam": "Minnesota Vikings", "awayTeam": "Green Bay Packers", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_MIA_NE", "homeTeam": "New England Patriots", "awayTeam": "Miami Dolphins", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_DAL_NYG", "homeTeam": "New York Giants", "awayTeam": "Dallas Cowboys", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_WAS_PHI", "homeTeam": "Philadelphia Eagles", "awayTeam": "Washington Commanders", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_BAL_PIT", "homeTeam": "Pittsburgh Steelers", "awayTeam": "Baltimore Ravens", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_KC_LV", "homeTeam": "Las Vegas Raiders", "awayTeam": "Kansas City Chiefs", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_ARI_LAR", "homeTeam": "Los Angeles Rams", "awayTeam": "Arizona Cardinals", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_SEA_SF", "homeTeam": "San Francisco 49ers", "awayTeam": "Seattle Seahawks", "kickoff": "2025-01-05T18:00:00Z", "week": 18},
            {"id": "2025_18_CAR_TB", "homeTeam": "Tampa Bay Buccaneers", "awayTeam": "Carolina Panthers", "kickoff": "2025-01-05T18:00:00Z", "week": 18}
          ]
        }
      }
    };

    await store.set('depth-charts-complete.json', JSON.stringify(depthCharts));
    await store.set('schedule/2025/full-schedule.json', JSON.stringify(schedule));

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Data uploaded successfully' })
    };
  } catch (error) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
}
