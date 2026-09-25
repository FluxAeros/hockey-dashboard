import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { NHLGame, Shot, MatchupsResponse, GameStats, TimeoutsInfo, PowerPlayInfo } from "../types";
import { todayDateString, shiftDate, formatGameScheduleDateTime, isGameActiveLive, getPeriodClockInfo } from "../utils/helpers";
import { GameCard } from "../components/GameCard";
import { HockeyRink } from "../components/HockeyRink";
import { MatchupBoard } from "../components/MatchupBoard";
import { Scoreboard } from "../components/Scoreboard";
import { FollowedTeamsWidget } from "../components/FollowedTeamsWidget";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { DatePicker } from "../components/DatePicker";
import { NHL_TEAMS_METADATA } from "../utils/nhlDivisions";
import { TEAM_COLORS } from "../utils/helpers";
import { GoalCelebration } from "../components/GoalCelebration";
import { API_BASE } from "../utils/api";
import { useLiveSync, type GameLivePayload } from "../hooks/useLiveSync";

const REFRESH_INTERVAL = 10000;

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
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return location.state?.selectedDate || sessionStorage.getItem("dashboard_date") || todayDateString();
  });

  useEffect(() => {
    sessionStorage.setItem("dashboard_date", selectedDate);
  }, [selectedDate]);
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
  const [gameClock, setGameClock] = useState<{
    timeRemaining?: string;
    secondsRemaining?: number;
    running?: boolean;
    inIntermission?: boolean;
  } | null>(null);
  const [periodDescriptor, setPeriodDescriptor] = useState<{
    number?: number;
    periodType?: string;
  } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [winProbability, setWinProbability] = useState<{ homeProb: number, awayProb: number } | null>(null);
  const [timeouts, setTimeouts] = useState<TimeoutsInfo | null>(null);
  const [powerPlay, setPowerPlay] = useState<PowerPlayInfo | null>(null);
  const [testPenaltyPreview, setTestPenaltyPreview] = useState(false);
  const [officialScore, setOfficialScore] = useState<{ homeGoals: number, awayGoals: number, homeShots: number, awayShots: number } | null>(null);

  // Goal celebration state
  const [goalCelebration, setGoalCelebration] = useState<{ visible: boolean; teamAbbr: string; teamName: string } | null>(null);
  const prevScoreRef = useRef<{ homeGoals: number; awayGoals: number } | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPollingActive(false);
  }, []);

  const deselectGame = useCallback(() => {
    stopPolling();
    setSelectedGame(null);
    setShots([]);
    setHomeTeamId(null);
    setHomeTeamName("Home");
    setAwayTeamName("Away");
    setHomeTeamAbbr("HOME");
    setAwayTeamAbbr("AWAY");
    setGameStatus("idle");
    setStatusMsg("");
    setWinProbability(null);
    setOfficialScore(null);
    setGoalCelebration(null);
    setMatchups(null);
    setGameClock(null);
    setPeriodDescriptor(null);
    setGamesCollapsed(false);
    prevScoreRef.current = null;
  }, [stopPolling]);

  const handleDateChange = useCallback((newDate: string) => {
    if (newDate === selectedDate) return;
    deselectGame();
    setSelectedDate(newDate);
  }, [selectedDate, deselectGame]);

  const fetchSchedule = useCallback(async (date: string) => {
    setScheduleLoading(true);
    setScheduleError(null);
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
    } catch {
      setScheduleError("Could not load schedule from NHL API.");
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule(selectedDate);
  }, [selectedDate, fetchSchedule]);

  // Preload team logo SVGs to prevent image decode/fetch jank during goal celebration
  useEffect(() => {
    if (!selectedGame) return;
    const homeAbbr = selectedGame.homeTeam?.abbrev;
    const awayAbbr = selectedGame.awayTeam?.abbrev;
    [homeAbbr, awayAbbr].forEach((abbr) => {
      if (abbr) {
        const img = new Image();
        img.src = `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;
      }
    });
  }, [selectedGame]);

  const handleScheduleUpdate = useCallback((games: NHLGame[]) => {
    setScheduleGames(games);
    if (selectedGame) {
      const match = games.find(g => g.id === selectedGame.id);
      if (match) {
        const liveNow = isGameActiveLive(match, match.gameState);
        setIsLive(liveNow);
        if (match.clock) setGameClock(match.clock);
        if (match.periodDescriptor) setPeriodDescriptor(match.periodDescriptor);
      }
    }
  }, [selectedGame]);

  const handleGameUpdate = useCallback((payload: GameLivePayload) => {
    if (!selectedGame) return;
    if (payload.shots && payload.shots.length > 0) {
      setShots(payload.shots);
    }
    if (payload.winProbability !== undefined && payload.winProbability !== null) {
      setWinProbability(payload.winProbability);
    }
    if (payload.timeouts) {
      setTimeouts(payload.timeouts);
    }
    if (payload.powerPlay !== undefined) {
      setPowerPlay(payload.powerPlay);
    }

    const box = payload.boxscore;
    const currentGameState = box?.gameState || payload.gameState || selectedGame.gameState;

    // Update live clock and period descriptor
    const activeClock = payload.clock || box?.clock;
    if (activeClock) {
      setGameClock(activeClock);
    }
    const activePdesc = payload.periodDescriptor || box?.periodDescriptor;
    if (activePdesc) {
      setPeriodDescriptor(activePdesc);
    }

    // Keep selectedGame synced with live gameState, clock, and period
    setSelectedGame(prev => prev ? {
      ...prev,
      gameState: currentGameState,
      clock: activeClock || prev.clock,
      periodDescriptor: activePdesc || prev.periodDescriptor,
    } : null);

    if (box?.homeTeam?.id) {
      setHomeTeamId(box.homeTeam.id);
    } else if (selectedGame.homeTeam?.id) {
      setHomeTeamId(selectedGame.homeTeam.id);
    }

    if (box?.homeTeam && box?.awayTeam) {
      const newHome = box.homeTeam.score ?? 0;
      const newAway = box.awayTeam.score ?? 0;
      const homeAbbr = box.homeTeam.abbrev ?? selectedGame.homeTeam?.abbrev ?? "HOME";
      const awayAbbr = box.awayTeam.abbrev ?? selectedGame.awayTeam?.abbrev ?? "AWAY";
      const homeFullName = resolveTeamFullName(box.homeTeam, homeAbbr);
      const awayFullName = resolveTeamFullName(box.awayTeam, awayAbbr);

      setHomeTeamName(homeFullName);
      setAwayTeamName(awayFullName);
      setHomeTeamAbbr(homeAbbr);
      setAwayTeamAbbr(awayAbbr);

      const prev = prevScoreRef.current;
      if (prev !== null) {
        if (newHome > prev.homeGoals) {
          requestAnimationFrame(() => {
            setGoalCelebration({ visible: true, teamAbbr: homeAbbr, teamName: homeFullName });
          });
        } else if (newAway > prev.awayGoals) {
          requestAnimationFrame(() => {
            setGoalCelebration({ visible: true, teamAbbr: awayAbbr, teamName: awayFullName });
          });
        }
      }
      prevScoreRef.current = { homeGoals: newHome, awayGoals: newAway };

      setOfficialScore({
        homeGoals: newHome,
        awayGoals: newAway,
        homeShots: box.homeTeam.sog ?? 0,
        awayShots: box.awayTeam.sog ?? 0,
      });

      // Dynamically update corresponding game card in scheduleGames and selectedGame
      setSelectedGame(prev => prev ? {
        ...prev,
        gameState: currentGameState,
        clock: activeClock || prev.clock,
        periodDescriptor: activePdesc || prev.periodDescriptor,
        awayTeam: { ...prev.awayTeam, score: newAway },
        homeTeam: { ...prev.homeTeam, score: newHome },
      } : null);

      setScheduleGames(prevGames => prevGames.map(g => {
        if (g.id === selectedGame.id) {
          return {
            ...g,
            gameState: currentGameState,
            clock: activeClock || g.clock,
            periodDescriptor: activePdesc || g.periodDescriptor,
            awayTeam: { ...g.awayTeam, score: newAway },
            homeTeam: { ...g.homeTeam, score: newHome },
            winProbability: payload.winProbability !== undefined ? payload.winProbability : g.winProbability,
          };
        }
        return g;
      }));
    }

    const gameIsLive = isGameActiveLive({ ...selectedGame, gameState: currentGameState }, currentGameState);
    setIsLive(gameIsLive);
    setLastUpdated(new Date());
    setGameStatus("live");

    const shotCount = (payload.shots && payload.shots.length > 0) ? payload.shots.length : shots.length;
    const info = getPeriodClockInfo(currentGameState, activeClock || gameClock, activePdesc || periodDescriptor, selectedGame.startTimeUTC);
    if (gameIsLive) {
      if (info.statusType === "intermission") {
        setStatusMsg(`${info.primaryText}${info.nextPeriodLabel ? ` · ${info.nextPeriodLabel}` : ""} · ${shotCount} shots (Live)`);
      } else if (info.timeRemaining) {
        setStatusMsg(`${info.primaryText} · ${info.timeRemaining} · ${shotCount} shots (Live)`);
      } else {
        setStatusMsg(shotCount > 0 ? `${shotCount} shots recorded (Live)` : "Game is live · Waiting for first shot");
      }
    } else if (["OVER", "OFF", "FINAL"].includes(currentGameState)) {
      setStatusMsg(`Final · ${shotCount} shots recorded · Polling paused`);
    }
  }, [selectedGame, shots.length, gameClock, periodDescriptor]);

  const { isConnected } = useLiveSync({
    date: selectedDate,
    gameId: selectedGame?.id ?? null,
    onScheduleUpdate: handleScheduleUpdate,
    onGameUpdate: handleGameUpdate,
  });

  // Stop HTTP polling whenever WebSocket live sync connects
  useEffect(() => {
    if (isConnected) {
      stopPolling();
    }
  }, [isConnected, stopPolling]);

  // Background fallback schedule polling if WebSocket is offline
  useEffect(() => {
    if (isConnected) return;
    const timer = setInterval(() => {
      fetchSchedule(selectedDate);
    }, 12000);
    return () => clearInterval(timer);
  }, [selectedDate, isConnected, fetchSchedule]);

  const fetchGameData = useCallback(async (game: NHLGame): Promise<boolean> => {
    const gid = String(game.id);
    try {
      // 1. Fetch live game stats & boxscore concurrently for fast render
      const [xgRes, boxRes] = await Promise.allSettled([
        fetch(`${API_BASE}/game/${gid}`, { cache: "no-store" }),
        fetch(`${API_BASE}/boxscore/${gid}`, { cache: "no-store" })
      ]);

      // 2. Fetch matchups asynchronously in background without blocking win probability
      fetch(`${API_BASE}/matchups/${gid}`, { cache: "no-store" })
        .then(res => res.ok ? res.json() : null)
        .then(matchData => {
          if (matchData && matchData.team1 && matchData.team2) {
            setMatchups(matchData);
          }
        })
        .catch(err => console.warn("Failed to load matchups in background", err));

      let newShots: Shot[] = [];
      if (xgRes.status === "fulfilled" && xgRes.value.ok) {
        try {
          const xgData = await xgRes.value.json() as {
            shots: Shot[];
            winProbability?: { homeProb: number, awayProb: number };
            timeouts?: TimeoutsInfo;
            powerPlay?: PowerPlayInfo;
          };
          newShots = xgData.shots ?? [];
          if (xgData.winProbability) {
            setWinProbability(xgData.winProbability);
          } else {
            setWinProbability(null);
          }
          if (xgData.timeouts) {
            setTimeouts(xgData.timeouts);
          }
          if (xgData.powerPlay !== undefined) {
            setPowerPlay(xgData.powerPlay);
          }
        } catch (e) {
          console.warn("Failed to parse xg data", e);
          setWinProbability(null);
        }
      } else {
        console.warn("xG fetch failed");
        setWinProbability(null);
      }
      
      let actualHomeId: number | null = game.homeTeam?.id ?? null; 
      let currentGameState = game.gameState;

      if (boxRes.status === "fulfilled" && boxRes.value.ok) {
        try {
          const boxData = await boxRes.value.json() as {
            homeTeam?: { id: number, abbrev: string, name?: { default: string }, score?: number, sog?: number };
            awayTeam?: { id: number, abbrev: string, name?: { default: string }, score?: number, sog?: number };
            gameState?: string;
            clock?: {
              timeRemaining?: string;
              secondsRemaining?: number;
              running?: boolean;
              inIntermission?: boolean;
            };
            periodDescriptor?: {
              number?: number;
              periodType?: string;
            };
          };
          if (boxData.gameState) {
            currentGameState = boxData.gameState;
          }
          if (boxData.clock) {
            setGameClock(boxData.clock);
          }
          if (boxData.periodDescriptor) {
            setPeriodDescriptor(boxData.periodDescriptor);
          }
          if (boxData.homeTeam) {
            actualHomeId = boxData.homeTeam.id ?? actualHomeId;
            setHomeTeamName(resolveTeamFullName(boxData.homeTeam, boxData.homeTeam.abbrev ?? game.homeTeam?.abbrev ?? "Home"));
            setHomeTeamAbbr(boxData.homeTeam.abbrev ?? game.homeTeam?.abbrev ?? "HOME");
            setHomeTeamId(actualHomeId);
          }
          if (boxData.awayTeam) {
            setAwayTeamName(resolveTeamFullName(boxData.awayTeam, boxData.awayTeam.abbrev ?? game.awayTeam?.abbrev ?? "Away"));
            setAwayTeamAbbr(boxData.awayTeam.abbrev ?? game.awayTeam?.abbrev ?? "AWAY");
          }
          if (boxData.homeTeam && boxData.awayTeam) {
            const newHome = boxData.homeTeam.score ?? 0;
            const newAway = boxData.awayTeam.score ?? 0;
            const homeAbbr = boxData.homeTeam.abbrev ?? game.homeTeam?.abbrev ?? "HOME";
            const awayAbbr = boxData.awayTeam.abbrev ?? game.awayTeam?.abbrev ?? "AWAY";
            const homeFullName = resolveTeamFullName(boxData.homeTeam, homeAbbr);
            const awayFullName = resolveTeamFullName(boxData.awayTeam, awayAbbr);

            // Goal detection: compare against previous known score
            const prev = prevScoreRef.current;
            if (prev !== null) {
              if (newHome > prev.homeGoals) {
                requestAnimationFrame(() => {
                  setGoalCelebration({ visible: true, teamAbbr: homeAbbr, teamName: homeFullName });
                });
              } else if (newAway > prev.awayGoals) {
                requestAnimationFrame(() => {
                  setGoalCelebration({ visible: true, teamAbbr: awayAbbr, teamName: awayFullName });
                });
              }
            }
            prevScoreRef.current = { homeGoals: newHome, awayGoals: newAway };

            setOfficialScore({
              homeGoals: newHome,
              awayGoals: newAway,
              homeShots: boxData.homeTeam.sog ?? 0,
              awayShots: boxData.awayTeam.sog ?? 0
            });

            // Dynamically update game card in scheduleGames and selectedGame
            setSelectedGame(prev => prev && prev.id === game.id ? {
              ...prev,
              gameState: currentGameState,
              clock: boxData.clock || prev.clock,
              periodDescriptor: boxData.periodDescriptor || prev.periodDescriptor,
              awayTeam: { ...prev.awayTeam, score: newAway },
              homeTeam: { ...prev.homeTeam, score: newHome }
            } : prev);

            setScheduleGames(prevGames => prevGames.map(g => {
              if (g.id === game.id) {
                return {
                  ...g,
                  gameState: currentGameState,
                  clock: boxData.clock || g.clock,
                  periodDescriptor: boxData.periodDescriptor || g.periodDescriptor,
                  awayTeam: { ...g.awayTeam, score: newAway },
                  homeTeam: { ...g.homeTeam, score: newHome }
                };
              }
              return g;
            }));
          }
        } catch (e) {
          console.warn("Failed to parse boxscore data", e);
        }
      } else {
        setHomeTeamId(actualHomeId);
      }

      if (newShots.length && actualHomeId === null) {
        const ids = [...new Set(newShots.map(s => s.team_id).filter((id): id is number => id !== null))];
        if (ids.length) {
          actualHomeId = ids[0];
          setHomeTeamId(actualHomeId);
        }
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
    setGameClock(game.clock ?? null);
    setPeriodDescriptor(game.periodDescriptor ?? null);
    setWinProbability(game.winProbability ?? null);
    setTimeouts(null);
    setPowerPlay(null);
    setTestPenaltyPreview(false);
    setGamesCollapsed(true);
    setShots([]);
    setHomeTeamId(game.homeTeam?.id ?? null);
    setHomeTeamName(resolveTeamFullName(game.homeTeam, game.homeTeam?.abbrev ?? "Home"));
    setAwayTeamName(resolveTeamFullName(game.awayTeam, game.awayTeam?.abbrev ?? "Away"));
    setHomeTeamAbbr(game.homeTeam?.abbrev ?? "HOME");
    setAwayTeamAbbr(game.awayTeam?.abbrev ?? "AWAY");
    setGameStatus("loading");
    setStatusMsg("Loading…");
    prevScoreRef.current = null;
    setGoalCelebration(null);
    const gameIsLive = await fetchGameData(game);
    if (gameIsLive && !isConnected) {
      startPolling(game);
    }
  }, [fetchGameData, startPolling, stopPolling, isConnected]);

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

    if (officialScore) {
      return { 
        homeXG, awayXG, 
        homeShots: officialScore.homeShots || homeShots, 
        awayShots: officialScore.awayShots || awayShots, 
        homeGoals: officialScore.homeGoals, 
        awayGoals: officialScore.awayGoals 
      };
    }

    return { homeXG, awayXG, homeShots, awayShots, homeGoals, awayGoals };
  }, [shots, homeTeamId, officialScore]);

  const s = stats();

  const [isJumping, setIsJumping] = useState<boolean>(false);

  const handleJumpToNextGameDay = async () => {
    // 1. Check if there is already a game day in the current 7-day week
    const nextInWeek = scheduleWeek.find(
      d => d.date > selectedDate && ((d.numberOfGames ?? 0) > 0 || (d.games && d.games.length > 0))
    );
    if (nextInWeek) {
      handleDateChange(nextInWeek.date);
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
          handleDateChange(firstGameDay.date);
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
            onClick={() => handleDateChange(shiftDate(selectedDate, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={18} />
          </button>
          <DatePicker value={selectedDate} onChange={handleDateChange} />
          <button
            className="date-nav-arrow"
            onClick={() => handleDateChange(shiftDate(selectedDate, 1))}
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
                winProbability={selectedGame?.id === game.id ? winProbability : game.winProbability}
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
          gameState={selectedGame.gameState}
          clock={gameClock ?? selectedGame.clock}
          periodDescriptor={periodDescriptor ?? selectedGame.periodDescriptor}
          startTimeUTC={selectedGame.startTimeUTC}
          timeouts={timeouts}
          powerPlay={powerPlay}
          testPenaltyPreview={testPenaltyPreview}
          onDismissTestPenalty={() => setTestPenaltyPreview(false)}
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
            {isConnected ? (
              <div className="live-sync-indicator" title="Connected to chelstatz live real-time synchronization engine">
                <span className="pulse-dot-green" />
                <span className="live-sync-text">Live Sync</span>
              </div>
            ) : pollingActive ? (
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
                    if (gameIsLive && !isConnected) {
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
            {/* Test button – always visible when game loaded */}
            <button
              className="btn-secondary"
              style={{ opacity: 0.6, fontSize: "0.75rem" }}
              title="Test the goal celebration animation"
              onClick={() => {
                // Alternate between home and away for testing
                const useHome = Math.random() > 0.5;
                setGoalCelebration({
                  visible: true,
                  teamAbbr: useHome ? homeTeamAbbr : awayTeamAbbr,
                  teamName: useHome ? homeTeamName : awayTeamName,
                });
              }}
            >
              Test Goal
            </button>
            <button
              className="btn-secondary"
              style={{
                opacity: testPenaltyPreview ? 1 : 0.6,
                fontSize: "0.75rem",
                borderColor: testPenaltyPreview ? "#f59e0b" : undefined,
                color: testPenaltyPreview ? "#f59e0b" : undefined,
              }}
              title="Test the penalty box mugshot widget"
              onClick={() => setTestPenaltyPreview(prev => !prev)}
            >
              {testPenaltyPreview ? "Hide Penalty" : "Test Penalty"}
            </button>
          </div>
        </div>
      )}

      {/* Goal celebration overlay */}
      {goalCelebration && (
        <GoalCelebration
          visible={goalCelebration.visible}
          teamAbbr={goalCelebration.teamAbbr}
          teamColor={TEAM_COLORS[goalCelebration.teamAbbr] || "#ffffff"}
          teamName={goalCelebration.teamName}
          onDone={() => setGoalCelebration(null)}
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
