import { useState, useEffect } from "react";
import type { NHLGame } from "../types";
import { GameCard } from "../components/GameCard";
import { useNavigate } from "react-router-dom";

interface GameDay {
  date: string;
  dayAbbrev: string;
  numberOfGames: number;
  games: NHLGame[];
}

export default function Schedule() {
  const navigate = useNavigate();
  const [scheduleWeek, setScheduleWeek] = useState<GameDay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSchedule() {
      try {
        const res = await fetch("http://127.0.0.1:8000/schedule-week/now");
        if (!res.ok) throw new Error("Failed to load schedule");
        const data = await res.json();
        setScheduleWeek(data.gameWeek || []);
      } catch (err) {
        setError("Could not load schedule from NHL API.");
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
  }, []);

  if (loading) return <div className="p-8 text-secondary">Loading schedule...</div>;
  if (error) return <div className="alert-error mt-8">{error}</div>;

  return (
    <div className="schedule-page">
      <h1 className="page-title mb-8">Upcoming Schedule</h1>
      
      <div className="schedule-week">
        {scheduleWeek.map((day) => (
          <div key={day.date} className="schedule-day-section">
            <h2 className="day-header">
              {new Date(day.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              <span className="game-count">
                {day.numberOfGames} game{day.numberOfGames !== 1 ? 's' : ''}
              </span>
            </h2>
            
            {day.games && day.games.length > 0 ? (
              <div className="game-cards-container">
                {day.games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    selected={false}
                    onSelect={() => navigate("/", { state: { selectedGame: game, selectedDate: day.date } })}
                  />
                ))}
              </div>
            ) : (
              <div className="no-games">No games scheduled</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
