import { useState } from "react";
import type { Shot } from "../types";
import { TEAM_COLORS } from "../utils/helpers";
import { ShotDot } from "./ShotDot";

interface HockeyRinkProps {
  shots: Shot[];
  homeTeamId: number | null;
  homeAbbr: string;
  awayAbbr: string;
}

export function HockeyRink({ shots, homeTeamId, homeAbbr, awayAbbr }: HockeyRinkProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredShotIdx, setHoveredShotIdx] = useState<number | null>(null);
  const homeColor = TEAM_COLORS[homeAbbr] || "#378ADD";
  const awayColor = TEAM_COLORS[awayAbbr] || "#97C459";

  // Filter shots for the default view
  let displayedShots = shots;
  if (!isExpanded && shots.length > 0) {
    const goals = shots.filter(s => s.is_goal === 1);
    const nonGoals = shots.filter(s => s.is_goal !== 1).sort((a, b) => (b.xg ?? 0) - (a.xg ?? 0));
    const topNonGoals = nonGoals.slice(0, Math.ceil(nonGoals.length * 0.3));
    displayedShots = [...goals, ...topNonGoals];
  }

  const rinkSvg = (
    <svg
      viewBox="-100 -42.5 200 85"
      xmlns="http://www.w3.org/2000/svg"
      className="hockey-rink-svg"
      role="img"
      aria-label="Hockey rink shot map"
    >
      <defs>
        <clipPath id="rinkClip">
          <rect x="-100" y="-42.5" width="200" height="85" rx="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#rinkClip)">
        <rect x="-100" y="-42.5" width="200" height="85" fill="var(--color-rink-bg)" />
        <rect x="-100" y="-42.5" width="200" height="85" rx="9" fill="none" stroke="var(--color-rink-boards)" strokeWidth="0.6" />
        <line x1="0" y1="-42.5" x2="0" y2="42.5" stroke="var(--color-rink-red)" strokeWidth="1" />
        <line x1="-89" y1="-42.5" x2="-89" y2="42.5" stroke="var(--color-rink-red)" strokeWidth="0.6" />
        <line x1="89" y1="-42.5" x2="89" y2="42.5" stroke="var(--color-rink-red)" strokeWidth="0.6" />
        <line x1="-25" y1="-42.5" x2="-25" y2="42.5" stroke="var(--color-rink-blue)" strokeWidth="1.5" />
        <line x1="25" y1="-42.5" x2="25" y2="42.5" stroke="var(--color-rink-blue)" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="15" fill="none" stroke="var(--color-rink-red)" strokeWidth="0.5" />
        <circle cx="0" cy="0" r="1" fill="var(--color-rink-red)" />
        {([[-69, -20.5], [-69, 20.5], [69, -20.5], [69, 20.5]] as [number, number][]).map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="15" fill="none" stroke="var(--color-rink-red)" strokeWidth="0.5" />
            <circle cx={x} cy={y} r="1" fill="var(--color-rink-red)" />
          </g>
        ))}
        {([[-20, -20.5], [-20, 20.5], [20, -20.5], [20, 20.5]] as [number, number][]).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1" fill="var(--color-rink-red)" />
        ))}
        <path d="M -89 -3.5 A 6 6 0 0 0 -89 3.5 L -95 3.5 L -95 -3.5 Z" fill="var(--color-rink-crease)" stroke="var(--color-rink-red)" strokeWidth="0.4" opacity="0.7" />
        <path d="M 89 -3.5 A 6 6 0 0 1 89 3.5 L 95 3.5 L 95 -3.5 Z" fill="var(--color-rink-crease)" stroke="var(--color-rink-red)" strokeWidth="0.4" opacity="0.7" />
        <rect x="-97" y="-3" width="5" height="6" fill="#888780" rx="0.5" />
        <rect x="92" y="-3" width="5" height="6" fill="#888780" rx="0.5" />
        <text x="-55" y="1.5" fontSize="4" fill="var(--color-rink-text)" textAnchor="middle" opacity="0.45" fontFamily="sans-serif">AWAY ZONE</text>
        <text x="55" y="1.5" fontSize="4" fill="var(--color-rink-text)" textAnchor="middle" opacity="0.45" fontFamily="sans-serif">HOME ZONE</text>
      </g>
      <g>
        {displayedShots.map((shot, i) => {
          if (shot.raw_x == null || shot.raw_y == null) return null;
          const isHome = shot.team_id === homeTeamId;
          return (
            <ShotDot 
              key={i} 
              shot={shot} 
              isHome={isHome} 
              teamColor={isHome ? homeColor : awayColor}
              index={i}
              isHovered={false}
              onMouseEnter={() => setHoveredShotIdx(i)}
              onMouseLeave={() => setHoveredShotIdx(null)}
            />
          );
        })}
        {hoveredShotIdx !== null && displayedShots[hoveredShotIdx] && (() => {
          const shot = displayedShots[hoveredShotIdx];
          const isHome = shot.team_id === homeTeamId;
          return (
            <ShotDot 
              key={`active-hover-${hoveredShotIdx}`}
              shot={shot} 
              isHome={isHome} 
              teamColor={isHome ? homeColor : awayColor}
              index={hoveredShotIdx}
              isHovered={true}
              onMouseEnter={() => setHoveredShotIdx(hoveredShotIdx)}
              onMouseLeave={() => setHoveredShotIdx(null)}
            />
          );
        })()}
      </g>
    </svg>
  );

  return (
    <>
      <div 
        className="hockey-rink-container" 
        onClick={() => !isExpanded && setIsExpanded(true)}
        style={{ cursor: isExpanded ? "default" : "pointer" }}
        title={!isExpanded ? "Click to expand shot map" : undefined}
      >
        {rinkSvg}
      </div>

      {isExpanded && (
        <div className="hockey-rink-modal-overlay" onClick={() => setIsExpanded(false)}>
          <div className="hockey-rink-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="hockey-rink-modal-close" onClick={() => setIsExpanded(false)}>
              &times;
            </button>
            <h3 style={{ margin: "0 0 16px 0", color: "var(--color-text)", textAlign: "center" }}>
              All Shots ({shots.length})
            </h3>
            <div className="hockey-rink-modal-svg-wrapper">
              {rinkSvg}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
