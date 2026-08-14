import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Star, Flame, Trophy, Calendar, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { NHL_TEAMS_METADATA } from "../utils/nhlDivisions";
import { formatLocalDateString } from "../utils/helpers";
import { API_BASE } from "../utils/api";
import type { StandingItem } from "../types";

interface TailoredFeedData {
  favorites: string[];
  upcomingGames: any[];
  recentGames: any[];
  standings: StandingItem[];
}

interface FollowedTeamsWidgetProps {
  onSelectGame?: (game: any, date: string) => void;
  isGameSelected?: boolean;
}

export function FollowedTeamsWidget({ onSelectGame, isGameSelected = false }: FollowedTeamsWidgetProps) {
  const { user, favorites, toggleFavorite, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const [feedData, setFeedData] = useState<TailoredFeedData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isManuallyExpanded, setIsManuallyExpanded] = useState<boolean | null>(null);

  // Auto-collapse when a game is selected, unless user manually toggled it
  const isCollapsed = isManuallyExpanded !== null ? !isManuallyExpanded : isGameSelected;

  const fetchFeed = useCallback(async () => {
    if (favorites.length === 0) {
      setFeedData(null);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("chelstatz_jwt_token");
      if (token) {
        const res = await fetch(`${API_BASE}/user/tailored-feed`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFeedData(data);
          return;
        }
      }

      const [standingsRes, scheduleRes] = await Promise.all([
        fetch(`${API_BASE}/standings/now`),
        fetch(`${API_BASE}/schedule-week/now`)
      ]);

      const favSet = new Set(favorites);
      let favStandings: StandingItem[] = [];
      let upcoming: any[] = [];
      let recent: any[] = [];

      if (standingsRes.ok) {
        const sData = await standingsRes.json();
        favStandings = (sData.standings || []).filter((s: StandingItem) =>
          favSet.has(s.teamAbbrev?.default)
        );
      }

      if (scheduleRes.ok) {
        const schData = await scheduleRes.json();
        const gameWeek = schData.gameWeek || [];
        for (const day of gameWeek) {
          for (const game of day.games || []) {
            const away = game.awayTeam?.abbrev;
            const home = game.homeTeam?.abbrev;
            if (favSet.has(away) || favSet.has(home)) {
              if (game.gameState === "FINAL" || game.gameState === "OFF") {
                recent.push({ ...game, gameDate: day.date });
              } else {
                upcoming.push({ ...game, gameDate: day.date });
              }
            }
          }
        }
      }

      setFeedData({
        favorites,
        upcomingGames: upcoming.slice(0, 6),
        recentGames: recent.slice(-6),
        standings: favStandings
      });
    } catch (e) {
      console.error("Error fetching followed teams feed:", e);
    } finally {
      setLoading(false);
    }
  }, [favorites]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  if (favorites.length === 0) {
    if (isGameSelected) return null; // Don't show empty promo if user is actively watching a game

    return (
      <div className="followed-hub-empty">
        <div className="followed-hub-empty-content">
          <div className="followed-hub-icon">
            <Sparkles size={24} className="text-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-primary">Customize Your Hockey Hub</h3>
            <p className="text-sm text-secondary">
              Pick your favorite NHL teams to unlock a personalized live tracker, upcoming match alerts, and xG momentum stats.
            </p>
          </div>
        </div>
        <div className="followed-hub-empty-actions">
          <button className="btn-secondary text-sm" onClick={() => navigate("/teams", { state: { fromAddFollowed: true } })}>
            Browse Teams
          </button>
          {!user && (
            <button className="btn-primary text-sm" onClick={() => openAuthModal("register")}>
              Create Account
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`followed-hub ${isCollapsed ? 'followed-hub-collapsed' : ''}`}>
      <div className="followed-hub-header">
        <div className="followed-hub-title-group" onClick={() => setIsManuallyExpanded(isCollapsed)} role="button" tabIndex={0}>
          <Star className="text-amber fill-amber" size={18} />
          <h2 className="followed-hub-title">
            {user ? `${user.username}'s Teams` : "Your Followed Teams"}
          </h2>
          <span className="badge-count">{favorites.length}</span>
        </div>

        <div className="followed-hub-chips-wrapper">
          <div className="followed-hub-chips">
            {favorites.map((abbr) => {
              const meta = NHL_TEAMS_METADATA[abbr];
              return (
                <span key={abbr} className="followed-chip" title={meta?.name || abbr}>
                  <img
                    src={`https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`}
                    alt={abbr}
                    className="followed-chip-logo"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span className="font-semibold">{abbr}</span>
                  <button
                    className="chip-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(abbr);
                    }}
                    title={`Unfollow ${abbr}`}
                  >
                    &times;
                  </button>
                </span>
              );
            })}
            <button className="add-team-chip" onClick={() => navigate("/teams", { state: { fromAddFollowed: true } })}>
              + Add Team
            </button>
          </div>

          <button
            className="followed-hub-toggle-btn"
            onClick={() => setIsManuallyExpanded(isCollapsed)}
            title={isCollapsed ? "Expand Hub" : "Collapse Hub"}
            aria-label={isCollapsed ? "Expand Hub" : "Collapse Hub"}
          >
            {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>

      {!isCollapsed && loading && <div className="p-3 text-xs text-secondary">Updating feed for followed teams...</div>}

      {!isCollapsed && feedData && (
        <div className="followed-hub-grid">
          {/* Upcoming Games Column */}
          <div className="followed-card">
            <div className="followed-card-header">
              <Calendar size={15} />
              <span>Upcoming Matchups</span>
            </div>
            <div className="followed-games-list">
              {feedData.upcomingGames.length === 0 ? (
                <div className="text-xs text-secondary p-3">No upcoming games scheduled this week.</div>
              ) : (
                feedData.upcomingGames.map((game) => (
                  <div
                    key={game.id}
                    className="followed-game-item"
                    onClick={() => {
                      if (onSelectGame) {
                        onSelectGame(game, game.gameDate);
                      } else {
                        navigate("/", { state: { selectedGame: game, selectedDate: game.gameDate } });
                      }
                    }}
                  >
                    <div className="followed-game-teams">
                      <div className="followed-team-row">
                        <img
                          src={`https://assets.nhle.com/logos/nhl/svg/${game.awayTeam?.abbrev}_light.svg`}
                          alt={game.awayTeam?.abbrev}
                          className="followed-game-team-logo"
                        />
                        <span className="followed-game-team-abbr">{game.awayTeam?.abbrev}</span>
                      </div>
                      <span className="followed-game-at">@</span>
                      <div className="followed-team-row">
                        <img
                          src={`https://assets.nhle.com/logos/nhl/svg/${game.homeTeam?.abbrev}_light.svg`}
                          alt={game.homeTeam?.abbrev}
                          className="followed-game-team-logo"
                        />
                        <span className="followed-game-team-abbr">{game.homeTeam?.abbrev}</span>
                      </div>
                    </div>
                    <div className="followed-game-meta">
                      <span className="text-xs text-secondary">{formatLocalDateString(game.gameDate, { month: 'numeric', day: 'numeric' })}</span>
                      <span className="game-status-tag">{game.gameState === "LIVE" ? "LIVE" : "FUT"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Results Column */}
          <div className="followed-card">
            <div className="followed-card-header">
              <Flame size={15} />
              <span>Recent Results</span>
            </div>
            <div className="followed-games-list">
              {feedData.recentGames.length === 0 ? (
                <div className="text-xs text-secondary p-3">No completed games yet this week.</div>
              ) : (
                feedData.recentGames.map((game) => {
                  const awayFav = favorites.includes(game.awayTeam?.abbrev);
                  const homeFav = favorites.includes(game.homeTeam?.abbrev);
                  const homeScore = game.homeTeam?.score ?? 0;
                  const awayScore = game.awayTeam?.score ?? 0;

                  return (
                    <div
                      key={game.id}
                      className="followed-game-item"
                      onClick={() => {
                        if (onSelectGame) {
                          onSelectGame(game, game.gameDate);
                        } else {
                          navigate("/", { state: { selectedGame: game, selectedDate: game.gameDate } });
                        }
                      }}
                    >
                      <div className="followed-game-teams">
                        <span className={`text-xs ${awayFav ? "font-bold text-accent" : "text-secondary"}`}>
                          {game.awayTeam?.abbrev} {awayScore}
                        </span>
                        <span className="followed-game-hyphen">-</span>
                        <span className={`text-xs ${homeFav ? "font-bold text-accent" : "text-secondary"}`}>
                          {game.homeTeam?.abbrev} {homeScore}
                        </span>
                      </div>
                      <div className="followed-game-meta">
                        <span className="text-xs text-secondary">{formatLocalDateString(game.gameDate, { month: 'numeric', day: 'numeric' })}</span>
                        <span className="badge-final">FINAL</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Standings Snapshot */}
          <div className="followed-card">
            <div className="followed-card-header">
              <Trophy size={15} />
              <span>Standings Snapshot</span>
            </div>
            <div className="followed-standings-list">
              {feedData.standings.length === 0 ? (
                <div className="text-xs text-secondary p-3">Loading standings...</div>
              ) : (
                feedData.standings.map((team) => {
                  const abbr = team.teamAbbrev?.default || "";
                  const commonName = team.teamCommonName?.default || abbr;
                  return (
                    <div key={abbr} className="followed-standing-row">
                      <div className="followed-standing-team-info">
                        <img src={team.teamLogo} alt={abbr} className="followed-standing-logo" />
                        <div className="followed-standing-names">
                          <span className="followed-standing-abbr">{abbr}</span>
                          <span className="followed-standing-fullname">{commonName}</span>
                        </div>
                      </div>
                      <div className="followed-standing-stats">
                        <span className="standing-record">{team.wins}-{team.losses}-{team.otLosses}</span>
                        <span className="standing-pts">{team.points} <span className="standing-pts-label">PTS</span></span>
                        <span className="standing-div">({team.divisionAbbrev})</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
