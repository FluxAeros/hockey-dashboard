import type { MatchupsResponse, TeamMatchups } from "../types";
import { PlayerCard } from "./PlayerCard";

interface MatchupBoardProps {
  matchups: MatchupsResponse;
  homeTeamId: number | null;
  homeAbbr: string;
  awayAbbr: string;
}

export function MatchupBoard({ matchups, homeTeamId, homeAbbr, awayAbbr }: MatchupBoardProps) {
  if (!matchups || !matchups.team1 || !matchups.team2) return null;

  const isTeam1Home = matchups.team1.id === homeTeamId;
  const homeData = isTeam1Home ? matchups.team1 : matchups.team2;
  const awayData = isTeam1Home ? matchups.team2 : matchups.team1;

  const renderTeamSection = (teamAbbr: string, data: TeamMatchups, color: string) => (
    <div className="matchup-section">
      <div className="matchup-section-header" style={{ borderColor: color }}>
        {teamAbbr} Active Roster
      </div>
      <div className="matchup-grid">
        {data.players.map(p => <PlayerCard key={p.name} player={p} />)}
      </div>
    </div>
  );

  return (
    <div className="matchup-board">
      {renderTeamSection(awayAbbr, awayData, "var(--color-away)")}
      {renderTeamSection(homeAbbr, homeData, "var(--color-home)")}
    </div>
  );
}
