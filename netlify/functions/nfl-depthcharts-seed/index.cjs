// netlify/functions/nfl-depthcharts-seed/index.cjs
const { getBlobsStore } = require('../_blobs.js');

// Full depth charts (seed payload)
const FULL_DEPTH = {
  "ARI": {
    "QB": [
      "Kyler Murray",
      "Desmond Ridder"
    ],
    "RB": [
      "James Conner",
      "Trey Benson",
      "Emari Demercado"
    ],
    "WR": [
      "Marvin Harrison Jr.",
      "Michael Wilson",
      "Zay Jones",
      "Greg Dortch"
    ],
    "TE": [
      "Trey McBride",
      "Elijah Higgins"
    ]
  },
  "ATL": {
    "QB": [
      "Michael Penix Jr."
    ],
    "RB": [
      "Bijan Robinson",
      "Tyler Allgeier"
    ],
    "WR": [
      "Drake London",
      "Darnell Mooney",
      "Ray-Ray McCloud III",
      "Casey Washington"
    ],
    "TE": [
      "Kyle Pitts Sr."
    ]
  },
  "BAL": {
    "QB": [
      "Lamar Jackson"
    ],
    "RB": [
      "Derrick Henry",
      "Justice Hill",
      "Keaton Mitchell"
    ],
    "WR": [
      "Zay Flowers",
      "Rashod Bateman",
      "DeAndre Hopkins"
    ],
    "TE": [
      "Mark Andrews",
      "Isaiah Likely",
      "Charlie Kolar"
    ]
  },
  "BUF": {
    "QB": [
      "Josh Allen"
    ],
    "RB": [
      "James Cook",
      "Ty Johnson",
      "Ray Davis"
    ],
    "WR": [
      "Keon Coleman",
      "Khalil Shakir",
      "Curtis Samuel",
      "Marquez Valdes-Scantling"
    ],
    "TE": [
      "Dalton Kincaid"
    ]
  },
  "CAR": {
    "QB": [
      "Bryce Young"
    ],
    "RB": [
      "Jonathon Brooks",
      "Chuba Hubbard"
    ],
    "WR": [
      "Diontae Johnson",
      "Adam Thielen",
      "Xavier Legette",
      "Jonathan Mingo"
    ],
    "TE": [
      "JaTavion Sanders"
    ]
  },
  "CHI": {
    "QB": [
      "Caleb Williams"
    ],
    "RB": [
      "D'Andre Swift",
      "Khalil Herbert"
    ],
    "WR": [
      "DJ Moore",
      "Keenan Allen",
      "Rome Odunze"
    ],
    "TE": [
      "Cole Kmet"
    ]
  },
  "CIN": {
    "QB": [
      "Joe Burrow"
    ],
    "RB": [
      "Zack Moss",
      "Chase Brown"
    ],
    "WR": [
      "Ja'Marr Chase",
      "Tee Higgins",
      "Jermaine Burton"
    ],
    "TE": [
      "Mike Gesicki",
      "Tanner Hudson"
    ]
  },
  "CLE": {
    "QB": [
      "Deshaun Watson"
    ],
    "RB": [
      "Nick Chubb",
      "Jerome Ford"
    ],
    "WR": [
      "Amari Cooper",
      "Jerry Jeudy",
      "Elijah Moore"
    ],
    "TE": [
      "David Njoku",
      "Jordan Akins"
    ]
  },
  "DAL": {
    "QB": [
      "Dak Prescott"
    ],
    "RB": [
      "Ezekiel Elliott",
      "Rico Dowdle"
    ],
    "WR": [
      "CeeDee Lamb",
      "Brandin Cooks",
      "Jalen Tolbert"
    ],
    "TE": [
      "Jake Ferguson"
    ]
  },
  "DEN": {
    "QB": [
      "Bo Nix"
    ],
    "RB": [
      "Javonte Williams",
      "Jaleel McLaughlin"
    ],
    "WR": [
      "Courtland Sutton",
      "Marvin Mims Jr.",
      "Troy Franklin"
    ],
    "TE": [
      "Greg Dulcich"
    ]
  },
  "DET": {
    "QB": [
      "Jared Goff"
    ],
    "RB": [
      "Jahmyr Gibbs",
      "David Montgomery"
    ],
    "WR": [
      "Amon-Ra St. Brown",
      "Jameson Williams",
      "Josh Reynolds"
    ],
    "TE": [
      "Sam LaPorta"
    ]
  },
  "GB": {
    "QB": [
      "Jordan Love"
    ],
    "RB": [
      "Josh Jacobs",
      "AJ Dillon"
    ],
    "WR": [
      "Jayden Reed",
      "Christian Watson",
      "Dontayvion Wicks"
    ],
    "TE": [
      "Luke Musgrave",
      "Tucker Kraft"
    ]
  },
  "HOU": {
    "QB": [
      "C.J. Stroud"
    ],
    "RB": [
      "Joe Mixon",
      "Dare Ogunbowale"
    ],
    "WR": [
      "Tank Dell",
      "Nico Collins",
      "Stefon Diggs"
    ],
    "TE": [
      "Dalton Schultz"
    ]
  },
  "IND": {
    "QB": [
      "Anthony Richardson"
    ],
    "RB": [
      "Jonathan Taylor",
      "Evan Hull"
    ],
    "WR": [
      "Michael Pittman Jr.",
      "Josh Downs",
      "Adonai Mitchell"
    ],
    "TE": [
      "Kylen Granson"
    ]
  },
  "JAX": {
    "QB": [
      "Trevor Lawrence"
    ],
    "RB": [
      "Travis Etienne Jr.",
      "Tank Bigsby"
    ],
    "WR": [
      "Brian Thomas Jr.",
      "Christian Kirk",
      "Gabe Davis"
    ],
    "TE": [
      "Evan Engram"
    ]
  },
  "KC": {
    "QB": [
      "Patrick Mahomes II"
    ],
    "RB": [
      "Isiah Pacheco",
      "Jerrick McKinnon"
    ],
    "WR": [
      "Marquise Brown",
      "Rashee Rice",
      "Xavier Worthy"
    ],
    "TE": [
      "Travis Kelce"
    ]
  },
  "LAC": {
    "QB": [
      "Justin Herbert"
    ],
    "RB": [
      "Gus Edwards",
      "J.K. Dobbins"
    ],
    "WR": [
      "Quentin Johnston",
      "Ladd McConkey",
      "Josh Palmer"
    ],
    "TE": [
      "Hayden Hurst",
      "Will Dissly"
    ]
  },
  "LAR": {
    "QB": [
      "Matthew Stafford"
    ],
    "RB": [
      "Kyren Williams",
      "Blake Corum"
    ],
    "WR": [
      "Puka Nacua",
      "Cooper Kupp",
      "Demarcus Robinson"
    ],
    "TE": [
      "Tyler Higbee"
    ]
  },
  "LV": {
    "QB": [
      "Gardner Minshew II"
    ],
    "RB": [
      "Zamir White",
      "Alexander Mattison"
    ],
    "WR": [
      "Davante Adams",
      "Jakobi Meyers",
      "Tre Tucker"
    ],
    "TE": [
      "Michael Mayer",
      "Brock Bowers"
    ]
  },
  "MIA": {
    "QB": [
      "Tua Tagovailoa"
    ],
    "RB": [
      "De'Von Achane",
      "Raheem Mostert"
    ],
    "WR": [
      "Tyreek Hill",
      "Jaylen Waddle",
      "Odell Beckham Jr."
    ],
    "TE": [
      "Jonnu Smith"
    ]
  },
  "MIN": {
    "QB": [
      "J.J. McCarthy"
    ],
    "RB": [
      "Aaron Jones",
      "Ty Chandler"
    ],
    "WR": [
      "Justin Jefferson",
      "Jordan Addison",
      "Brandon Powell"
    ],
    "TE": [
      "T.J. Hockenson",
      "Josh Oliver"
    ]
  },
  "NE": {
    "QB": [
      "Drake Maye"
    ],
    "RB": [
      "Rhamondre Stevenson",
      "Antonio Gibson"
    ],
    "WR": [
      "Kendrick Bourne",
      "Demario Douglas",
      "JuJu Smith-Schuster"
    ],
    "TE": [
      "Hunter Henry"
    ]
  },
  "NO": {
    "QB": [
      "Derek Carr"
    ],
    "RB": [
      "Alvin Kamara",
      "Jamaal Williams"
    ],
    "WR": [
      "Chris Olave",
      "Rashid Shaheed",
      "Cedrick Wilson Jr."
    ],
    "TE": [
      "Juwan Johnson"
    ]
  },
  "NYG": {
    "QB": [
      "Daniel Jones"
    ],
    "RB": [
      "Devin Singletary",
      "Eric Gray"
    ],
    "WR": [
      "Jalin Hyatt",
      "Wan'Dale Robinson",
      "Malik Nabers"
    ],
    "TE": [
      "Darren Waller",
      "Daniel Bellinger"
    ]
  },
  "NYJ": {
    "QB": [
      "Aaron Rodgers"
    ],
    "RB": [
      "Breece Hall",
      "Braelon Allen"
    ],
    "WR": [
      "Garrett Wilson",
      "Mike Williams",
      "Allen Lazard"
    ],
    "TE": [
      "Tyler Conklin"
    ]
  },
  "PHI": {
    "QB": [
      "Jalen Hurts"
    ],
    "RB": [
      "Saquon Barkley",
      "Kenneth Gainwell"
    ],
    "WR": [
      "Devonta Smith",
      "A.J. Brown",
      "Parris Campbell"
    ],
    "TE": [
      "Dallas Goedert"
    ]
  },
  "PIT": {
    "QB": [
      "Russell Wilson"
    ],
    "RB": [
      "Jaylen Warren",
      "Najee Harris"
    ],
    "WR": [
      "George Pickens",
      "Diontae Johnson",
      "Calvin Austin III"
    ],
    "TE": [
      "Pat Freiermuth"
    ]
  },
  "SF": {
    "QB": [
      "Brock Purdy"
    ],
    "RB": [
      "Christian McCaffrey",
      "Elijah Mitchell"
    ],
    "WR": [
      "Brandon Aiyuk",
      "Deebo Samuel",
      "Jauan Jennings"
    ],
    "TE": [
      "George Kittle"
    ]
  },
  "SEA": {
    "QB": [
      "Geno Smith"
    ],
    "RB": [
      "Kenneth Walker III",
      "Zach Charbonnet"
    ],
    "WR": [
      "DK Metcalf",
      "Tyler Lockett",
      "Jaxon Smith-Njigba"
    ],
    "TE": [
      "Noah Fant"
    ]
  },
  "TB": {
    "QB": [
      "Baker Mayfield"
    ],
    "RB": [
      "Bucky Irving",
      "Rachaad White",
      "Sean Tucker"
    ],
    "WR": [
      "Mike Evans",
      "Emeka Egbuka",
      "Sterling Shepard",
      "Tez Johnson",
      "Chris Godwin Jr."
    ],
    "TE": [
      "Cade Otton",
      "Payne Durham"
    ]
  },
  "TEN": {
    "QB": [
      "Cam Ward"
    ],
    "RB": [
      "Tony Pollard",
      "Julius Chestnut"
    ],
    "WR": [
      "Calvin Ridley",
      "Elic Ayomanor",
      "Tyler Lockett",
      "Van Jefferson"
    ],
    "TE": [
      "Chig Okonkwo",
      "Gunnar Helm"
    ]
  },
  "WAS": {
    "QB": [
      "Jayden Daniels"
    ],
    "RB": [
      "Brian Robinson Jr.",
      "Austin Ekeler"
    ],
    "WR": [
      "Terry McLaurin",
      "Jahan Dotson"
    ],
    "TE": [
      "Zach Ertz"
    ]
  }
};

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const season = String(params.season || '2025');
    const week   = String(params.week   || '2'); // default to current week=2 in your flow

    const store = getBlobsStore('nfl-td');
    const weekKey = `depth/season/${season}/week${week}.json`;
    const currKey = `depth/season/${season}/current.json`;

    const body = JSON.stringify(FULL_DEPTH);
    await store.set(weekKey, body, { contentType: 'application/json' });
    await store.set(currKey, body, { contentType: 'application/json' });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        season,
        week,
        wrote: { weekKey, currKey },
        size: body.length
      })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
