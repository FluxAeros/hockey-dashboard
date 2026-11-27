import type { GameStats, TimeoutsInfo, PowerPlayInfo } from "../types";
import { TEAM_COLORS, getReadableTeamColor, getPeriodClockInfo } from "../utils/helpers";
import { NHL_TEAMS, getTeamCityAndMascot } from "../utils/teamsData";
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
  const team = NHL_TEAMS.find((t) => t.teamAbbrev === abbr);
  return team?.teamLogo || `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
}

export function calculateWinProbability(stats: GameStats): { homeProb: number; awayProb: number } {
  if (stats.homeGoals === 0 && stats.awayGoals === 0 && stats.homeShots === 0 && stats.awayShots === 0) {
    return { homeProb: 53.5, awayProb: 46.5 };
  }

  const scoreDiff = stats.homeGoals - stats.awayGoals;
  const xgDiff = stats.homeXG - stats.awayXG;
  const shotDiff = stats.homeShots - stats.awayShots;
  const homeAdvantage = 0.14;

  const logit = homeAdvantage + scoreDiff * 1.35 + xgDiff * 0.55 + shotDiff * 0.05;
  const homeProb = 1 / (1 + Math.exp(-logit));
  const roundedHome = Math.round(homeProb * 1000) / 10;
  const clampedHome = Math.min(99.5, Math.max(0.5, roundedHome));

  return {
    homeProb: clampedHome,
    awayProb: Math.round((100 - clampedHome) * 10) / 10,
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
  powerPlay,
  testPenaltyPreview,
  onDismissTestPenalty,
}: ScoreboardProps) {
  const awayColor = TEAM_COLORS[awayTeamAbbr] || "#006847";
  const homeColor = TEAM_COLORS[homeTeamAbbr] || "#0284C7";
  const awayTextColor = getReadableTeamColor(awayTeamAbbr);
  const homeTextColor = getReadableTeamColor(homeTeamAbbr);

  const awayLogo = getTeamLogo(awayTeamAbbr);
  const homeLogo = getTeamLogo(homeTeamAbbr);
  const awayParts = getTeamCityAndMascot(awayTeamAbbr, awayTeamName);
  const homeParts = getTeamCityAndMascot(homeTeamAbbr, homeTeamName);

  const calculated = calculateWinProbability(stats);
  const homeProb = winProbability?.homeProb ?? calculated.homeProb;
  const awayProb = winProbability?.awayProb ?? calculated.awayProb;

  const stateUpper = (gameState || "").toUpperCase();
  const isLive = stateUpper === "LIVE" || stateUpper === "CRIT";
  const isFinal = ["FINAL", "OFF", "OVER"].includes(stateUpper);
  const isPreGame = !isLive && !isFinal;
  const info = getPeriodClockInfo(gameState, clock, periodDescriptor, startTimeUTC);

  const mockTestPowerPlay: PowerPlayInfo = {
    hasPowerPlay: true,
    ppTeamAbbr: homeTeamAbbr,
    advantage: "5-on-4",
    shortHandedTeamAbbr: awayTeamAbbr,
    clockRunning: true,
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
    },
  };

  const activePowerPlay = testPenaltyPreview ? mockTestPowerPlay : powerPlay;
  const isAwayPP = Boolean(activePowerPlay?.hasPowerPlay && activePowerPlay.ppTeamAbbr === awayTeamAbbr);
  const isHomePP = Boolean(activePowerPlay?.hasPowerPlay && activePowerPlay.ppTeamAbbr === homeTeamAbbr);
  const isAwaySH = Boolean(activePowerPlay?.hasPowerPlay && activePowerPlay.shortHandedTeamAbbr === awayTeamAbbr);
  const isHomeSH = Boolean(activePowerPlay?.hasPowerPlay && activePowerPlay.shortHandedTeamAbbr === homeTeamAbbr);

  return (
    <div className="scoreboard-container">
      {/* Desktop / Unfolded Landscape Unified Scoreboard + Integrated Win Probability */}
      <div className="scoreboard-unified-desktop">
        <div className="scoreboard scoreboard-desktop-view">
        {/* Away Team Section */}
        <div
          className={`scoreboard-team away ${isAwayPP ? "is-power-play" : ""} ${isAwaySH ? "is-short-handed" : ""}`}
          style={{
            "--team-color": awayColor,
            "--team-text-color": awayTextColor,
          } as React.CSSProperties}
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

          <div className="team-name-stack">
            {awayParts.city && <span className="team-city-label">{awayParts.city}</span>}
            <span className="team-full-name">{awayParts.mascot}</span>
            <span className="team-accent-bar" aria-hidden="true" />
          </div>

          <div className="team-score">{isPreGame ? "–" : stats.awayGoals}</div>

          <div className="team-stats-row">
            <div className="team-stats">{stats.awayShots} SOG · {stats.awayXG.toFixed(2)} xG</div>
          </div>
        </div>

        {/* Center Clock / Status Divider */}
        <div className="scoreboard-divider">
          {isLive ? (
            <div className={`scoreboard-clock-hub ${info.statusType === "intermission" ? "is-intermission" : ""}`}>
              <div className="period-tag">
                <span className={`clock-dot ${info.isRunning ? "running" : info.statusType === "intermission" ? "intermission" : "stopped"}`} />
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
          style={{
            "--team-color": homeColor,
            "--team-text-color": homeTextColor,
          } as React.CSSProperties}
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

          <div className="team-name-stack">
            {homeParts.city && <span className="team-city-label">{homeParts.city}</span>}
            <span className="team-full-name">{homeParts.mascot}</span>
            <span className="team-accent-bar" aria-hidden="true" />
          </div>

          <div className="team-score">{isPreGame ? "–" : stats.homeGoals}</div>

          <div className="team-stats-row">
            <div className="team-stats">{stats.homeShots} SOG · {stats.homeXG.toFixed(2)} xG</div>
          </div>
        </div>
      </div>

        {/* Integrated Win Probability Footer inside Desktop Scoreboard */}
        <div className="scoreboard-integrated-wp">
          <div className="scoreboard-integrated-wp-labels">
            <span style={{ color: awayTextColor }}>
              {awayTeamAbbr} {awayProb}%
            </span>
            <span className="scoreboard-integrated-wp-title">Live Win Probability</span>
            <span style={{ color: homeTextColor }}>
              {homeProb}% {homeTeamAbbr}
            </span>
          </div>
          <div className="win-prob-track">
            <div className="win-prob-fill away" style={{ width: `${awayProb}%`, backgroundColor: awayColor }} />
            <div className="win-prob-fill home" style={{ width: `${homeProb}%`, backgroundColor: homeColor }} />
          </div>
        </div>
      </div>

      {/* ======================================================
          Mobile Unified Face-Off Hero Card (Option 2)
         ====================================================== */}
      <div
        className="mobile-faceoff-card"
        style={{
          "--away-color": awayColor,
          "--home-color": homeColor,
          "--away-text-color": awayTextColor,
          "--home-text-color": homeTextColor,
        } as React.CSSProperties}
      >
        {/* Top Status & Clock Bar */}
        <div className="faceoff-top-bar">
          {isLive ? (
            <div className={`faceoff-status-pill ${info.statusType === "intermission" ? "intermission" : "live"}`}>
              <span className={`clock-dot ${info.isRunning ? "running" : info.statusType === "intermission" ? "intermission" : "stopped"}`} />
              <span>{info.shortText}</span>
              {info.timeRemaining && (
                <>
                  <span className="faceoff-sep">·</span>
                  <span className="faceoff-clock-digits">{info.timeRemaining}</span>
                </>
              )}
              {!info.isRunning && info.statusType !== "intermission" && (
                <span className="faceoff-stop-tag">STOP</span>
              )}
            </div>
          ) : isFinal ? (
            <div className="faceoff-status-pill final">{info.primaryText}</div>
          ) : (
            <div className="faceoff-status-pill pre">
              {info.nextPeriodStartEstimate || "Scheduled"}
            </div>
          )}

          {(isAwayPP || isHomePP) && (
            <span className="faceoff-pp-pill">
              {activePowerPlay?.ppTeamAbbr} PP · {activePowerPlay?.advantage}
            </span>
          )}
        </div>

        {/* Center Symmetrical Face-Off Row */}
        <div className="faceoff-main-grid">
          {/* Away Column */}
          <div className={`faceoff-team-col away ${isAwayPP ? "is-pp" : ""}`}>
            <div className="faceoff-logo-wrap">
              <img src={awayLogo} alt={awayTeamName} className="faceoff-team-logo" />
            </div>
            {awayParts.city && <div className="faceoff-team-city">{awayParts.city}</div>}
            <div className="faceoff-team-mascot">{awayParts.mascot}</div>
            <div className="faceoff-team-metrics">
              <span>{stats.awayShots} SOG</span>
              <span>{stats.awayXG.toFixed(2)} xG</span>
            </div>
          </div>

          {/* Center Scoreline */}
          <div className="faceoff-score-center">
            {isPreGame ? (
              <span className="faceoff-vs-badge">VS</span>
            ) : (
              <div className="faceoff-scoreline">
                <span className="faceoff-score-num">{stats.awayGoals}</span>
                <span className="faceoff-score-dash">–</span>
                <span className="faceoff-score-num">{stats.homeGoals}</span>
              </div>
            )}
            {info.statusType === "intermission" && info.nextPeriodLabel && (
              <div className="faceoff-int-note">{info.nextPeriodLabel}</div>
            )}
          </div>

          {/* Home Column */}
          <div className={`faceoff-team-col home ${isHomePP ? "is-pp" : ""}`}>
            <div className="faceoff-logo-wrap">
              <img src={homeLogo} alt={homeTeamName} className="faceoff-team-logo" />
            </div>
            {homeParts.city && <div className="faceoff-team-city">{homeParts.city}</div>}
            <div className="faceoff-team-mascot">{homeParts.mascot}</div>
            <div className="faceoff-team-metrics">
              <span>{stats.homeShots} SOG</span>
              <span>{stats.homeXG.toFixed(2)} xG</span>
            </div>
          </div>
        </div>

        {/* Integrated Win Probability Footer */}
        <div className="faceoff-win-prob">
          <div className="faceoff-wp-labels">
            <span style={{ color: awayTextColor }}>
              {awayTeamAbbr} {awayProb}%
            </span>
            <span className="faceoff-wp-title">WIN PROB</span>
            <span style={{ color: homeTextColor }}>
              {homeProb}% {homeTeamAbbr}
            </span>
          </div>
          <div className="win-prob-track">
            <div className="win-prob-fill away" style={{ width: `${awayProb}%`, backgroundColor: awayColor }} />
            <div className="win-prob-fill home" style={{ width: `${homeProb}%`, backgroundColor: homeColor }} />
          </div>
        </div>
      </div>

      {/* Penalty Box Mugshot Card (Active Power Play or Test Preview) */}
      {activePowerPlay?.hasPowerPlay && activePowerPlay.penalty && (
        <PenaltyBoxMugshot
          powerPlay={activePowerPlay}
          clockRunning={clock?.running}
          inIntermission={clock?.inIntermission}
          isTestPreview={testPenaltyPreview}
          onDismissTest={onDismissTestPenalty}
        />
      )}
    </div>
  );
}
