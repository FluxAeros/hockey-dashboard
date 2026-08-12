export interface TeamInfo {
  id: number;
  abbrev: string;
  score?: number;
  name?: { default: string };
}

export interface NHLGame {
  id: number;
  gameType: number;
  gameState: string;
  startTimeUTC: string;
  awayTeam: TeamInfo;
  homeTeam: TeamInfo;
}

export interface Shot {
  raw_x: number | null;
  raw_y: number | null;
  xg: number;
  is_goal: number;
  team_id: number | null;
  distance: number | null;
  angle: number | null;
  is_rebound: number;
  is_rush: number;
  shot_type: string;
}

export interface GameStats {
  homeXG: number;
  awayXG: number;
  homeShots: number;
  awayShots: number;
  homeGoals: number;
  awayGoals: number;
}

export interface OpponentMatchup {
  id: number;
  name: string;
  overlap_seconds: number;
}

export interface PlayerCardData {
  id: number;
  name: string;
  position: string;
  opponents: OpponentMatchup[];
}

export interface TeamMatchups {
  id: number;
  players: PlayerCardData[];
}

export interface MatchupsResponse {
  team1?: TeamMatchups;
  team2?: TeamMatchups;
}
