import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NHLGame, Shot, MatchupsResponse, GameStats } from "../types";
import { todayDateString, shiftDate } from "../utils/helpers";
import { GameCard } from "../components/GameCard";
import { HockeyRink } from "../components/HockeyRink";
import { MatchupBoard } from "../components/MatchupBoard";
import { Scoreboard } from "../components/Scoreboard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatePicker } from "../components/DatePicker";

const API_BASE = "http://127.0.0.1:8000";
const REFRESH_INTERVAL = 30000;

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [selectedDate, setSelectedDate] = useState<string>(
    location.state?.selectedDate || todayDateString()
  );
  const [scheduleGames, setScheduleGames] = useState<NHLGame[]>([]);
  const [scheduleWeek, setScheduleWeek] = useState<any[]>([]);
  const [nextStartDate, setNextStartDate] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [selectedGame, setSelectedGame] = useState<NHLGame | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [homeTeamName, setHomeTeamName] = useState<string>("Home");
  const [awayTeamName, setAwayTeamName] = useState<string>("Away");
  const [homeTeamAbbr, setHomeTeamAbbr] = useState<string>("HOME");
  const [awayTeamAbbr, setAwayTeamAbbr] = useState<string>("AWAY");
  const [gameStatus, setGameStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(REFRESH_INTERVAL / 1000);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [pollingActive, setPollingActive] = useState<boolean>(false);
  const [matchups, setMatchups] = useState<MatchupsResponse | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSchedule = useCallback(async (date: string) => {
    setScheduleLoading(true);
    setScheduleError(null);
    setScheduleGames([]);
    setSelectedGame(null);
    setShots([]);
    setGameStatus("idle");
    setStatusMsg("");
    setScheduleWeek([]);
    setNextStartDate(null);
    try {
      const res = await fetch(`${API_BASE}/schedule/${date}`);
      if (!res.ok) throw new Error(`Schedule fetch failed (${res.status})`);
      const data = await res.json() as { games: NHLGame[], gameWeek: any[], nextStartDate?: string };
      const games = data.games ?? [];
      setScheduleGames(games);
      setScheduleWeek(data.gameWeek ?? []);
      setNextStartDate(data.nextStartDate ?? null);
      if (!games.length) setScheduleError("No games scheduled for this date.");
    } catch (e) {
      setScheduleError("Could not load schedule from NHL API.");
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule(selectedDate);
  }, [selectedDate, fetchSchedule]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPollingActive(false);
  }, []);

  const fetchGameData = useCallback(async (game: NHLGame) => {
    const gid = String(game.id);
    try {
      const [xgRes, boxRes, matchupsRes] = await Promise.all([
        fetch(`${API_BASE}/game/${gid}`),
        fetch(`${API_BASE}/boxscore/${gid}`),
        fetch(`${API_BASE}/matchups/${gid}`)
      ]);

      if (!xgRes.ok) throw new Error(`xG API error ${xgRes.status}`);
      const xgData = await xgRes.json() as { shots: Shot[] };
      const newShots = xgData.shots ?? [];
      
      let actualHomeId: number | null = null; 

      if (boxRes.ok) {
        const boxData = await boxRes.json() as {
          homeTeam?: { id: number, abbrev: string, name?: { default: string } };
          awayTeam?: { id: number, abbrev: string, name?: { default: string } };
          gameState?: string;
        };
        if (boxData.homeTeam) {
          actualHomeId = boxData.homeTeam.id;
          setHomeTeamName(boxData.homeTeam.name?.default ?? boxData.homeTeam.abbrev ?? "Home");
          setHomeTeamAbbr(boxData.homeTeam.abbrev ?? "HOME");
          setHomeTeamId(actualHomeId);
        }
        if (boxData.awayTeam) {
          setAwayTeamName(boxData.awayTeam.name?.default ?? boxData.awayTeam.abbrev ?? "Away");
          setAwayTeamAbbr(boxData.awayTeam.abbrev ?? "AWAY");
        }
        setIsLive(boxData.gameState === "LIVE" || boxData.gameState === "CRIT");
      }

      if (matchupsRes.ok) {
        const matchData = await matchupsRes.json() as MatchupsResponse;
        if (matchData.team1 && matchData.team2) {
          setMatchups(matchData);
        }
      }

      if (newShots.length && actualHomeId === null) {
        const ids = [...new Set(newShots.map(s => s.team_id).filter((id): id is number => id !== null))];
        if (ids.length) setHomeTeamId(ids[0]);
      }

      setShots(newShots);
      setLastUpdated(new Date());
      setGameStatus("live");
      setStatusMsg(newShots.length ? `${newShots.length} shots loaded` : "No shots yet — game may not have started.");
    } catch (err) {
      setGameStatus("error");
      setStatusMsg("Cannot reach FastAPI server at localhost:8000. Is it running?");
    }
  }, []);

  const startPolling = useCallback((game: NHLGame) => {
    stopPolling();
    setCountdown(REFRESH_INTERVAL / 1000);
    setPollingActive(true);
    intervalRef.current = setInterval(() => {
      fetchGameData(game);
      setCountdown(REFRESH_INTERVAL / 1000);
    }, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
  }, [fetchGameData, stopPolling]);

  const handleSelectGame = useCallback(async (game: NHLGame) => {
    stopPolling();
    setSelectedGame(game);
    setShots([]);
    setHomeTeamId(null);
    setHomeTeamName(game.homeTeam?.name?.default ?? game.homeTeam?.abbrev ?? "Home");
    setAwayTeamName(game.awayTeam?.name?.default ?? game.awayTeam?.abbrev ?? "Away");
    setHomeTeamAbbr(game.homeTeam?.abbrev ?? "HOME");
    setAwayTeamAbbr(game.awayTeam?.abbrev ?? "AWAY");
    setGameStatus("loading");
    setStatusMsg("Loading…");
    await fetchGameData(game);
    startPolling(game);
  }, [fetchGameData, startPolling, stopPolling]);

  // Handle incoming game from Schedule page routing
  useEffect(() => {
    if (location.state?.selectedGame) {
      handleSelectGame(location.state.selectedGame);
      // Clear state so it doesn't re-trigger on refresh
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state, handleSelectGame, navigate]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const stats = useCallback((): GameStats => {
    let homeXG = 0, awayXG = 0, homeShots = 0, awayShots = 0, homeGoals = 0, awayGoals = 0;
    shots.forEach(s => {
      const xg = s.xg ?? 0;
      if (s.team_id === homeTeamId) {
        homeXG += xg; homeShots++;
        if (s.is_goal) homeGoals++;
      } else {
        awayXG += xg; awayShots++;
        if (s.is_goal) awayGoals++;
      }
    });
    return { homeXG, awayXG, homeShots, awayShots, homeGoals, awayGoals };
  }, [shots, homeTeamId]);

  const s = stats();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="page-title">Live Tracker</h1>
        <div className="date-nav-group">
          <button
            className="date-nav-arrow"
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={18} />
          </button>
          <DatePicker value={selectedDate} onChange={setSelectedDate} />
          <button
            className="date-nav-arrow"
            onClick={() => setSelectedDate(d => shiftDate(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => fetchSchedule(selectedDate)}
            disabled={scheduleLoading}
            className="btn-primary"
          >
            {scheduleLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {scheduleError && (
        <div className="alert-error schedule-error">
          <span>{scheduleError}</span>
          {(scheduleWeek.find(d => d.date > selectedDate && d.numberOfGames > 0) || nextStartDate) && (
            <button 
              onClick={() => {
                const nextInWeek = scheduleWeek.find(d => d.date > selectedDate && d.numberOfGames > 0);
                setSelectedDate(nextInWeek ? nextInWeek.date : nextStartDate!);
              }}
              className="btn-primary"
            >
              Jump to Next Game Day
            </button>
          )}
        </div>
      )}
      
      {scheduleGames.length > 0 && (
        <div className="schedule-section">
          <div className="section-title">
            {scheduleGames.length} game{scheduleGames.length !== 1 ? "s" : ""} on {selectedDate}
          </div>
          <div className="game-cards-container">
            {scheduleGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                selected={selectedGame?.id === game.id}
                onSelect={handleSelectGame}
              />
            ))}
          </div>
        </div>
      )}

      {selectedGame && (
        <div className="status-bar">
          <div className="status-message">
            {gameStatus === "live" && isLive && (
              <span className="pulse-dot" />
            )}
            <span className={gameStatus === "error" ? "text-error" : ""}>{statusMsg}</span>
          </div>
          <div className="status-controls">
            {pollingActive && (
              <>
                <span className="status-text">Refresh in {countdown}s</span>
                <button className="btn-secondary" onClick={stopPolling}>Pause</button>
              </>
            )}
            {!pollingActive && selectedGame && (
              <button
                className="btn-secondary"
                onClick={() => { fetchGameData(selectedGame); startPolling(selectedGame); }}
              >
                Resume
              </button>
            )}
            {lastUpdated && (
              <span className="status-text">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      )}

      {selectedGame && (
        <Scoreboard 
          stats={s} 
          homeTeamAbbr={homeTeamAbbr} 
          awayTeamAbbr={awayTeamAbbr} 
          homeTeamName={homeTeamName} 
          awayTeamName={awayTeamName} 
        />
      )}

      {selectedGame && (
        <div className="rink-section">
          <HockeyRink 
            shots={shots} 
            homeTeamId={homeTeamId} 
            homeAbbr={homeTeamAbbr} 
            awayAbbr={awayTeamAbbr} 
          />
        </div>
      )}

      {selectedGame && matchups && (
        <MatchupBoard 
          matchups={matchups} 
          homeTeamId={homeTeamId} 
          homeAbbr={homeTeamAbbr} 
          awayAbbr={awayTeamAbbr} 
        />
      )}
    </div>
  );
}
