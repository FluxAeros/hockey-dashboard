import type { GameStats } from "../types";
import { TEAM_COLORS } from "../utils/helpers";

interface ScoreboardProps {
  stats: GameStats;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  awayTeamName: string;
}

export function Scoreboard({ stats, homeTeamAbbr, awayTeamAbbr, homeTeamName, awayTeamName }: ScoreboardProps) {
  const awayColor = TEAM_COLORS[awayTeamAbbr] || "#97C459";
  const homeColor = TEAM_COLORS[homeTeamAbbr] || "#378ADD";

  return (
    <div className="scoreboard">
      <div className="scoreboard-team away" style={{ borderLeftColor: awayColor }}>
        <div className="team-abbr">{awayTeamAbbr} · Away</div>
        <div className="team-xg">{stats.awayXG.toFixed(2)} xG</div>
        <div className="team-stats">{stats.awayShots} shots · {stats.awayGoals} goals</div>
        <div className="team-name">{awayTeamName}</div>
      </div>

      <div className="scoreboard-divider">
        <span>vs</span>
      </div>

      <div className="scoreboard-team home" style={{ borderRightColor: homeColor }}>
        <div className="team-abbr">Home · {homeTeamAbbr}</div>
        <div className="team-xg">{stats.homeXG.toFixed(2)} xG</div>
        <div className="team-stats">{stats.homeGoals} goals · {stats.homeShots} shots</div>
        <div className="team-name">{homeTeamName}</div>
      </div>
    </div>
  );
}
