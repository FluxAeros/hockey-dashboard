import type { GameStats, TimeoutsInfo, PowerPlayInfo } from "../types";
import { TEAM_COLORS, getPeriodClockInfo } from "../utils/helpers";
import { NHL_TEAMS } from "../utils/teamsData";
import { PenaltyBoxMugshot } from "./PenaltyBoxMugshot";

interface ScoreboardProps {
  stats: GameStats;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  awayTeamName: string;
  winProbability?: { homeProb: number; awayProb: number } | null;
  gameState?: string;
  clock?: {
    timeRemaining?: string;
    secondsRemaining?: number;
    running?: boolean;
    inIntermission?: boolean;
  } | null;
  periodDescriptor?: {
    number?: number;
    periodType?: string;
  } | null;
  startTimeUTC?: string;
  timeouts?: TimeoutsInfo | null;
  powerPlay?: PowerPlayInfo | null;
  testPenaltyPreview?: boolean;
  onDismissTestPenalty?: () => void;
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

export function Scoreboard({
  stats,
  homeTeamAbbr,
  awayTeamAbbr,
  homeTeamName,
  awayTeamName,
  winProbability,
  gameState,
  clock,
  periodDescriptor,
  startTimeUTC,
  timeouts,
  powerPlay,
  testPenaltyPreview,
  onDismissTestPenalty,
}: ScoreboardProps) {
  const awayColor = TEAM_COLORS[awayTeamAbbr] || "#97C459";
  const homeColor = TEAM_COLORS[homeTeamAbbr] || "#378ADD";
  const awayLogo = getTeamLogo(awayTeamAbbr);
  const homeLogo = getTeamLogo(homeTeamAbbr);

  const calculated = calculateWinProbability(stats);
  const homeProb = winProbability?.homeProb ?? calculated.homeProb;
  const awayProb = winProbability?.awayProb ?? calculated.awayProb;

  const isLive = gameState === "LIVE" || gameState === "CRIT";
  const isFinal = ["FINAL", "OFF", "OVER"].includes((gameState || "").toUpperCase());
  const info = getPeriodClockInfo(gameState, clock, periodDescriptor, startTimeUTC);

  // Timeouts: NHL rules provide 1 timeout per team per game
  const awayTimeouts = timeouts?.awayRemaining ?? 1;
  const homeTimeouts = timeouts?.homeRemaining ?? 1;

  // Mock test penalty preview if requested
  const mockTestPowerPlay: PowerPlayInfo = {
    hasPowerPlay: true,
    ppTeamAbbr: homeTeamAbbr,
    advantage: "5-on-4",
    shortHandedTeamAbbr: awayTeamAbbr,
    penalty: {
      playerId: 8473419,
      playerName: "Brad Marchand",
      sweaterNumber: 63,
      positionCode: "LW",
      headshot: "https://assets.nhle.com/mugs/nhl/latest/8473419.png",
      infraction: "Roughing",
      durationMinutes: 2,
      timeRemaining: "01:45",
      secondsRemaining: 105,
    }
  };

  const activePowerPlay = testPenaltyPreview ? mockTestPowerPlay : powerPlay;
  const isAwayPP = activePowerPlay?.hasPowerPlay && activePowerPlay.ppTeamAbbr === awayTeamAbbr;
  const isHomePP = activePowerPlay?.hasPowerPlay && activePowerPlay.ppTeamAbbr === homeTeamAbbr;
  const isAwaySH = activePowerPlay?.hasPowerPlay && activePowerPlay.shortHandedTeamAbbr === awayTeamAbbr;
  const isHomeSH = activePowerPlay?.hasPowerPlay && activePowerPlay.shortHandedTeamAbbr === homeTeamAbbr;

  return (
    <div className="scoreboard-container">
      <div className="scoreboard">
        {/* Away Team Section */}
        <div
          className={`scoreboard-team away ${isAwayPP ? "is-power-play" : ""} ${isAwaySH ? "is-short-handed" : ""}`}
          style={{ borderLeftColor: isAwayPP ? "#f59e0b" : awayColor, "--team-color": awayColor } as React.CSSProperties}
        >
          <img src={awayLogo} alt="" className="scoreboard-team-bg-logo" aria-hidden="true" />
          
          {isAwayPP && (
            <div className="team-special-teams-tag pp">
              POWER PLAY ({activePowerPlay?.advantage || "5-on-4"})
            </div>
          )}
          {isAwaySH && (
            <div className="team-special-teams-tag pk">
              PK · SHORT-HANDED
            </div>
          )}

          {/* Prominent Team Name Header */}
          <div className="team-name-primary">
            <span className="team-full-name">{awayTeamName}</span>
            <span className="team-role-pill away">AWAY · {awayTeamAbbr}</span>
          </div>

          <div className="team-score">{stats.awayGoals}</div>

          {/* Stats & Timeouts Row */}
          <div className="team-stats-row">
            <div className="team-stats">{stats.awayShots} SOG · {stats.awayXG.toFixed(2)} xG</div>
            <div 
              className="scorebug-timeouts"
              title={`Timeouts: ${awayTimeouts > 0 ? "1 Remaining" : "Exhausted"} (NHL Rule 87: 1 per game)`}
              aria-label={`Timeouts: ${awayTimeouts} remaining`}
            >
              <span className="scorebug-tol-label">TO</span>
              <div className="scorebug-bars-rack">
                {Array.from({ length: Math.max(1, awayTimeouts) }).map((_, i) => (
                  <span
                    key={i}
                    className={`scorebug-bar ${i < awayTimeouts ? "lit" : "spent"}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Center Clock / Status Divider */}
        <div className="scoreboard-divider">
          {isLive ? (
            <div className={`scoreboard-clock-hub ${info.statusType === "intermission" ? "is-intermission" : ""}`}>
              <div className="period-tag">
                <span className={`clock-dot ${info.isRunning ? "running" : (info.statusType === "intermission" ? "intermission" : "stopped")}`} />
                <span>{info.primaryText}</span>
              </div>

              {info.statusType === "intermission" ? (
                <div className="intermission-hub-content">
                  {info.timeRemaining && (
                    <div className="intermission-time-left">{info.timeRemaining} remaining</div>
                  )}
                  {info.nextPeriodLabel && (
                    <div className="next-period-alert">
                      <span className="estimate-icon">⏱</span>
                      <span>{info.nextPeriodLabel}</span>
                    </div>
                  )}
                </div>
              ) : info.timeRemaining ? (
                <div className="live-clock-time">
                  <span className="digits">{info.timeRemaining}</span>
                  {!info.isRunning && <span className="stoppage-pill">STOP</span>}
                </div>
              ) : (
                <div className="live-clock-time">In Progress</div>
              )}
            </div>
          ) : isFinal ? (
            <div className="scoreboard-clock-hub final">
              <span className="final-tag">{info.primaryText}</span>
            </div>
          ) : (
            <div className="scoreboard-clock-hub pre">
              <span className="vs-pill">vs</span>
              {info.nextPeriodStartEstimate && (
                <span className="pre-start-time">{info.nextPeriodStartEstimate}</span>
              )}
            </div>
          )}
        </div>

        {/* Home Team Section */}
        <div
          className={`scoreboard-team home ${isHomePP ? "is-power-play" : ""} ${isHomeSH ? "is-short-handed" : ""}`}
          style={{ borderRightColor: isHomePP ? "#f59e0b" : homeColor, "--team-color": homeColor } as React.CSSProperties}
        >
          <img src={homeLogo} alt="" className="scoreboard-team-bg-logo" aria-hidden="true" />

          {isHomePP && (
            <div className="team-special-teams-tag pp">
              POWER PLAY ({activePowerPlay?.advantage || "5-on-4"})
            </div>
          )}
          {isHomeSH && (
            <div className="team-special-teams-tag pk">
              PK · SHORT-HANDED
            </div>
          )}

          {/* Prominent Team Name Header */}
          <div className="team-name-primary">
            <span className="team-role-pill home">{homeTeamAbbr} · HOME</span>
            <span className="team-full-name">{homeTeamName}</span>
          </div>

          <div className="team-score">{stats.homeGoals}</div>

          {/* Stats & Timeouts Row */}
          <div className="team-stats-row">
            <div 
              className="scorebug-timeouts"
              title={`Timeouts: ${homeTimeouts > 0 ? "1 Remaining" : "Exhausted"} (NHL Rule 87: 1 per game)`}
              aria-label={`Timeouts: ${homeTimeouts} remaining`}
            >
              <span className="scorebug-tol-label">TO</span>
              <div className="scorebug-bars-rack">
                {Array.from({ length: Math.max(1, homeTimeouts) }).map((_, i) => (
                  <span
                    key={i}
                    className={`scorebug-bar ${i < homeTimeouts ? "lit" : "spent"}`}
                  />
                ))}
              </div>
            </div>
            <div className="team-stats">{stats.homeShots} SOG · {stats.homeXG.toFixed(2)} xG</div>
          </div>
        </div>
      </div>

      {/* Mobile Stats Summary (visible only on small screens) */}
      <div className="mobile-stats-summary">
        <div className="mobile-stat-strip" style={{ "--strip-color": awayColor } as React.CSSProperties}>
          <span className="mobile-stat-team">{awayTeamAbbr}</span>
          <span className="mobile-stat-detail">{stats.awayShots} SOG</span>
          <span className="mobile-stat-detail">{stats.awayXG.toFixed(2)} xG</span>
          <div 
            className="scorebug-timeouts"
            title={`Timeouts: ${awayTimeouts > 0 ? "1 Remaining" : "Exhausted"}`}
          >
            <span className="scorebug-tol-label">TO</span>
            <div className="scorebug-bars-rack">
              {Array.from({ length: Math.max(1, awayTimeouts) }).map((_, i) => (
                <span key={i} className={`scorebug-bar ${i < awayTimeouts ? "lit" : "spent"}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="mobile-stat-strip" style={{ "--strip-color": homeColor } as React.CSSProperties}>
          <span className="mobile-stat-team">{homeTeamAbbr}</span>
          <span className="mobile-stat-detail">{stats.homeShots} SOG</span>
          <span className="mobile-stat-detail">{stats.homeXG.toFixed(2)} xG</span>
          <div 
            className="scorebug-timeouts"
            title={`Timeouts: ${homeTimeouts > 0 ? "1 Remaining" : "Exhausted"}`}
          >
            <span className="scorebug-tol-label">TO</span>
            <div className="scorebug-bars-rack">
              {Array.from({ length: Math.max(1, homeTimeouts) }).map((_, i) => (
                <span key={i} className={`scorebug-bar ${i < homeTimeouts ? "lit" : "spent"}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Penalty Box Mugshot Card (Active Power Play or Test Preview) */}
      {activePowerPlay?.hasPowerPlay && activePowerPlay.penalty && (
        <PenaltyBoxMugshot
          powerPlay={activePowerPlay}
          isTestPreview={testPenaltyPreview}
          onDismissTest={onDismissTestPenalty}
        />
      )}

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
