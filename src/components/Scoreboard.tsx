import type { GameStats } from "../types";
import { TEAM_COLORS } from "../utils/helpers";
import { NHL_TEAMS } from "../utils/teamsData";

interface ScoreboardProps {
  stats: GameStats;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  awayTeamName: string;
  winProbability?: { homeProb: number; awayProb: number } | null;
}

function getTeamLogo(abbr: string): string {
  const team = NHL_TEAMS.find(t => t.teamAbbrev === abbr);
  return team?.teamLogo || `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
}

export function calculateWinProbability(stats: GameStats): { homeProb: number; awayProb: number } {
  // Pre-game baseline
  if (stats.homeGoals === 0 && stats.awayGoals === 0 && stats.homeShots === 0 && stats.awayShots === 0) {
    return { homeProb: 53.5, awayProb: 46.5 };
  }

  // Logistic model combining Score differential, xG differential, and Shot pressure
  const scoreDiff = stats.homeGoals - stats.awayGoals;
  const xgDiff = stats.homeXG - stats.awayXG;
  const shotDiff = stats.homeShots - stats.awayShots;
  const homeAdvantage = 0.14;

  const logit = homeAdvantage + (scoreDiff * 1.35) + (xgDiff * 0.55) + (shotDiff * 0.05);
  const homeProb = 1 / (1 + Math.exp(-logit));
  const roundedHome = Math.round(homeProb * 1000) / 10;
  const clampedHome = Math.min(99.5, Math.max(0.5, roundedHome));

  return {
    homeProb: clampedHome,
    awayProb: Math.round((100 - clampedHome) * 10) / 10
  };
}

export function Scoreboard({ stats, homeTeamAbbr, awayTeamAbbr, homeTeamName, awayTeamName, winProbability }: ScoreboardProps) {
  const awayColor = TEAM_COLORS[awayTeamAbbr] || "#97C459";
  const homeColor = TEAM_COLORS[homeTeamAbbr] || "#378ADD";
  const awayLogo = getTeamLogo(awayTeamAbbr);
  const homeLogo = getTeamLogo(homeTeamAbbr);

  const calculated = calculateWinProbability(stats);
  const homeProb = winProbability?.homeProb ?? calculated.homeProb;
  const awayProb = winProbability?.awayProb ?? calculated.awayProb;

  return (
    <div className="scoreboard-container">
      <div className="scoreboard">
        <div
          className="scoreboard-team away"
          style={{ borderLeftColor: awayColor, "--team-color": awayColor } as React.CSSProperties}
        >
          <img src={awayLogo} alt="" className="scoreboard-team-bg-logo" aria-hidden="true" />
          <div className="team-abbr">{awayTeamAbbr} · Away</div>
          <div className="team-score">{stats.awayGoals}</div>
          <div className="team-stats">{stats.awayShots} SOG · {stats.awayXG.toFixed(2)} xG</div>
          <div className="team-name">{awayTeamName}</div>
        </div>

        <div className="scoreboard-divider">
          <span>vs</span>
        </div>

        <div
          className="scoreboard-team home"
          style={{ borderRightColor: homeColor, "--team-color": homeColor } as React.CSSProperties}
        >
          <img src={homeLogo} alt="" className="scoreboard-team-bg-logo" aria-hidden="true" />
          <div className="team-abbr">Home · {homeTeamAbbr}</div>
          <div className="team-score">{stats.homeGoals}</div>
          <div className="team-stats">{stats.homeShots} SOG · {stats.homeXG.toFixed(2)} xG</div>
          <div className="team-name">{homeTeamName}</div>
        </div>
      </div>

      {/* Win Probability Bar */}
      <div className="win-prob-section">
        <div className="win-prob-header">
          <span className="win-prob-title">Live Win Probability</span>
          <div className="win-prob-labels">
            <span style={{ color: awayColor }}>{awayTeamAbbr} {awayProb}%</span>
            <span style={{ color: homeColor }}>{homeProb}% {homeTeamAbbr}</span>
          </div>
        </div>
        <div className="win-prob-track">
          <div 
            className="win-prob-fill away" 
            style={{ width: `${awayProb}%`, backgroundColor: awayColor }} 
          />
          <div 
            className="win-prob-fill home" 
            style={{ width: `${homeProb}%`, backgroundColor: homeColor }} 
          />
        </div>
      </div>
    </div>
  );
}
