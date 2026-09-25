import type { NHLGame } from "../types";
import { STATE_COLORS, STATE_LABELS, TEAM_COLORS, getPeriodClockInfo } from "../utils/helpers";

interface GameCardProps {
  game: NHLGame;
  selected: boolean;
  onSelect: (game: NHLGame) => void;
  winProbability?: { homeProb: number; awayProb: number } | null;
}

export function GameCard({ game, selected, onSelect, winProbability }: GameCardProps) {
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

  const isFinal = state === "FINAL" || state === "OFF" || state === "OVER";

  const wp = winProbability ?? game.winProbability;

  const renderWinProbBadge = () => {
    if (isFinal) return null;

    let homeProb: number | null = null;
    let awayProb: number | null = null;

    if (wp && wp.homeProb != null && wp.awayProb != null) {
      homeProb = Math.round(wp.homeProb);
      awayProb = Math.round(wp.awayProb);
    } else if (isLive && game.homeTeam.score != null && game.awayTeam.score != null) {
      // Fallback live estimate if backend response is still loading
      const scoreDiff = game.homeTeam.score - game.awayTeam.score;
      const logit = 0.14 + (scoreDiff * 1.35);
      const computedHome = Math.min(99, Math.max(1, Math.round((1 / (1 + Math.exp(-logit))) * 100)));
      homeProb = computedHome;
      awayProb = 100 - computedHome;
    }

    if (homeProb == null || awayProb == null) return null;

    const homeAbbr = game.homeTeam.abbrev;
    const awayAbbr = game.awayTeam.abbrev;

    let favAbbr = "";
    let favPct = 50;
    let favColor = "#38bdf8";

    if (homeProb > awayProb) {
      favAbbr = homeAbbr;
      favPct = homeProb;
      favColor = TEAM_COLORS[homeAbbr] || "#38bdf8";
    } else if (awayProb > homeProb) {
      favAbbr = awayAbbr;
      favPct = awayProb;
      favColor = TEAM_COLORS[awayAbbr] || "#38bdf8";
    } else {
      favAbbr = "EVEN";
      favPct = 50;
      favColor = "#94a3b8";
    }

    const titleText = `Live Win Probability: ${awayAbbr} ${awayProb}% · ${homeProb}% ${homeAbbr}`;

    return (
      <span
        className="game-card-win-prob-pill"
        title={titleText}
        style={{
          color: favColor,
          borderColor: `${favColor}44`,
          backgroundColor: `${favColor}1a`,
        }}
      >
        {favAbbr === "EVEN" ? "50/50" : `${favAbbr} ${favPct}%`}
      </span>
    );
  };

  const renderGameTime = () => {
    const info = getPeriodClockInfo(game.gameState, game.clock, game.periodDescriptor, game.startTimeUTC);

    if (isLive) {
      if (info.statusType === "intermission" || info.statusType === "period_end") {
        return (
          <div className="game-card-time live">
            <span
              className="live-clock-badge intermission"
              title={`${info.primaryText}${info.timeRemaining ? ` (${info.timeRemaining} remaining)` : ""} · ${info.nextPeriodLabel || ""}`}
            >
              <span className="pulse-dot-amber" />
              {info.badgeText}
            </span>
            {renderWinProbBadge()}
          </div>
        );
      }

      if (info.timeRemaining) {
        return (
          <div className="game-card-time live">
            <span className="live-clock-badge" title={`${info.primaryText} · ${info.timeRemaining} remaining`}>
              <span className={info.isRunning ? "pulse-dot-green" : "pause-dot"} />
              {info.badgeText}
            </span>
            {renderWinProbBadge()}
          </div>
        );
      }

      return (
        <div className="game-card-time live">
          <span>In Progress</span>
          {renderWinProbBadge()}
        </div>
      );
    }

    if (isFinal) {
      return <div className="game-card-time">{info.primaryText}</div>;
    }

    if (game.startTimeUTC) {
      return (
        <div className="game-card-time">
          <span>{new Date(game.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          {renderWinProbBadge()}
        </div>
      );
    }

    return null;
  };

  return (
    <button
      onClick={() => onSelect(game)}
      className={`game-card ${selected ? "selected" : ""} ${isLive ? "is-live" : ""}`}
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
      {game.awayTeam.score != null && game.homeTeam.score != null && (
        <div className="game-card-score">
          {game.awayTeam.score} – {game.homeTeam.score}
        </div>
      )}
      {renderGameTime()}
    </button>
  );
}
