export interface TeamDivisionInfo {
  abbrev: string;
  name: string;
  conference: "Eastern" | "Western";
  division: "Atlantic" | "Metropolitan" | "Central" | "Pacific";
}

export const NHL_TEAMS_METADATA: Record<string, TeamDivisionInfo> = {
  // Eastern - Atlantic
  BOS: { abbrev: "BOS", name: "Boston Bruins", conference: "Eastern", division: "Atlantic" },
  BUF: { abbrev: "BUF", name: "Buffalo Sabres", conference: "Eastern", division: "Atlantic" },
  DET: { abbrev: "DET", name: "Detroit Red Wings", conference: "Eastern", division: "Atlantic" },
  FLA: { abbrev: "FLA", name: "Florida Panthers", conference: "Eastern", division: "Atlantic" },
  MTL: { abbrev: "MTL", name: "Montréal Canadiens", conference: "Eastern", division: "Atlantic" },
  OTT: { abbrev: "OTT", name: "Ottawa Senators", conference: "Eastern", division: "Atlantic" },
  TBL: { abbrev: "TBL", name: "Tampa Bay Lightning", conference: "Eastern", division: "Atlantic" },
  TOR: { abbrev: "TOR", name: "Toronto Maple Leafs", conference: "Eastern", division: "Atlantic" },

  // Eastern - Metropolitan
  CAR: { abbrev: "CAR", name: "Carolina Hurricanes", conference: "Eastern", division: "Metropolitan" },
  CBJ: { abbrev: "CBJ", name: "Columbus Blue Jackets", conference: "Eastern", division: "Metropolitan" },
  NJD: { abbrev: "NJD", name: "New Jersey Devils", conference: "Eastern", division: "Metropolitan" },
  NYI: { abbrev: "NYI", name: "New York Islanders", conference: "Eastern", division: "Metropolitan" },
  NYR: { abbrev: "NYR", name: "New York Rangers", conference: "Eastern", division: "Metropolitan" },
  PHI: { abbrev: "PHI", name: "Philadelphia Flyers", conference: "Eastern", division: "Metropolitan" },
  PIT: { abbrev: "PIT", name: "Pittsburgh Penguins", conference: "Eastern", division: "Metropolitan" },
  WSH: { abbrev: "WSH", name: "Washington Capitals", conference: "Eastern", division: "Metropolitan" },

  // Western - Central
  CHI: { abbrev: "CHI", name: "Chicago Blackhawks", conference: "Western", division: "Central" },
  COL: { abbrev: "COL", name: "Colorado Avalanche", conference: "Western", division: "Central" },
  DAL: { abbrev: "DAL", name: "Dallas Stars", conference: "Western", division: "Central" },
  MIN: { abbrev: "MIN", name: "Minnesota Wild", conference: "Western", division: "Central" },
  NSH: { abbrev: "NSH", name: "Nashville Predators", conference: "Western", division: "Central" },
  STL: { abbrev: "STL", name: "St. Louis Blues", conference: "Western", division: "Central" },
  UTA: { abbrev: "UTA", name: "Utah Hockey Club", conference: "Western", division: "Central" },
  WPG: { abbrev: "WPG", name: "Winnipeg Jets", conference: "Western", division: "Central" },

  // Western - Pacific
  ANA: { abbrev: "ANA", name: "Anaheim Ducks", conference: "Western", division: "Pacific" },
  CGY: { abbrev: "CGY", name: "Calgary Flames", conference: "Western", division: "Pacific" },
  EDM: { abbrev: "EDM", name: "Edmonton Oilers", conference: "Western", division: "Pacific" },
  LAK: { abbrev: "LAK", name: "Los Angeles Kings", conference: "Western", division: "Pacific" },
  SJS: { abbrev: "SJS", name: "San Jose Sharks", conference: "Western", division: "Pacific" },
  SEA: { abbrev: "SEA", name: "Seattle Kraken", conference: "Western", division: "Pacific" },
  VAN: { abbrev: "VAN", name: "Vancouver Canucks", conference: "Western", division: "Pacific" },
  VGK: { abbrev: "VGK", name: "Vegas Golden Knights", conference: "Western", division: "Pacific" },
};

export const CONFERENCES = ["Eastern", "Western"] as const;
export const DIVISIONS = ["Atlantic", "Metropolitan", "Central", "Pacific"] as const;

export function getTeamMetadata(abbrev: string): TeamDivisionInfo | undefined {
  return NHL_TEAMS_METADATA[abbrev?.toUpperCase()];
}
