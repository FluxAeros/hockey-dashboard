import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NHLGame, Shot, MatchupsResponse, GameStats } from "../types";
import { todayDateString, shiftDate, formatGameScheduleDateTime, isGameActiveLive } from "../utils/helpers";
import { GameCard } from "../components/GameCard";
import { HockeyRink } from "../components/HockeyRink";
import { MatchupBoard } from "../components/MatchupBoard";
import { Scoreboard } from "../components/Scoreboard";
import { FollowedTeamsWidget } from "../components/FollowedTeamsWidget";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { DatePicker } from "../components/DatePicker";
import { NHL_TEAMS_METADATA } from "../utils/nhlDivisions";
import { API_BASE } from "../utils/api";

const REFRESH_INTERVAL = 30000;

function resolveTeamFullName(team: any, fallbackAbbr: string): string {
  if (team?.name?.default) return team.name.default;
  if (team?.placeName?.default && team?.commonName?.default) {
    return `${team.placeName.default} ${team.commonName.default}`;
  }
  const abbr = (team?.abbrev || fallbackAbbr || "").toUpperCase();
  if (abbr && NHL_TEAMS_METADATA[abbr]) {
    return NHL_TEAMS_METADATA[abbr].name;
  }
  return team?.commonName?.default || abbr || "Team";
}

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
  const [gamesCollapsed, setGamesCollapsed] = useState<boolean>(false);
  const [matchups, setMatchups] = useState<MatchupsResponse | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSchedule = useCallback(async (date: string, keepSelected: boolean = false) => {
    setScheduleLoading(true);
    setScheduleError(null);
    if (!keepSelected) {
      setScheduleGames([]);
      setSelectedGame(null);
      setShots([]);
      setGameStatus("idle");
      setStatusMsg("");
    }
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
      if (!games.length && !keepSelected) setScheduleError("No games scheduled for this date.");
    } catch {
      if (!keepSelected) setScheduleError("Could not load schedule from NHL API.");
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule(selectedDate, selectedGame !== null);
  }, [selectedDate, fetchSchedule]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPollingActive(false);
  }, []);

  const [winProbability, setWinProbability] = useState<{ homeProb: number, awayProb: number } | null>(null);

  const fetchGameData = useCallback(async (game: NHLGame): Promise<boolean> => {
    const gid = String(game.id);
    try {
      const results = await Promise.allSettled([
        fetch(`${API_BASE}/game/${gid}`),
        fetch(`${API_BASE}/boxscore/${gid}`),
        fetch(`${API_BASE}/matchups/${gid}`)
      ]);

      const xgRes = results[0].status === "fulfilled" ? results[0].value : null;
      const boxRes = results[1].status === "fulfilled" ? results[1].value : null;
      const matchupsRes = results[2].status === "fulfilled" ? results[2].value : null;

      let newShots: Shot[] = [];
      if (xgRes && xgRes.ok) {
        const xgData = await xgRes.json() as { shots: Shot[], winProbability?: { homeProb: number, awayProb: number } };
        newShots = xgData.shots ?? [];
        if (xgData.winProbability) {
          setWinProbability(xgData.winProbability);
        } else {
          setWinProbability(null);
        }
      } else {
        setWinProbability(null);
      }
      
      let actualHomeId: number | null = null; 
      let currentGameState = game.gameState || "FUT";

      if (boxRes && boxRes.ok) {
        const boxData = await boxRes.json() as {
          homeTeam?: { id: number, abbrev: string, name?: { default: string } };
          awayTeam?: { id: number, abbrev: string, name?: { default: string } };
          gameState?: string;
        };
        if (boxData.homeTeam) {
          actualHomeId = boxData.homeTeam.id;
          setHomeTeamName(resolveTeamFullName(boxData.homeTeam, boxData.homeTeam.abbrev ?? "Home"));
          setHomeTeamAbbr(boxData.homeTeam.abbrev ?? "HOME");
          setHomeTeamId(actualHomeId);
        }
        if (boxData.awayTeam) {
          setAwayTeamName(resolveTeamFullName(boxData.awayTeam, boxData.awayTeam.abbrev ?? "Away"));
          setAwayTeamAbbr(boxData.awayTeam.abbrev ?? "AWAY");
        }
        if (boxData.gameState) {
          currentGameState = boxData.gameState;
        }
      }

      if (matchupsRes && matchupsRes.ok) {
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

      const gameIsLive = isGameActiveLive({ ...game, gameState: currentGameState }, currentGameState);
      setIsLive(gameIsLive);

      // Determine clear informative status message referencing schedule & game state
      const isFinal = ["OVER", "OFF", "FINAL"].includes(currentGameState);
      const scheduledTimeStr = formatGameScheduleDateTime(game.startTimeUTC);

      if (gameIsLive) {
        setStatusMsg(newShots.length ? `${newShots.length} shots recorded (Live)` : "Game is live · Waiting for first shot");
      } else if (isFinal) {
        setStatusMsg(`Final · ${newShots.length} shots recorded · Polling paused`);
      } else if (scheduledTimeStr) {
        const startTime = game.startTimeUTC ? new Date(game.startTimeUTC).getTime() : 0;
        if (startTime && Date.now() < startTime) {
          setStatusMsg(`Scheduled for ${scheduledTimeStr} · Polling paused until game starts`);
        } else {
          setStatusMsg(`Scheduled for ${scheduledTimeStr} · Pre-game · Polling paused`);
        }
      } else {
        setStatusMsg(newShots.length ? `${newShots.length} shots loaded · Polling paused` : "Game scheduled · Pre-game");
      }

      return gameIsLive;
    } catch (err) {
      setGameStatus("error");
      setStatusMsg("Cannot reach FastAPI server at localhost:8000. Is it running?");
      return false;
    }
  }, []);

  const startPolling = useCallback((game: NHLGame) => {
    stopPolling();
    setCountdown(REFRESH_INTERVAL / 1000);
    setPollingActive(true);
    intervalRef.current = setInterval(async () => {
      const stillLive = await fetchGameData(game);
      if (!stillLive) {
        stopPolling();
      } else {
        setCountdown(REFRESH_INTERVAL / 1000);
      }
    }, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
  }, [fetchGameData, stopPolling]);

  const handleSelectGame = useCallback(async (game: NHLGame) => {
    stopPolling();
    setScheduleError(null);
    setSelectedGame(game);
    setGamesCollapsed(true);
    setShots([]);
    setHomeTeamId(null);
    setHomeTeamName(resolveTeamFullName(game.homeTeam, game.homeTeam?.abbrev ?? "Home"));
    setAwayTeamName(resolveTeamFullName(game.awayTeam, game.awayTeam?.abbrev ?? "Away"));
    setHomeTeamAbbr(game.homeTeam?.abbrev ?? "HOME");
    setAwayTeamAbbr(game.awayTeam?.abbrev ?? "AWAY");
    setGameStatus("loading");
    setStatusMsg("Loading…");
    const gameIsLive = await fetchGameData(game);
    if (gameIsLive) {
      startPolling(game);
    }
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

  const [isJumping, setIsJumping] = useState<boolean>(false);

  const handleJumpToNextGameDay = async () => {
    // 1. Check if there is already a game day in the current 7-day week
    const nextInWeek = scheduleWeek.find(
      d => d.date > selectedDate && ((d.numberOfGames ?? 0) > 0 || (d.games && d.games.length > 0))
    );
    if (nextInWeek) {
      setSelectedDate(nextInWeek.date);
      return;
    }

    // 2. Otherwise search forward week by week until finding a day with games
    let cursor = nextStartDate;
    if (!cursor) return;

    setIsJumping(true);
    try {
      let attempts = 0;
      while (cursor && attempts < 52) {
        attempts++;
        const res = await fetch(`${API_BASE}/schedule/${cursor}`);
        if (!res.ok) break;
        const data = await res.json() as { games: NHLGame[], gameWeek: any[], nextStartDate?: string };
        const week = data.gameWeek ?? [];

        const firstGameDay = week.find(
          d => ((d.numberOfGames ?? 0) > 0 || (d.games && d.games.length > 0))
        );

        if (firstGameDay) {
          setSelectedDate(firstGameDay.date);
          return;
        }

        if (data.nextStartDate && data.nextStartDate > cursor) {
          cursor = data.nextStartDate;
        } else {
          break;
        }
      }
    } catch (err) {
      console.error("Failed to find next game day", err);
    } finally {
      setIsJumping(false);
    }
  };

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
            disabled={scheduleLoading || isJumping}
            className="btn-primary"
          >
            {scheduleLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Tailored Followed Teams Feed */}
      <FollowedTeamsWidget
        isGameSelected={selectedGame !== null}
        onSelectGame={(game, date) => {
          if (date && date !== selectedDate) {
            setSelectedDate(date);
          }
          handleSelectGame(game);
          setTimeout(() => {
            window.scrollTo({ top: 250, behavior: "smooth" });
          }, 50);
        }}
      />

      {scheduleError && !selectedGame && (
        <div className="alert-error schedule-error">
          <span>{scheduleError}</span>
          {(scheduleWeek.some(d => d.date > selectedDate && ((d.numberOfGames ?? 0) > 0 || d.games?.length > 0)) || nextStartDate) && (
            <button 
              onClick={handleJumpToNextGameDay}
              disabled={isJumping || scheduleLoading}
              className="btn-primary"
            >
              {isJumping ? "Finding next game…" : "Jump to Next Game Day"}
            </button>
          )}
        </div>
      )}
      
      {scheduleGames.length > 0 && (
        <div className={`schedule-section ${gamesCollapsed && selectedGame ? 'collapsed' : ''}`}>
          <div className="section-title-row">
            <div className="section-title">
              {scheduleGames.length} game{scheduleGames.length !== 1 ? "s" : ""} on {selectedDate}
            </div>
            {selectedGame && (
              <button
                className="games-collapse-toggle"
                onClick={() => setGamesCollapsed(prev => !prev)}
                aria-label={gamesCollapsed ? 'Show all games' : 'Collapse games'}
              >
                {gamesCollapsed ? (
                  <><span className="collapse-toggle-label">Show Games</span><ChevronDown size={16} /></>
                ) : (
                  <><span className="collapse-toggle-label">Hide Games</span><ChevronUp size={16} /></>
                )}
              </button>
            )}
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
        <Scoreboard 
          stats={s} 
          homeTeamAbbr={homeTeamAbbr} 
          awayTeamAbbr={awayTeamAbbr} 
          homeTeamName={homeTeamName} 
          awayTeamName={awayTeamName} 
          winProbability={winProbability}
        />
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
            {pollingActive ? (
              <>
                <span className="status-text">Refresh in {countdown}s</span>
                <button className="btn-secondary" onClick={stopPolling}>Pause</button>
              </>
            ) : (
              selectedGame && (
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const gameIsLive = await fetchGameData(selectedGame);
                    if (gameIsLive) {
                      startPolling(selectedGame);
                    }
                  }}
                >
                  {isLive ? "Resume" : "Refresh"}
                </button>
              )
            )}
            {lastUpdated && (
              <span className="status-text">Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
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
