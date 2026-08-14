import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Star, Flame, Trophy, Calendar, Sparkles } from "lucide-react";
import { NHL_TEAMS_METADATA } from "../utils/nhlDivisions";
import { formatLocalDateString } from "../utils/helpers";
import type { StandingItem } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

interface TailoredFeedData {
  favorites: string[];
  upcomingGames: any[];
  recentGames: any[];
  standings: StandingItem[];
}

export function FollowedTeamsWidget({ onSelectGame }: { onSelectGame?: (game: any, date: string) => void }) {
  const { user, favorites, toggleFavorite, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const [feedData, setFeedData] = useState<TailoredFeedData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchFeed = useCallback(async () => {
    if (favorites.length === 0) {
      setFeedData(null);
      return;
    }
    setLoading(true);
    try {
      // If user is authenticated, we can fetch the server-tailored feed
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

      // Fallback or guest user with local favorites: fetch standings and schedule
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
          <button className="btn-secondary text-sm" onClick={() => navigate("/teams")}>
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
    <div className="followed-hub">
      <div className="followed-hub-header">
        <div className="followed-hub-title-group">
          <Star className="text-amber fill-amber" size={18} />
          <h2 className="followed-hub-title">
            {user ? `${user.username}'s Followed Teams` : "Your Followed Teams"}
          </h2>
          <span className="badge-count">{favorites.length}</span>
        </div>

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
                  onClick={() => toggleFavorite(abbr)}
                  title={`Unfollow ${abbr}`}
                >
                  &times;
                </button>
              </span>
            );
          })}
          <button className="add-team-chip" onClick={() => navigate("/teams")}>
            + Add Team
          </button>
        </div>
      </div>

      {loading && <div className="p-4 text-xs text-secondary">Updating feed for followed teams...</div>}

      {feedData && (
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
                          className="w-4 h-4 object-contain"
                        />
                        <span className="text-xs font-semibold">{game.awayTeam?.abbrev}</span>
                      </div>
                      <span className="text-xs text-secondary">@</span>
                      <div className="followed-team-row">
                        <img
                          src={`https://assets.nhle.com/logos/nhl/svg/${game.homeTeam?.abbrev}_light.svg`}
                          alt={game.homeTeam?.abbrev}
                          className="w-4 h-4 object-contain"
                        />
                        <span className="text-xs font-semibold">{game.homeTeam?.abbrev}</span>
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
                        <span className="text-xs text-secondary">-</span>
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
                feedData.standings.map((team) => (
                  <div key={team.teamAbbrev?.default} className="followed-standing-row">
                    <div className="flex items-center gap-2">
                      <img src={team.teamLogo} alt="" className="w-4 h-4 object-contain" />
                      <span className="text-xs font-semibold">{team.teamCommonName?.default || team.teamAbbrev?.default}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-secondary font-mono">{team.wins}-{team.losses}-{team.otLosses}</span>
                      <span className="font-bold font-mono text-primary">{team.points} PTS</span>
                      <span className="text-xs text-secondary">({team.divisionAbbrev})</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
