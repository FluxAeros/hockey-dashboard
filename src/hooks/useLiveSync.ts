import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE } from "../utils/api";
import type { NHLGame, Shot, TimeoutsInfo, PowerPlayInfo } from "../types";

export interface GameLivePayload {
  shots: Shot[];
  winProbability?: { homeProb: number; awayProb: number } | null;
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
    maxRegulationPeriods?: number;
  };
  timeouts?: TimeoutsInfo | null;
  powerPlay?: PowerPlayInfo | null;
  boxscore?: {
    homeTeam?: { id: number; abbrev: string; name?: { default: string }; score?: number; sog?: number };
    awayTeam?: { id: number; abbrev: string; name?: { default: string }; score?: number; sog?: number };
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
      maxRegulationPeriods?: number;
    };
  };
}

interface UseLiveSyncOptions {
  date: string;
  gameId: number | string | null;
  onScheduleUpdate?: (games: NHLGame[]) => void;
  onGameUpdate?: (payload: GameLivePayload) => void;
  enabled?: boolean;
}

export function useLiveSync({
  date,
  gameId,
  onScheduleUpdate,
  onGameUpdate,
  enabled = true,
}: UseLiveSyncOptions) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Keep latest callbacks in refs to avoid reconnection loops
  const onScheduleUpdateRef = useRef(onScheduleUpdate);
  onScheduleUpdateRef.current = onScheduleUpdate;

  const onGameUpdateRef = useRef(onGameUpdate);
  onGameUpdateRef.current = onGameUpdate;

  const dateRef = useRef(date);
  dateRef.current = date;

  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  const sendSubscription = useCallback((gid: number | string | null, d: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "subscribe",
          gameId: gid ? String(gid) : null,
          date: d,
        })
      );
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;

    // Prevent reconnect storms: if socket is already open or currently connecting, do not re-create
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
       socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (socketRef.current) {
      const oldWs = socketRef.current;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      oldWs.onopen = null;
      try {
        oldWs.close();
      } catch {
        // ignore close errors
      }
      socketRef.current = null;
    }

    try {
      const wsUrl = `${WS_BASE}/ws/live`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current || ws !== socketRef.current) return;
        setIsConnected(true);
        setIsReconnecting(false);
        retryCountRef.current = 0;
        // Send initial subscription
        sendSubscription(gameIdRef.current, dateRef.current);

        // Setup ping keepalive
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current || ws !== socketRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "schedule_update" && msg.games) {
            if (msg.date === dateRef.current && onScheduleUpdateRef.current) {
              onScheduleUpdateRef.current(msg.games);
              setLastSyncTime(new Date());
            }
          } else if (msg.type === "game_update" && msg.data) {
            if (
              gameIdRef.current &&
              String(msg.gameId) === String(gameIdRef.current) &&
              onGameUpdateRef.current
            ) {
              onGameUpdateRef.current(msg.data);
              setLastSyncTime(new Date());
            }
          }
        } catch (err) {
          console.warn("WebSocket parse error:", err);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current || ws !== socketRef.current) return;
        setIsConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Schedule reconnection with backoff (2s, 4s, 8s, max 10s)
        const delay = Math.min(2000 * Math.pow(1.5, retryCountRef.current), 10000);
        retryCountRef.current += 1;
        setIsReconnecting(true);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && enabled) {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        // ws.onclose will be called right after onerror
      };
    } catch (err) {
      console.warn("WebSocket connect error:", err);
      setIsConnected(false);
    }
  }, [enabled, sendSubscription]);

  // Connect on mount or enabled change
  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) {
        const ws = socketRef.current;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Send subscription update when date or gameId changes
  useEffect(() => {
    sendSubscription(gameId, date);
  }, [gameId, date, sendSubscription]);

  return {
    isConnected,
    isReconnecting,
    lastSyncTime,
  };
}
