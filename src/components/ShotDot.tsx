import { useState, useId } from "react";
import type { Shot } from "../types";
import { xgToRadius } from "../utils/helpers";

interface ShotDotProps {
  shot: Shot;
  isHome: boolean;
  teamColor: string;
  index?: number;
}

export function ShotDot({ shot, isHome, teamColor, index = 0 }: ShotDotProps) {
  const [hovered, setHovered] = useState(false);
  const uid = useId().replace(/:/g, "");
  const xg = shot.xg ?? 0;
  const isGoal = shot.is_goal === 1;
  const r = xgToRadius(xg);

  const rawX = shot.raw_x ?? 0;
  const rawY = shot.raw_y ?? 0;
  
  let normX = rawX;
  let normY = rawY;

  if (isHome && rawX > 0) {
    normX = -rawX;
    normY = -rawY; 
  } else if (!isHome && rawX < 0) {
    normX = -rawX;
    normY = -rawY;
  }

  const renderX = normX;
  const renderY = -normY;

  // Parse team color to build gradient shades
  const glowColor = teamColor;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <defs>
        {/* Radial gradient for depth */}
        <radialGradient id={`grad-${uid}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor={teamColor} stopOpacity="1" />
        </radialGradient>
        {/* Glow filter */}
        <filter id={`glow-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={isGoal ? "1.8" : "0.7"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer goal ring pulse */}
      {isGoal && (
        <>
          <circle
            cx={renderX} cy={renderY} r={r + 4.5}
            fill="none" stroke={glowColor} strokeWidth="0.6"
            opacity="0.5"
            style={{ animation: "pulse 2s ease-out infinite" }}
          />
          <circle
            cx={renderX} cy={renderY} r={r + 2.5}
            fill="none" stroke={glowColor} strokeWidth="0.8"
            opacity="0.8"
          />
        </>
      )}

      {/* Main shot shape */}
      {isHome ? (
        // Diamond for home team
        <polygon
          points={`${renderX},${renderY - r} ${renderX + r},${renderY} ${renderX},${renderY + r} ${renderX - r},${renderY}`}
          fill={`url(#grad-${uid})`}
          stroke={isGoal ? "#FFD700" : teamColor}
          strokeWidth={isGoal ? "0.8" : "0.3"}
          strokeOpacity={isGoal ? 1 : 0.6}
          filter={`url(#glow-${uid})`}
          style={{
            animation: `shotEntrance 0.3s ${Math.min(index * 0.02, 1)}s both ease-out`
          }}
        />
      ) : (
        // Circle for away team
        <circle
          cx={renderX} cy={renderY} r={r}
          fill={`url(#grad-${uid})`}
          stroke={isGoal ? "#FFD700" : teamColor}
          strokeWidth={isGoal ? "0.8" : "0.3"}
          strokeOpacity={isGoal ? 1 : 0.6}
          filter={`url(#glow-${uid})`}
          style={{
            animation: `shotEntrance 0.3s ${Math.min(index * 0.02, 1)}s both ease-out`
          }}
        />
      )}

      {/* Goal star marker */}
      {isGoal && (
        <text
          x={renderX} y={renderY + 0.8}
          fontSize="2.5"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >★</text>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <foreignObject
          x={renderX + r + 1.5} y={renderY - 12}
          width="40" height="28"
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div className="shot-tooltip" style={{ borderColor: teamColor, boxShadow: `0 0 12px ${teamColor}40` }}>
            <div className="shot-tooltip-title" style={{ color: teamColor }}>
              {isGoal ? "⚡ GOAL" : "Shot"} — {(xg * 100).toFixed(1)}%
            </div>
            <div className="shot-tooltip-meta">
              {shot.distance != null ? shot.distance.toFixed(1) : "—"} ft
              {" · "}
              {shot.angle != null ? Math.abs(shot.angle).toFixed(1) : "—"}°
              {shot.is_rebound ? " · Rebound" : ""}
              {shot.is_rush ? " · Rush" : ""}
              {shot.shot_type && shot.shot_type !== "unknown" ? ` · ${shot.shot_type}` : ""}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
