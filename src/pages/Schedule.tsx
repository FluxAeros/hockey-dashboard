import { useState, useEffect, useCallback, useRef } from "react";
import type { NHLGame } from "../types";
import { GameCard } from "../components/GameCard";
import { useNavigate } from "react-router-dom";
import { formatLocalDateString, shiftDate, todayDateString } from "../utils/helpers";
import { ChevronLeft, ChevronRight, Filter, Star, X } from "lucide-react";
import { NHL_TEAMS_METADATA, CONFERENCES, DIVISIONS } from "../utils/nhlDivisions";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

interface GameDay {
  date: string;
  dayAbbrev: string;
  numberOfGames: number;
  games: NHLGame[];
}

export default function Schedule() {
  const navigate = useNavigate();
  const { favorites, isFavorite } = useAuth();

  const [currentDate, setCurrentDate] = useState<string>(todayDateString());
  const [scheduleWeek, setScheduleWeek] = useState<GameDay[]>([]);
  const [nextStartDate, setNextStartDate] = useState<string | null>(null);
  const [previousStartDate, setPreviousStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [gameTypeFilter, setGameTypeFilter] = useState<"ALL" | "1" | "2" | "3">("ALL");
  const [selectedConference, setSelectedConference] = useState<string>("ALL");
  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");
  const [selectedTeam, setSelectedTeam] = useState<string>("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

  const navDirectionRef = useRef<"forward" | "backward">("forward");

  const fetchSchedule = useCallback(async (dateStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/schedule/${dateStr}`);
      if (!res.ok) throw new Error("Failed to load schedule");
      const data = await res.json();
      
      const week: GameDay[] = data.gameWeek || [];
      const nextStart = data.nextStartDate || null;
      const prevStart = data.previousStartDate || null;

      setNextStartDate(nextStart);
      setPreviousStartDate(prevStart);

      const totalGamesInWeek = week.reduce(
        (sum, d) => sum + (d.numberOfGames || (d.games ? d.games.length : 0)), 
        0
      );

      if (totalGamesInWeek === 0) {
        if (navDirectionRef.current === "backward" && prevStart && prevStart < dateStr) {
          setCurrentDate(prevStart);
          return;
        } else if (nextStart && nextStart > dateStr) {
          setCurrentDate(nextStart);
          return;
        }
      }

      setScheduleWeek(week);
    } catch {
      setError("Could not load schedule from NHL API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule(currentDate);
  }, [currentDate, fetchSchedule]);

  const handlePrevWeek = () => {
    navDirectionRef.current = "backward";
    if (previousStartDate && previousStartDate < currentDate) {
      setCurrentDate(previousStartDate);
    } else {
      setCurrentDate(shiftDate(currentDate, -7));
    }
  };

  const handleNextWeek = () => {
    navDirectionRef.current = "forward";
    if (nextStartDate && nextStartDate > currentDate) {
      setCurrentDate(nextStartDate);
    } else {
      setCurrentDate(shiftDate(currentDate, 7));
    }
  };

  const handleToday = () => {
    navDirectionRef.current = "forward";
    setCurrentDate(todayDateString());
  };

  const GAME_TYPE_FILTERS: Array<{ id: "ALL" | "1" | "2" | "3"; label: string }> = [
    { id: "ALL", label: "All Types" },
    { id: "2", label: "Regular Season" },
    { id: "1", label: "Preseason" },
    { id: "3", label: "Playoffs" },
  ];

  // Helper filter function for each game
  const matchesFilter = (game: NHLGame): boolean => {
    // 1. Game Type
    if (gameTypeFilter !== "ALL" && String(game.gameType) !== gameTypeFilter) {
      return false;
    }

    const awayAbbr = game.awayTeam?.abbrev;
    const homeAbbr = game.homeTeam?.abbrev;
    const awayMeta = awayAbbr ? NHL_TEAMS_METADATA[awayAbbr] : undefined;
    const homeMeta = homeAbbr ? NHL_TEAMS_METADATA[homeAbbr] : undefined;

    // 2. Favorites only
    if (favoritesOnly) {
      if (!isFavorite(awayAbbr) && !isFavorite(homeAbbr)) {
        return false;
      }
    }

    // 3. Specific Team
    if (selectedTeam !== "ALL") {
      if (awayAbbr !== selectedTeam && homeAbbr !== selectedTeam) {
        return false;
      }
    }

    // 4. Conference
    if (selectedConference !== "ALL") {
      const matchAway = awayMeta?.conference === selectedConference;
      const matchHome = homeMeta?.conference === selectedConference;
      if (!matchAway && !matchHome) {
        return false;
      }
    }

    // 5. Division
    if (selectedDivision !== "ALL") {
      const matchAway = awayMeta?.division === selectedDivision;
      const matchHome = homeMeta?.division === selectedDivision;
      if (!matchAway && !matchHome) {
        return false;
      }
    }

    return true;
  };

  const daysWithFilteredGames = scheduleWeek.map((day) => ({
    ...day,
    filteredGames: (day.games || []).filter(matchesFilter),
  }));

  const totalFilteredGamesInWeek = daysWithFilteredGames.reduce(
    (sum, day) => sum + day.filteredGames.length,
    0
  );

  const weekRangeLabel =
    scheduleWeek.length > 0
      ? `${formatLocalDateString(scheduleWeek[0].date, { month: "short", day: "numeric" })} – ${formatLocalDateString(
          scheduleWeek[scheduleWeek.length - 1].date,
          { month: "short", day: "numeric", year: "numeric" }
        )}`
      : "";

  const hasActiveFilters =
    gameTypeFilter !== "ALL" ||
    selectedConference !== "ALL" ||
    selectedDivision !== "ALL" ||
    selectedTeam !== "ALL" ||
    favoritesOnly;

  const resetFilters = () => {
    setGameTypeFilter("ALL");
    setSelectedConference("ALL");
    setSelectedDivision("ALL");
    setSelectedTeam("ALL");
    setFavoritesOnly(false);
  };

  const sortedTeamList = Object.values(NHL_TEAMS_METADATA).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <div className="schedule-page">
      <div className="schedule-header">
        <div className="schedule-title-group">
          <div>
            <h1 className="page-title">Schedule</h1>
            {weekRangeLabel && <span className="schedule-week-range">{weekRangeLabel}</span>}
          </div>
          <div className="week-nav-controls">
            <button className="date-nav-arrow" onClick={handlePrevWeek} title="Previous Game Week">
              <ChevronLeft size={18} />
            </button>
            <button className="btn-secondary" onClick={handleToday}>
              Current Week
            </button>
            <button className="date-nav-arrow" onClick={handleNextWeek} title="Next Game Week">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Enhanced Multi-Filter Control Bar */}
        <div className="schedule-filter-bar">
          <div className="filter-row">
            {/* Game Type Filter */}
            <div className="conference-filter">
              {GAME_TYPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`conf-filter-btn ${gameTypeFilter === f.id ? "active" : ""}`}
                  onClick={() => setGameTypeFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Followed Teams quick toggle */}
            {favorites.length > 0 && (
              <button
                className={`filter-btn-fav ${favoritesOnly ? "active" : ""}`}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                title="Filter to my followed teams"
              >
                <Star size={14} className={favoritesOnly ? "fill-amber text-amber" : ""} />
                <span>My Teams ({favorites.length})</span>
              </button>
            )}
          </div>

          <div className="filter-dropdowns-row">
            {/* Conference Selector */}
            <div className="filter-dropdown-group">
              <label htmlFor="conf-select">Conference:</label>
              <select
                id="conf-select"
                className="filter-select"
                value={selectedConference}
                onChange={(e) => {
                  setSelectedConference(e.target.value);
                  if (e.target.value !== "ALL" && selectedDivision !== "ALL") {
                    // Reset division if it doesn't belong to selected conference
                    const div = selectedDivision;
                    if (
                      (e.target.value === "Eastern" && (div === "Central" || div === "Pacific")) ||
                      (e.target.value === "Western" && (div === "Atlantic" || div === "Metropolitan"))
                    ) {
                      setSelectedDivision("ALL");
                    }
                  }
                }}
              >
                <option value="ALL">All Conferences</option>
                {CONFERENCES.map((c) => (
                  <option key={c} value={c}>
                    {c} Conference
                  </option>
                ))}
              </select>
            </div>

            {/* Division Selector */}
            <div className="filter-dropdown-group">
              <label htmlFor="div-select">Division:</label>
              <select
                id="div-select"
                className="filter-select"
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
              >
                <option value="ALL">All Divisions</option>
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} Division
                  </option>
                ))}
              </select>
            </div>

            {/* Team Dropdown Selector */}
            <div className="filter-dropdown-group">
              <label htmlFor="team-select">Team:</label>
              <select
                id="team-select"
                className="filter-select"
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="ALL">All Teams</option>
                {sortedTeamList.map((t) => (
                  <option key={t.abbrev} value={t.abbrev}>
                    {t.name} ({t.abbrev})
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button className="filter-reset-btn" onClick={resetFilters}>
                <X size={14} />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="p-8 text-secondary">Loading schedule...</div>}
      {error && <div className="alert-error mt-8">{error}</div>}

      {!loading && !error && (
        <div className="schedule-week">
          {totalFilteredGamesInWeek === 0 ? (
            <div className="no-games">
              <Filter size={32} className="text-secondary mb-2" />
              <p>No games found matching your active filter criteria.</p>
              {hasActiveFilters && (
                <button className="btn-secondary mt-3" onClick={resetFilters}>
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            daysWithFilteredGames
              .filter((day) => day.filteredGames.length > 0)
              .map((day) => (
                <div key={day.date} className="schedule-day-section">
                  <h2 className="day-header">
                    {formatLocalDateString(day.date)}
                    <span className="game-count">
                      {day.filteredGames.length} game{day.filteredGames.length !== 1 ? "s" : ""}
                    </span>
                  </h2>

                  <div className="game-cards-container">
                    {day.filteredGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        selected={false}
                        onSelect={() =>
                          navigate("/", { state: { selectedGame: game, selectedDate: day.date } })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
