import { useState, useEffect, useCallback, useRef } from "react";
import type { NHLGame } from "../types";
import { GameCard } from "../components/GameCard";
import { useNavigate } from "react-router-dom";
import { formatLocalDateString, shiftDate, todayDateString } from "../utils/helpers";
import { ChevronLeft, ChevronRight, Filter, Star, X } from "lucide-react";
import { NHL_TEAMS_METADATA, CONFERENCES } from "../utils/nhlDivisions";
import { useAuth } from "../context/AuthContext";

import { API_BASE } from "../utils/api";

interface GameDay {
  date: string;
  dayAbbrev: string;
  numberOfGames: number;
  games: NHLGame[];
}

export default function Schedule() {
  const navigate = useNavigate();
  const { favorites, isFavorite } = useAuth();

  const [currentDate, setCurrentDate] = useState<string>(() => {
    return sessionStorage.getItem("schedule_date") || todayDateString();
  });

  useEffect(() => {
    sessionStorage.setItem("schedule_date", currentDate);
  }, [currentDate]);
  const [scheduleWeek, setScheduleWeek] = useState<GameDay[]>([]);
  const [nextStartDate, setNextStartDate] = useState<string | null>(null);
  const [previousStartDate, setPreviousStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [gameTypeFilter, setGameTypeFilter] = useState<"ALL" | "1" | "2" | "3">("ALL");
  const [selectedConference, setSelectedConference] = useState<string>("ALL");
  const [selectedDivision, setSelectedDivision] = useState<string>("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);

  const [searchingNext, setSearchingNext] = useState<boolean>(false);

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

  const GAME_TYPE_FILTERS: Array<{ id: "ALL" | "1" | "2" | "3"; label: string }> = [
    { id: "ALL", label: "All Types" },
    { id: "2", label: "Regular Season" },
    { id: "1", label: "Preseason" },
    { id: "3", label: "Playoffs" },
  ];

  // Divisions that belong to each conference
  const CONF_DIVISIONS: Record<string, string[]> = {
    Eastern: ["Atlantic", "Metropolitan"],
    Western: ["Central", "Pacific"],
  };

  // Helper filter function for each game
  const matchesFilter = useCallback((
    game: NHLGame,
    typeFilter: "ALL" | "1" | "2" | "3" = gameTypeFilter,
    confFilter: string = selectedConference,
    divFilter: string = selectedDivision,
    favOnly: boolean = favoritesOnly
  ): boolean => {
    // 1. Game Type
    if (typeFilter !== "ALL" && String(game.gameType) !== typeFilter) {
      return false;
    }

    const awayAbbr = game.awayTeam?.abbrev;
    const homeAbbr = game.homeTeam?.abbrev;
    const awayMeta = awayAbbr ? NHL_TEAMS_METADATA[awayAbbr] : undefined;
    const homeMeta = homeAbbr ? NHL_TEAMS_METADATA[homeAbbr] : undefined;

    // 2. Favorites only
    if (favOnly) {
      if (!isFavorite(awayAbbr) && !isFavorite(homeAbbr)) {
        return false;
      }
    }

    // 3. Conference
    if (confFilter !== "ALL") {
      const matchAway = awayMeta?.conference === confFilter;
      const matchHome = homeMeta?.conference === confFilter;
      if (!matchAway && !matchHome) {
        return false;
      }
    }

    // 4. Division
    if (divFilter !== "ALL") {
      const matchAway = awayMeta?.division === divFilter;
      const matchHome = homeMeta?.division === divFilter;
      if (!matchAway && !matchHome) {
        return false;
      }
    }

    return true;
  }, [gameTypeFilter, selectedConference, selectedDivision, favoritesOnly, isFavorite]);

  const findNextMatchingWeek = useCallback(async (
    startDate: string,
    direction: "forward" | "backward" = "forward",
    typeFilter: "ALL" | "1" | "2" | "3" = gameTypeFilter,
    confFilter: string = selectedConference,
    divFilter: string = selectedDivision,
    favOnly: boolean = favoritesOnly,
    allowOpposite = true
  ): Promise<string | null> => {
    const searchDirection = async (start: string, dir: "forward" | "backward", maxAttempts = 35) => {
      let cursor: string | null = start;
      let attempts = 0;

      while (cursor && attempts < maxAttempts) {
        attempts++;
        try {
          const res = await fetch(`${API_BASE}/schedule/${cursor}`);
          if (!res.ok) break;
          const data = await res.json();
          const week: GameDay[] = data.gameWeek || [];

          const matchingDay = week.find((day) =>
            (day.games || []).some((g) =>
              matchesFilter(g, typeFilter, confFilter, divFilter, favOnly)
            )
          );

          if (matchingDay) {
            return matchingDay.date;
          }

          if (dir === "forward") {
            if (data.nextStartDate && data.nextStartDate > cursor) {
              cursor = data.nextStartDate;
            } else {
              cursor = shiftDate(cursor, 7);
            }
          } else {
            if (data.previousStartDate && data.previousStartDate < cursor) {
              cursor = data.previousStartDate;
            } else {
              cursor = shiftDate(cursor, -7);
            }
          }
        } catch {
          break;
        }
      }
      return null;
    };

    const primaryResult = await searchDirection(startDate, direction, 35);
    if (primaryResult) return primaryResult;

    if (allowOpposite) {
      const oppositeDir = direction === "forward" ? "backward" : "forward";
      return await searchDirection(startDate, oppositeDir, 35);
    }

    return null;
  }, [matchesFilter, gameTypeFilter, selectedConference, selectedDivision, favoritesOnly]);

  const handleGameTypeClick = async (newType: "ALL" | "1" | "2" | "3") => {
    setGameTypeFilter(newType);
    if (newType === "ALL") return;

    const hasMatch = scheduleWeek.some((day) =>
      (day.games || []).some((g) =>
        matchesFilter(g, newType, selectedConference, selectedDivision, favoritesOnly)
      )
    );

    if (!hasMatch) {
      setSearchingNext(true);
      const nextDate = await findNextMatchingWeek(
        currentDate,
        "forward",
        newType,
        selectedConference,
        selectedDivision,
        favoritesOnly,
        true
      );
      setSearchingNext(false);
      if (nextDate) {
        setCurrentDate(nextDate);
      }
    }
  };

  const handleConferenceClick = async (conf: string) => {
    if (selectedConference === conf) {
      // Toggle off — deselect both conference and division
      setSelectedConference("ALL");
      setSelectedDivision("ALL");
    } else {
      setSelectedConference(conf);
      let targetDiv = selectedDivision;
      if (selectedDivision !== "ALL" && !CONF_DIVISIONS[conf]?.includes(selectedDivision)) {
        targetDiv = "ALL";
        setSelectedDivision("ALL");
      }

      const hasMatch = scheduleWeek.some((day) =>
        (day.games || []).some((g) =>
          matchesFilter(g, gameTypeFilter, conf, targetDiv, favoritesOnly)
        )
      );

      if (!hasMatch) {
        setSearchingNext(true);
        const nextDate = await findNextMatchingWeek(
          currentDate,
          "forward",
          gameTypeFilter,
          conf,
          targetDiv,
          favoritesOnly,
          true
        );
        setSearchingNext(false);
        if (nextDate) {
          setCurrentDate(nextDate);
        }
      }
    }
  };

  const handleDivisionClick = async (div: string) => {
    const newDiv = selectedDivision === div ? "ALL" : div;
    setSelectedDivision(newDiv);

    if (newDiv !== "ALL") {
      const hasMatch = scheduleWeek.some((day) =>
        (day.games || []).some((g) =>
          matchesFilter(g, gameTypeFilter, selectedConference, newDiv, favoritesOnly)
        )
      );

      if (!hasMatch) {
        setSearchingNext(true);
        const nextDate = await findNextMatchingWeek(
          currentDate,
          "forward",
          gameTypeFilter,
          selectedConference,
          newDiv,
          favoritesOnly,
          true
        );
        setSearchingNext(false);
        if (nextDate) {
          setCurrentDate(nextDate);
        }
      }
    }
  };

  const handleFavoritesToggle = async () => {
    const newFavs = !favoritesOnly;
    setFavoritesOnly(newFavs);

    if (newFavs) {
      const hasMatch = scheduleWeek.some((day) =>
        (day.games || []).some((g) =>
          matchesFilter(g, gameTypeFilter, selectedConference, selectedDivision, true)
        )
      );

      if (!hasMatch) {
        setSearchingNext(true);
        const nextDate = await findNextMatchingWeek(
          currentDate,
          "forward",
          gameTypeFilter,
          selectedConference,
          selectedDivision,
          true,
          true
        );
        setSearchingNext(false);
        if (nextDate) {
          setCurrentDate(nextDate);
        }
      }
    }
  };

  const handlePrevWeek = async () => {
    navDirectionRef.current = "backward";
    if (gameTypeFilter !== "ALL" || selectedConference !== "ALL" || selectedDivision !== "ALL" || favoritesOnly) {
      setSearchingNext(true);
      const targetStart = previousStartDate && previousStartDate < currentDate
        ? previousStartDate
        : shiftDate(currentDate, -7);
      const prevDate = await findNextMatchingWeek(targetStart, "backward", gameTypeFilter, selectedConference, selectedDivision, favoritesOnly, false);
      setSearchingNext(false);
      if (prevDate) {
        setCurrentDate(prevDate);
        return;
      }
    }

    if (previousStartDate && previousStartDate < currentDate) {
      setCurrentDate(previousStartDate);
    } else {
      setCurrentDate(shiftDate(currentDate, -7));
    }
  };

  const handleNextWeek = async () => {
    navDirectionRef.current = "forward";
    if (gameTypeFilter !== "ALL" || selectedConference !== "ALL" || selectedDivision !== "ALL" || favoritesOnly) {
      setSearchingNext(true);
      const targetStart = nextStartDate && nextStartDate > currentDate
        ? nextStartDate
        : shiftDate(currentDate, 7);
      const nextDate = await findNextMatchingWeek(targetStart, "forward", gameTypeFilter, selectedConference, selectedDivision, favoritesOnly, false);
      setSearchingNext(false);
      if (nextDate) {
        setCurrentDate(nextDate);
        return;
      }
    }

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

  const handleJumpToNextMatching = async () => {
    setSearchingNext(true);
    const nextDate = await findNextMatchingWeek(
      nextStartDate || shiftDate(currentDate, 7),
      "forward",
      gameTypeFilter,
      selectedConference,
      selectedDivision,
      favoritesOnly,
      true
    );
    setSearchingNext(false);
    if (nextDate) {
      setCurrentDate(nextDate);
    }
  };

  const daysWithFilteredGames = scheduleWeek.map((day) => ({
    ...day,
    filteredGames: (day.games || []).filter((g) => matchesFilter(g)),
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
    favoritesOnly;

  const resetFilters = () => {
    setGameTypeFilter("ALL");
    setSelectedConference("ALL");
    setSelectedDivision("ALL");
    setFavoritesOnly(false);
  };

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
                  onClick={() => handleGameTypeClick(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Followed Teams quick toggle */}
            {favorites.length > 0 && (
              <button
                className={`filter-btn-fav ${favoritesOnly ? "active" : ""}`}
                onClick={handleFavoritesToggle}
                title="Filter to my followed teams"
              >
                <Star size={14} className={favoritesOnly ? "fill-amber text-amber" : ""} />
                <span>My Teams ({favorites.length})</span>
              </button>
            )}
          </div>

          {/* Conference / Division two-step visual picker */}
          <div className="conf-div-picker">
            {/* Step 1: Conference */}
            <div className="cdp-step">
              <div className="cdp-options">
                {CONFERENCES.map((conf) => (
                  <button
                    key={conf}
                    className={`cdp-card ${selectedConference === conf ? "active" : ""}`}
                    onClick={() => handleConferenceClick(conf)}
                  >
                    <span className="cdp-card-name">{conf}</span>
                    <span className="cdp-card-sub">
                      {CONF_DIVISIONS[conf].join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Division — only revealed after a conference is selected */}
            {selectedConference !== "ALL" && (
              <div className="cdp-step cdp-step--division">
                <div className="cdp-options">
                  {CONF_DIVISIONS[selectedConference].map((div) => (
                    <button
                      key={div}
                      className={`cdp-card cdp-card--div ${selectedDivision === div ? "active" : ""}`}
                      onClick={() => handleDivisionClick(div)}
                    >
                      <span className="cdp-card-name">{div}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <div className="filter-reset-row">
              <button className="filter-reset-btn" onClick={resetFilters}>
                <X size={14} />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {(loading || searchingNext) && (
        <div className="p-8 text-secondary">
          {searchingNext ? "Finding next available games..." : "Loading schedule..."}
        </div>
      )}
      {error && <div className="alert-error mt-8">{error}</div>}

      {!loading && !searchingNext && !error && (
        <div className="schedule-week">
          {totalFilteredGamesInWeek === 0 ? (
            <div className="no-games">
              <Filter size={32} className="text-secondary mb-2" />
              <p>No games found matching your active filter criteria for this week.</p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="btn-primary"
                  onClick={handleJumpToNextMatching}
                  disabled={searchingNext}
                >
                  {searchingNext ? "Finding next game…" : "Jump to Next Available Game"}
                </button>
                {hasActiveFilters && (
                  <button className="btn-secondary" onClick={resetFilters}>
                    Clear Filters
                  </button>
                )}
              </div>
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
