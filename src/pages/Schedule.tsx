import { useState, useEffect, useCallback, useRef } from "react";
import type { NHLGame } from "../types";
import { GameCard } from "../components/GameCard";
import { useNavigate } from "react-router-dom";
import { formatLocalDateString, shiftDate, todayDateString } from "../utils/helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface GameDay {
  date: string;
  dayAbbrev: string;
  numberOfGames: number;
  games: NHLGame[];
}

export default function Schedule() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState<string>(todayDateString());
  const [scheduleWeek, setScheduleWeek] = useState<GameDay[]>([]);
  const [nextStartDate, setNextStartDate] = useState<string | null>(null);
  const [previousStartDate, setPreviousStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [gameTypeFilter, setGameTypeFilter] = useState<"ALL" | "1" | "2" | "3">("ALL");

  const navDirectionRef = useRef<"forward" | "backward">("forward");

  const fetchSchedule = useCallback(async (dateStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/schedule/${dateStr}`);
      if (!res.ok) throw new Error("Failed to load schedule");
      const data = await res.json();
      
      const week: GameDay[] = data.gameWeek || [];
      const nextStart = data.nextStartDate || null;
      const prevStart = data.previousStartDate || null;

      setNextStartDate(nextStart);
      setPreviousStartDate(prevStart);

      // Check total games in this week across all days
      const totalGamesInWeek = week.reduce(
        (sum, d) => sum + (d.numberOfGames || (d.games ? d.games.length : 0)), 
        0
      );

      // If week is completely empty (e.g. offseason or gap week), auto-skip to closest week with games
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
    } catch (err) {
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
    { id: "ALL", label: "All Games" },
    { id: "2", label: "Regular Season" },
    { id: "1", label: "Preseason" },
    { id: "3", label: "Playoffs" },
  ];

  const daysWithFilteredGames = scheduleWeek.map(day => ({
    ...day,
    filteredGames: (day.games || []).filter(
      game => gameTypeFilter === "ALL" || String(game.gameType) === gameTypeFilter
    )
  }));

  const totalFilteredGamesInWeek = daysWithFilteredGames.reduce(
    (sum, day) => sum + day.filteredGames.length, 0
  );

  const weekRangeLabel = scheduleWeek.length > 0
    ? `${formatLocalDateString(scheduleWeek[0].date, { month: 'short', day: 'numeric' })} – ${formatLocalDateString(scheduleWeek[scheduleWeek.length - 1].date, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : "";

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

        <div className="conference-filter">
          {GAME_TYPE_FILTERS.map(f => (
            <button
              key={f.id}
              className={`conf-filter-btn${gameTypeFilter === f.id ? " active" : ""}`}
              onClick={() => setGameTypeFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="p-8 text-secondary">Loading schedule...</div>}
      {error && <div className="alert-error mt-8">{error}</div>}

      {!loading && !error && (
        <div className="schedule-week">
          {totalFilteredGamesInWeek === 0 ? (
            <div className="no-games">
              {gameTypeFilter === "ALL" 
                ? "No games scheduled for this week" 
                : `No ${GAME_TYPE_FILTERS.find(f => f.id === gameTypeFilter)?.label.toLowerCase()} scheduled for this week`}
            </div>
          ) : (
            daysWithFilteredGames
              .filter(day => day.filteredGames.length > 0)
              .map((day) => (
                <div key={day.date} className="schedule-day-section">
                  <h2 className="day-header">
                    {formatLocalDateString(day.date)}
                    <span className="game-count">
                      {day.filteredGames.length} game{day.filteredGames.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
                  
                  <div className="game-cards-container">
                    {day.filteredGames.map((game) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        selected={false}
                        onSelect={() => navigate("/", { state: { selectedGame: game, selectedDate: day.date } })}
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


