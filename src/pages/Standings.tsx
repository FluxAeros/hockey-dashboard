import { useState, useEffect, useMemo } from "react";
import type { StandingItem, StandingsResponse } from "../types";
import { TEAM_COLORS } from "../utils/helpers";
import { Trophy } from "lucide-react";
import { motion } from "framer-motion";

type ViewMode = "division" | "conference" | "league" | "wildcard";
type SortKey = "points" | "pointPctg" | "wins" | "regulationWins" | "goalDifferential" | "goalFor" | "gamesPlayed";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const DIVISION_ORDER = ["Atlantic", "Metropolitan", "Central", "Pacific"];
const CONFERENCE_ORDER = ["Eastern", "Western"];

export default function Standings() {
  const [standings, setStandings] = useState<StandingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("division");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchStandings() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/standings/now`);
        if (!res.ok) throw new Error("Failed to load standings data");
        const data = (await res.json()) as StandingsResponse;
        setStandings(data.standings || []);
      } catch (err: any) {
        setError(err.message || "Could not fetch standings.");
      } finally {
        setLoading(false);
      }
    }
    fetchStandings();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const valA = a[sortKey] ?? 0;
      const valB = b[sortKey] ?? 0;
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      // Tie breakers
      if (b.points !== a.points) return b.points - a.points;
      if (b.regulationWins !== a.regulationWins) return b.regulationWins - a.regulationWins;
      return b.goalDifferential - a.goalDifferential;
    });
  }, [standings, sortKey, sortOrder]);

  const toggleExpand = (abbr: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(abbr)) next.delete(abbr); else next.add(abbr);
      return next;
    });
  };

  const renderMobileCards = (items: StandingItem[], title?: string, subtitle?: string, showPlayoffLineAfter?: number[]) => {
    return (
      <div className="standings-card mb-6">
        {title && (
          <div className="standings-card-header">
            <div>
              <h2 className="standings-card-title">{title}</h2>
              {subtitle && <span className="standings-card-subtitle">{subtitle}</span>}
            </div>
          </div>
        )}
        <div className="standings-mobile-list">
          {items.map((team, idx) => {
            const abbr = team.teamAbbrev?.default;
            const teamColor = TEAM_COLORS[abbr] || 'var(--accent-primary)';
            const isExpanded = expandedTeams.has(abbr);
            const isPlayoffDivider = showPlayoffLineAfter && showPlayoffLineAfter.includes(idx + 1);

            return (
              <div key={abbr || idx} className={`standings-mobile-card ${isPlayoffDivider ? 'border-playoff-cutoff' : ''}`}>
                <button
                  className="standings-mobile-card-header"
                  onClick={() => toggleExpand(abbr)}
                  aria-expanded={isExpanded}
                >
                  <span className="mobile-rank">{idx + 1}</span>
                  <img src={team.teamLogo} alt={team.teamName?.default} className="standings-team-logo" />
                  <span className="mobile-team-name">{team.teamName?.default}</span>
                  <span className="mobile-team-abbr">{abbr}</span>
                  {team.clinchIndicator && (
                    <span className="clinch-badge">{team.clinchIndicator}</span>
                  )}
                  <span className="mobile-record">{team.wins}-{team.losses}-{team.otLosses}</span>
                  <span className="mobile-pts" style={{ backgroundColor: teamColor }}>{team.points}<small> PTS</small></span>
                  <span className={`mobile-expand-icon ${isExpanded ? 'expanded' : ''}`}>›</span>
                </button>
                {isExpanded && (
                  <div className="standings-mobile-card-detail">
                    <div className="mobile-stat-grid">
                      <div className="mobile-stat"><span className="mobile-stat-label">GP</span><span className="mobile-stat-value">{team.gamesPlayed}</span></div>
                      <div className="mobile-stat"><span className="mobile-stat-label">P%</span><span className="mobile-stat-value">{(team.pointPctg || 0).toFixed(3)}</span></div>
                      <div className="mobile-stat"><span className="mobile-stat-label">RW</span><span className="mobile-stat-value">{team.regulationWins}</span></div>
                      <div className="mobile-stat"><span className="mobile-stat-label">GF</span><span className="mobile-stat-value">{team.goalFor}</span></div>
                      <div className="mobile-stat"><span className="mobile-stat-label">GA</span><span className="mobile-stat-value">{team.goalAgainst}</span></div>
                      <div className="mobile-stat">
                        <span className="mobile-stat-label">DIFF</span>
                        <span className="mobile-stat-value" style={{ color: team.goalDifferential > 0 ? 'var(--success)' : team.goalDifferential < 0 ? 'var(--error)' : 'inherit' }}>
                          {team.goalDifferential > 0 ? `+${team.goalDifferential}` : team.goalDifferential}
                        </span>
                      </div>
                      <div className="mobile-stat">
                        <span className="mobile-stat-label">STRK</span>
                        <span className="mobile-stat-value">
                          <span className={`streak-tag ${team.streakCode?.toLowerCase()}`}>{team.streakCode}{team.streakCount}</span>
                        </span>
                      </div>
                      <div className="mobile-stat"><span className="mobile-stat-label">L10</span><span className="mobile-stat-value">{team.l10Wins}-{team.l10Losses}-{team.l10OtLosses}</span></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTable = (items: StandingItem[], title?: string, subtitle?: string, showPlayoffLineAfter?: number[]) => {
    return (
      <>
        {/* Desktop table - hidden on mobile via CSS */}
        <div className="standings-card standings-desktop mb-6">
          {title && (
            <div className="standings-card-header">
              <div>
                <h2 className="standings-card-title">{title}</h2>
                {subtitle && <span className="standings-card-subtitle">{subtitle}</span>}
              </div>
            </div>
          )}
          <div className="standings-table-wrapper">
            <table className="standings-table">
              <thead>
                <tr>
                  <th className="th-team">Team</th>
                  <th className="th-num clickable" onClick={() => handleSort("gamesPlayed")}>
                    GP {sortKey === "gamesPlayed" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num clickable" onClick={() => handleSort("wins")}>
                    W {sortKey === "wins" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num">L</th>
                  <th className="th-num">OT</th>
                  <th className="th-num th-pts clickable" onClick={() => handleSort("points")}>
                    PTS {sortKey === "points" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num clickable" onClick={() => handleSort("pointPctg")}>
                    P% {sortKey === "pointPctg" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num clickable" onClick={() => handleSort("regulationWins")}>
                    RW {sortKey === "regulationWins" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num clickable" onClick={() => handleSort("goalFor")}>
                    GF {sortKey === "goalFor" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num">GA</th>
                  <th className="th-num clickable" onClick={() => handleSort("goalDifferential")}>
                    ± {sortKey === "goalDifferential" && (sortOrder === "desc" ? "↓" : "↑")}
                  </th>
                  <th className="th-num">STK</th>
                  <th className="th-num">L10</th>
                </tr>
              </thead>
              <tbody>
                {items.map((team, idx) => {
                  const teamColor = TEAM_COLORS[team.teamAbbrev?.default] || "var(--accent-primary)";
                  const isPlayoffDivider = showPlayoffLineAfter && showPlayoffLineAfter.includes(idx + 1);

                  return (
                    <tr key={team.teamAbbrev?.default || idx} className={`standings-row ${isPlayoffDivider ? "border-playoff-cutoff" : ""}`}>
                      <td className="td-team">
                        <div className="team-cell">
                          <img src={team.teamLogo} alt={team.teamName?.default} className="standings-team-logo" />
                          <span className="team-cell-name">{team.teamName?.default}</span>
                          <span className="team-cell-abbr">{team.teamAbbrev?.default}</span>
                          {team.clinchIndicator && (
                            <span className="clinch-badge" title={`Clinched ${team.clinchIndicator}`}>
                              {team.clinchIndicator}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="td-num">{team.gamesPlayed}</td>
                      <td className="td-num">{team.wins}</td>
                      <td className="td-num">{team.losses}</td>
                      <td className="td-num">{team.otLosses}</td>
                      <td className="td-num td-pts">
                        <span className="pts-pill" style={{ backgroundColor: teamColor }}>
                          {team.points}
                        </span>
                      </td>
                      <td className="td-num">{(team.pointPctg || 0).toFixed(3)}</td>
                      <td className="td-num">{team.regulationWins}</td>
                      <td className="td-num">{team.goalFor}</td>
                      <td className="td-num">{team.goalAgainst}</td>
                      <td className="td-num" style={{ color: team.goalDifferential > 0 ? "var(--success)" : team.goalDifferential < 0 ? "var(--error)" : "inherit" }}>
                        {team.goalDifferential > 0 ? `+${team.goalDifferential}` : team.goalDifferential}
                      </td>
                      <td className="td-num">
                        <span className={`streak-tag ${team.streakCode?.toLowerCase()}`}>
                          {team.streakCode}{team.streakCount}
                        </span>
                      </td>
                      <td className="td-num text-muted">
                        {team.l10Wins}-{team.l10Losses}-{team.l10OtLosses}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* Mobile cards - shown only on mobile via CSS */}
        <div className="standings-mobile">
          {renderMobileCards(items, title, subtitle, showPlayoffLineAfter)}
        </div>
      </>
    );
  };

  const renderContent = () => {
    if (viewMode === "league") {
      return renderTable(sortedStandings, "League Standings", "All 32 NHL Teams ranked");
    }

    if (viewMode === "conference") {
      return (
        <div className="standings-grid-2col">
          {CONFERENCE_ORDER.map(conf => {
            const confTeams = sortedStandings.filter(t => t.conferenceName === conf);
            return (
              <div key={conf}>
                {renderTable(confTeams, `${conf} Conference`, `Top 8 advance to playoffs`, [8])}
              </div>
            );
          })}
        </div>
      );
    }

    if (viewMode === "wildcard") {
      return (
        <div className="standings-wildcard">
          {CONFERENCE_ORDER.map(conf => {
            const confTeams = standings.filter(t => t.conferenceName === conf);
            
            // Group by division
            const divisions = Array.from(new Set(confTeams.map(t => t.divisionName)));
            const top3ByDiv: StandingItem[] = [];
            const remainingForWildcard: StandingItem[] = [];

            divisions.forEach(divName => {
              const divTeams = [...confTeams]
                .filter(t => t.divisionName === divName)
                .sort((a, b) => b.points - a.points || b.regulationWins - a.regulationWins);
              
              top3ByDiv.push(...divTeams.slice(0, 3));
              remainingForWildcard.push(...divTeams.slice(3));
            });

            // Sort remaining for wildcard
            remainingForWildcard.sort((a, b) => b.points - a.points || b.regulationWins - a.regulationWins);

            return (
              <div key={conf} className="wildcard-conference-block">
                <h2 className="wildcard-conference-title">
                  <Trophy size={18} className="text-accent" /> {conf} Conference Race
                </h2>
                <div className="standings-grid-2col">
                  {divisions.map(divName => {
                    const divLeaders = top3ByDiv.filter(t => t.divisionName === divName);
                    return (
                      <div key={divName}>
                        {renderTable(divLeaders, `${divName} Division Leaders`, "Top 3 automatic qualification")}
                      </div>
                    );
                  })}
                </div>
                <div className="wildcard-race-section">
                  {renderTable(remainingForWildcard, `${conf} Wild Card Race`, "Top 2 wildcard spots qualify for playoffs", [2])}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Default: Division View
    return (
      <div className="standings-grid-2col">
        {DIVISION_ORDER.map(divName => {
          const divTeams = sortedStandings.filter(t => t.divisionName === divName);
          return (
            <div key={divName}>
              {renderTable(divTeams, `${divName} Division`, undefined, [3])}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="standings-page">
      <div className="standings-header">
        <div>
          <h1 className="page-title">Standings</h1>
          <p className="text-secondary text-sm">Real-time NHL League, Conference & Division Standings</p>
        </div>

        <div className="conference-filter">
          <button
            className={`conf-filter-btn${viewMode === "division" ? " active" : ""}`}
            onClick={() => setViewMode("division")}
          >
            Division
          </button>
          <button
            className={`conf-filter-btn${viewMode === "wildcard" ? " active" : ""}`}
            onClick={() => setViewMode("wildcard")}
          >
            Wild Card
          </button>
          <button
            className={`conf-filter-btn${viewMode === "conference" ? " active" : ""}`}
            onClick={() => setViewMode("conference")}
          >
            Conference
          </button>
          <button
            className={`conf-filter-btn${viewMode === "league" ? " active" : ""}`}
            onClick={() => setViewMode("league")}
          >
            League
          </button>
        </div>
      </div>

      {loading && <div className="p-8 text-secondary">Loading standings data...</div>}
      {error && <div className="alert-error mt-6">{error}</div>}

      {!loading && !error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      )}
    </div>
  );
}
