import type { NHLGame } from "../types";
import { STATE_COLORS, STATE_LABELS } from "../utils/helpers";

interface GameCardProps {
  game: NHLGame;
  selected: boolean;
  onSelect: (game: NHLGame) => void;
}

export function GameCard({ game, selected, onSelect }: GameCardProps) {
  const state = game.gameState;
  const isLive = state === "LIVE" || state === "CRIT";
  const label = STATE_LABELS[state] ?? state;
  const color = STATE_COLORS[state] ?? "#888780";

  const getGameTypeTag = (type: number) => {
    const num = Number(type);
    switch (num) {
      case 1: return <span className="game-type-tag pre" title="Preseason Game">PRE</span>;
      case 2: return <span className="game-type-tag reg" title="Regular Season Game">REG</span>;
      case 3: return <span className="game-type-tag ply" title="Playoff Game">PLY</span>;
      default: return null;
    }
  };

  return (
    <button
      onClick={() => onSelect(game)}
      className={`game-card ${selected ? "selected" : ""}`}
    >
      <div className="game-card-header">
        <div className="game-card-status">
          <span
            className={`status-dot ${isLive ? "pulse" : ""}`}
            style={{ background: color }}
          />
          <span style={{ color }}>{label}</span>
        </div>
        {getGameTypeTag(game.gameType)}
      </div>
      <div className="game-card-teams">
        {game.awayTeam.abbrev} @ {game.homeTeam.abbrev}
      </div>
      {game.awayTeam.score != null && (
        <div className="game-card-score">
          {game.awayTeam.score} – {game.homeTeam.score}
        </div>
      )}
      {game.startTimeUTC && (
        <div className="game-card-time">
          {new Date(game.startTimeUTC).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </button>
  );
}
