import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE } from "../utils/api";
import { useAuth } from "../context/AuthContext";

function getSessionId(): string {
  let id = sessionStorage.getItem("cs_session_id");
  if (!id) {
    id = "sess_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
    sessionStorage.setItem("cs_session_id", id);
  }
  return id;
}

function getDeviceType(): string {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function useTelemetry() {
  const location = useLocation();
  const { token } = useAuth();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    const currentPath = location.pathname + location.search;
    if (lastPathRef.current === currentPath) return;
    lastPathRef.current = currentPath;

    const sessionId = getSessionId();
    const deviceType = getDeviceType();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    fetch(`${API_BASE}/telemetry/pageview`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        path: currentPath,
        referrer: document.referrer || null,
        session_id: sessionId,
        device_type: deviceType,
      }),
    }).catch(() => {
      // Telemetry errors should fail silently without interrupting the user
    });
  }, [location.pathname, location.search, token]);
}
