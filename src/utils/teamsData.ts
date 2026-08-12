export interface TeamInfo {
  teamAbbrev: string;
  teamName: string;
  teamLogo: string;
}

// Eastern: Atlantic + Metropolitan
// Western: Central + Pacific
export const TEAM_CONFERENCE: Record<string, "Eastern" | "Western"> = {
  // Eastern – Atlantic
  BOS: "Eastern", BUF: "Eastern", DET: "Eastern", FLA: "Eastern",
  MTL: "Eastern", OTT: "Eastern", TBL: "Eastern", TOR: "Eastern",
  // Eastern – Metropolitan
  CAR: "Eastern", CBJ: "Eastern", NJD: "Eastern", NYI: "Eastern",
  NYR: "Eastern", PHI: "Eastern", PIT: "Eastern", WSH: "Eastern",
  // Western – Central
  CHI: "Western", COL: "Western", DAL: "Western", MIN: "Western",
  NSH: "Western", STL: "Western", UTA: "Western", WPG: "Western",
  // Western – Pacific
  ANA: "Western", CGY: "Western", EDM: "Western", LAK: "Western",
  SEA: "Western", SJS: "Western", VAN: "Western", VGK: "Western",
};

export const NHL_TEAMS: TeamInfo[] = [
  {
    "teamAbbrev": "ANA",
    "teamName": "Anaheim Ducks",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/ANA_light.svg"
  },
  {
    "teamAbbrev": "BOS",
    "teamName": "Boston Bruins",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/BOS_light.svg?season=20252026"
  },
  {
    "teamAbbrev": "BUF",
    "teamName": "Buffalo Sabres",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/BUF_light.svg"
  },
  {
    "teamAbbrev": "CAR",
    "teamName": "Carolina Hurricanes",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/CAR_light.svg"
  },
  {
    "teamAbbrev": "CBJ",
    "teamName": "Columbus Blue Jackets",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/CBJ_light.svg"
  },
  {
    "teamAbbrev": "CGY",
    "teamName": "Calgary Flames",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/CGY_light.svg"
  },
  {
    "teamAbbrev": "CHI",
    "teamName": "Chicago Blackhawks",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/CHI_light.svg?season=20252026"
  },
  {
    "teamAbbrev": "COL",
    "teamName": "Colorado Avalanche",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/COL_light.svg"
  },
  {
    "teamAbbrev": "DAL",
    "teamName": "Dallas Stars",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/DAL_light.svg"
  },
  {
    "teamAbbrev": "DET",
    "teamName": "Detroit Red Wings",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/DET_light.svg?season=20252026"
  },
  {
    "teamAbbrev": "EDM",
    "teamName": "Edmonton Oilers",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/EDM_light.svg"
  },
  {
    "teamAbbrev": "FLA",
    "teamName": "Florida Panthers",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/FLA_light.svg"
  },
  {
    "teamAbbrev": "LAK",
    "teamName": "Los Angeles Kings",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/LAK_light.svg"
  },
  {
    "teamAbbrev": "MIN",
    "teamName": "Minnesota Wild",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/MIN_light.svg"
  },
  {
    "teamAbbrev": "MTL",
    "teamName": "Montréal Canadiens",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/MTL_light.svg"
  },
  {
    "teamAbbrev": "NJD",
    "teamName": "New Jersey Devils",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/NJD_light.svg"
  },
  {
    "teamAbbrev": "NSH",
    "teamName": "Nashville Predators",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/NSH_light.svg"
  },
  {
    "teamAbbrev": "NYI",
    "teamName": "New York Islanders",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/NYI_light.svg"
  },
  {
    "teamAbbrev": "NYR",
    "teamName": "New York Rangers",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg"
  },
  {
    "teamAbbrev": "OTT",
    "teamName": "Ottawa Senators",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/OTT_light.svg"
  },
  {
    "teamAbbrev": "PHI",
    "teamName": "Philadelphia Flyers",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/PHI_light.svg"
  },
  {
    "teamAbbrev": "PIT",
    "teamName": "Pittsburgh Penguins",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/PIT_light.svg"
  },
  {
    "teamAbbrev": "SEA",
    "teamName": "Seattle Kraken",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/SEA_light.svg"
  },
  {
    "teamAbbrev": "SJS",
    "teamName": "San Jose Sharks",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/SJS_light.svg"
  },
  {
    "teamAbbrev": "STL",
    "teamName": "St. Louis Blues",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/STL_light.svg?season=20252026"
  },
  {
    "teamAbbrev": "TBL",
    "teamName": "Tampa Bay Lightning",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/TBL_light.svg"
  },
  {
    "teamAbbrev": "TOR",
    "teamName": "Toronto Maple Leafs",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/TOR_light.svg"
  },
  {
    "teamAbbrev": "UTA",
    "teamName": "Utah Mammoth",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/UTA_light.svg?season=20252026"
  },
  {
    "teamAbbrev": "VAN",
    "teamName": "Vancouver Canucks",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/VAN_light.svg"
  },
  {
    "teamAbbrev": "VGK",
    "teamName": "Vegas Golden Knights",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/VGK_light.svg"
  },
  {
    "teamAbbrev": "WPG",
    "teamName": "Winnipeg Jets",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/WPG_light.svg"
  },
  {
    "teamAbbrev": "WSH",
    "teamName": "Washington Capitals",
    "teamLogo": "https://assets.nhle.com/logos/nhl/svg/WSH_secondary_light.svg"
  }
];
