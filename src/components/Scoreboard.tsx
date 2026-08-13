import type { GameStats } from "../types";
import { TEAM_COLORS } from "../utils/helpers";
import { NHL_TEAMS } from "../utils/teamsData";

interface ScoreboardProps {
  stats: GameStats;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  awayTeamName: string;
}

function getTeamLogo(abbr: string): string {
  const team = NHL_TEAMS.find(t => t.teamAbbrev === abbr);
  return team?.teamLogo || `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
}

export function Scoreboard({ stats, homeTeamAbbr, awayTeamAbbr, homeTeamName, awayTeamName }: ScoreboardProps) {
  const awayColor = TEAM_COLORS[awayTeamAbbr] || "#97C459";
  const homeColor = TEAM_COLORS[homeTeamAbbr] || "#378ADD";
  const awayLogo = getTeamLogo(awayTeamAbbr);
  const homeLogo = getTeamLogo(homeTeamAbbr);

  return (
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
  );
}
