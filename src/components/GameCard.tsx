import type { NHLGame } from "../types";
import { STATE_COLORS, STATE_LABELS, TEAM_COLORS, getReadableTeamColor, getPeriodClockInfo } from "../utils/helpers";

interface GameCardProps {
  game: NHLGame;
  selected: boolean;
  onSelect: (game: NHLGame) => void;
  winProbability?: { homeProb: number; awayProb: number } | null;
}

export function GameCard({ game, selected, onSelect, winProbability }: GameCardProps) {
  const state = game.gameState;
  const isLive = state === "LIVE" || state === "CRIT";
  const isFinal = state === "FINAL" || state === "OFF" || state === "OVER";
  const isUpcoming = !isLive && !isFinal;
  const label = STATE_LABELS[state] ?? state;
  const color = STATE_COLORS[state] ?? "#64748b";
  const info = getPeriodClockInfo(game.gameState, game.clock, game.periodDescriptor, game.startTimeUTC);

  const wp = winProbability ?? game.winProbability;

  const getWinProb = (): { awayProb: number; homeProb: number } | null => {
    if (isFinal) return null;

    if (wp && wp.homeProb != null && wp.awayProb != null) {
      return {
        homeProb: Math.round(wp.homeProb),
        awayProb: Math.round(wp.awayProb),
      };
    }

    if (isLive && game.homeTeam.score != null && game.awayTeam.score != null) {
      const scoreDiff = game.homeTeam.score - game.awayTeam.score;
      const logit = 0.14 + scoreDiff * 1.35;
      const computedHome = Math.min(99, Math.max(1, Math.round((1 / (1 + Math.exp(-logit))) * 100)));
      return {
        homeProb: computedHome,
        awayProb: 100 - computedHome,
      };
    }

    return null;
  };

  const renderCornerTime = () => {
    if (isLive) {
      if (info.statusType === "intermission" || info.statusType === "period_end") {
        return (
          <span
            className="game-card-corner-time intermission"
            title={`${info.primaryText}${info.timeRemaining ? ` (${info.timeRemaining} remaining)` : ""}`}
          >
            <span className="pulse-dot-amber" />
            {info.shortText}{info.timeRemaining ? ` · ${info.timeRemaining}` : ""}
          </span>
        );
      }

      if (info.timeRemaining) {
        return (
          <span
            className="game-card-corner-time live"
            title={`${info.primaryText} · ${info.timeRemaining} remaining`}
          >
            <span className={info.isRunning ? "pulse-dot-green" : "pause-dot"} />
            {info.shortText} · {info.timeRemaining}
          </span>
        );
      }

      return <span className="game-card-corner-time live">Live</span>;
    }

    if (isFinal) {
      return <span className="game-card-corner-time final">{info.primaryText}</span>;
    }

    if (game.startTimeUTC) {
      const startTime = new Date(game.startTimeUTC).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      return <span className="game-card-corner-time upcoming">{startTime}</span>;
    }

    return null;
  };

  const awayAbbr = game.awayTeam.abbrev;
  const homeAbbr = game.homeTeam.abbrev;
  const awayScore = game.awayTeam.score;
  const homeScore = game.homeTeam.score;
  const hasScore = !isUpcoming && awayScore != null && homeScore != null;
  const awayLead = hasScore && awayScore > homeScore;
  const homeLead = hasScore && homeScore > awayScore;

  const prob = getWinProb();
  const awayColor = TEAM_COLORS[awayAbbr] || "#006847";
  const homeColor = TEAM_COLORS[homeAbbr] || "#0284C7";
  const awayTextColor = getReadableTeamColor(awayAbbr);
  const homeTextColor = getReadableTeamColor(homeAbbr);

  return (
    <button
      onClick={() => onSelect(game)}
      className={`game-card ${selected ? "selected" : ""} ${isLive ? "is-live" : isFinal ? "is-final" : "is-upcoming"}`}
    >
      {/* Top Row: Status on Left, Scheduled Time / Time Remaining in Upper Right */}
      <div className="game-card-header">
        <div className="game-card-status">
          <span
            className={`status-dot ${isLive ? "pulse" : ""}`}
            style={{ background: color }}
          />
          <span style={{ color }}>{label}</span>
        </div>
        {renderCornerTime()}
      </div>

      {/* Middle: Teams & Logos */}
      <div className="game-card-teams">
        <span className="game-card-team-side">
          <img
            src={`https://assets.nhle.com/logos/nhl/svg/${awayAbbr}_light.svg`}
            alt={awayAbbr}
            className="game-card-team-logo"
          />
          <span>{awayAbbr}</span>
        </span>
        <span className="game-card-at">@</span>
        <span className="game-card-team-side">
          <span>{homeAbbr}</span>
          <img
            src={`https://assets.nhle.com/logos/nhl/svg/${homeAbbr}_light.svg`}
            alt={homeAbbr}
            className="game-card-team-logo"
          />
        </span>
      </div>

      {hasScore && (
        <div className="game-card-score">
          <span
            className={awayLead ? "game-card-score-lead" : "game-card-score-trail"}
            style={awayLead ? { color: awayTextColor } : undefined}
          >
            {awayScore}
          </span>
          <span className="game-card-score-sep">–</span>
          <span
            className={homeLead ? "game-card-score-lead" : "game-card-score-trail"}
            style={homeLead ? { color: homeTextColor } : undefined}
          >
            {homeScore}
          </span>
        </div>
      )}

      {/* Bottom: Integrated Win Probability Bar */}
      {prob && (
        <div
          className="game-card-wp-footer"
          title={`Win Probability: ${awayAbbr} ${prob.awayProb}% · ${prob.homeProb}% ${homeAbbr}`}
        >
          <div className="game-card-wp-labels">
            <span style={{ color: awayTextColor }}>{awayAbbr} {prob.awayProb}%</span>
            <span style={{ color: homeTextColor }}>{prob.homeProb}% {homeAbbr}</span>
          </div>
          <div className="game-card-wp-track">
            <div
              className="game-card-wp-fill"
              style={{ width: `${prob.awayProb}%`, backgroundColor: awayColor }}
            />
            <div
              className="game-card-wp-fill"
              style={{ width: `${prob.homeProb}%`, backgroundColor: homeColor }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
