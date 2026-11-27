import { useState, useEffect } from "react";
import type { PowerPlayInfo } from "../types";
import { TEAM_COLORS, getReadableTeamColor } from "../utils/helpers";

interface PenaltyBoxMugshotProps {
  powerPlay: PowerPlayInfo;
  clockRunning?: boolean;
  inIntermission?: boolean;
  isTestPreview?: boolean;
  onDismissTest?: () => void;
}

export function PenaltyBoxMugshot({
  powerPlay,
  clockRunning,
  inIntermission,
  isTestPreview,
  onDismissTest,
}: PenaltyBoxMugshotProps) {
  const penalty = powerPlay.penalty;
  const isClockRunning = isTestPreview
    ? true
    : (clockRunning ?? powerPlay.clockRunning ?? false) &&
      !(inIntermission ?? powerPlay.inIntermission ?? false);

  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    return penalty?.secondsRemaining ?? (penalty?.durationMinutes ?? 2) * 60;
  });

  const [imgError, setImgError] = useState(false);

  // Re-sync whenever server sends an updated penalty or remaining time
  useEffect(() => {
    if (!penalty) return;
    setSecondsLeft(penalty.secondsRemaining ?? penalty.durationMinutes * 60);
    setImgError(false);
  }, [penalty?.playerId, penalty?.secondsRemaining, penalty?.durationMinutes]);

  // Only tick the local countdown while the official game clock is actively running
  useEffect(() => {
    if (!penalty || !isClockRunning || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [penalty, isClockRunning, secondsLeft > 0]);

  if (!penalty || (!isTestPreview && (!powerPlay.hasPowerPlay || secondsLeft <= 0))) {
    return null;
  }

  const shTeamAbbr = powerPlay.shortHandedTeamAbbr || "DEF";
  const ppTeamAbbr = powerPlay.ppTeamAbbr || "OFF";
  const shColor = TEAM_COLORS[shTeamAbbr] || "#dc2626";
  const ppColor = TEAM_COLORS[ppTeamAbbr] || "#b45309";
  const shTextColor = getReadableTeamColor(shTeamAbbr);
  const ppTextColor = getReadableTeamColor(ppTeamAbbr);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const totalDurationSecs = Math.max(1, (penalty.durationMinutes || 2) * 60);
  const progressPct = Math.min(100, Math.max(0, ((totalDurationSecs - secondsLeft) / totalDurationSecs) * 100));

  return (
    <div className="penalty-mugshot-container">
      <div className="penalty-mugshot-card" style={{ borderColor: `${shColor}88` }}>
        {/* Caution stripe header */}
        <div className="penalty-card-header">
          <div className="penalty-header-left">
            <span className="siren-dot" />
            <span className="penalty-header-title">PENALTY BOX</span>
          </div>
          <div className="penalty-header-right">
            <span className="pp-advantage-tag" style={{ color: ppTextColor, borderColor: `${ppColor}55`, backgroundColor: `${ppColor}16` }}>
              {ppTeamAbbr} POWER PLAY ({powerPlay.advantage})
            </span>
            {isTestPreview && (
              <button
                className="penalty-dismiss-btn"
                onClick={onDismissTest}
                title="Close test preview"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Main Body: Mugshot on Left, Crime & Clock on Right */}
        <div className="penalty-card-body">
          {/* Mugshot Polaroid Frame */}
          <div className="mugshot-frame">
            <div className="mugshot-height-lines" aria-hidden="true">
              <span>6&apos;4&quot;</span>
              <span>6&apos;2&quot;</span>
              <span>6&apos;0&quot;</span>
              <span>5&apos;10&quot;</span>
              <span>5&apos;8&quot;</span>
            </div>
            {!imgError ? (
              <img
                src={penalty.headshot}
                alt={penalty.playerName}
                className="mugshot-img"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="mugshot-placeholder">
                <span className="mugshot-icon">🏒</span>
              </div>
            )}
            <div className="mugshot-placard">
              <span className="placard-inmate-tag">INMATE #{penalty.sweaterNumber ?? "00"}</span>
              <span className="placard-name">{penalty.playerName.toUpperCase()}</span>
            </div>
          </div>

          {/* Details & Timer */}
          <div className="penalty-details">
            <div className="penalty-offense-row">
              <div className="penalty-offense-label">OFFENSE COMMITTED</div>
              <div className="penalty-offense-badge">
                {penalty.infraction.toUpperCase()}
              </div>
            </div>

            <div className="penalty-sentence-text">
              SENTENCED TO {penalty.durationMinutes} MINUTES IN THE BOX
            </div>

            {/* Countdown Clock */}
            <div className="penalty-clock-block">
              <div className="penalty-clock-label">
                TIME REMAINING
                {!isClockRunning && (
                  <span className="penalty-clock-paused-tag">
                    {inIntermission ?? powerPlay.inIntermission ? " · INT" : " · STOPPED"}
                  </span>
                )}
              </div>
              <div className="penalty-clock-digits" style={{ color: secondsLeft <= 30 ? "#dc2626" : "#b45309" }}>
                {formattedTime}
              </div>
              <div className="penalty-progress-track">
                <div
                  className="penalty-progress-fill"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: secondsLeft <= 30 ? "#ef4444" : ppColor,
                  }}
                />
              </div>
            </div>

            <div className="penalty-team-status">
              <span className="sh-team-tag" style={{ color: shTextColor }}>
                {shTeamAbbr} SHORT-HANDED ({powerPlay.advantage.split("-on-")[1] ?? "4"} SKATERS)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
