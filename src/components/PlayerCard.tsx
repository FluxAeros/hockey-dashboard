import type { PlayerCardData } from "../types";
import { formatTOI } from "../utils/helpers";

export function PlayerCard({ player }: { player: PlayerCardData }) {
  const headshotBase = "https://assets.nhle.com/mugs/nhl/latest";

  return (
    <div className="player-card">
      <div className="player-card-header">
        <div className="player-card-identity">
          <img 
            src={`${headshotBase}/${player.id}.png`} 
            alt={player.name}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            className="player-avatar"
          />
          <span className="player-name">{player.name}</span>
        </div>
        <span className="player-position">{player.position}</span>
      </div>

      <div className="player-matchups">
        {player.opponents.map((opp, i) => (
          <div key={i} className="matchup-row">
            <div className="matchup-identity">
              <span className="matchup-rank">{i + 1}.</span>
              <img 
                src={`${headshotBase}/${opp.id}.png`} 
                alt={opp.name}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="matchup-avatar"
              />
              <span className="matchup-name">{opp.name}</span>
            </div>
            <span className="matchup-toi">{formatTOI(opp.overlap_seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
