export function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Shift a YYYY-MM-DD string by `days` (positive = forward, negative = back). */
export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Format YYYY-MM-DD string into localized date without UTC midnight timezone rollback. */
export function formatLocalDateString(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, options || { weekday: "long", month: "short", day: "numeric" });
}

/**
 * Format game start time from UTC ISO string into localized time/date string.
 * Example: "7:00 PM" (if today) or "Oct 12 at 7:00 PM" (if another date).
 */
export function formatGameScheduleDateTime(startTimeUTC?: string): string {
  if (!startTimeUTC) return "";
  const date = new Date(startTimeUTC);
  if (isNaN(date.getTime())) return "";
  const isToday = date.toDateString() === new Date().toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) {
    return timeStr;
  }
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} at ${timeStr}`;
}

/**
 * Checks if a game is currently live and actively being played based on its game state and schedule time.
 */
export function isGameActiveLive(
  game?: { gameState?: string; startTimeUTC?: string } | null,
  currentGameState?: string
): boolean {
  if (!game) return false;
  const state = (currentGameState || game.gameState || "").toUpperCase();

  // Concluded/final game states are never live
  if (["OVER", "OFF", "FINAL"].includes(state)) {
    return false;
  }

  // Explicit in-progress live game states
  if (state === "LIVE" || state === "CRIT") {
    return true;
  }

  // If scheduled in the future, check against start time
  if (game.startTimeUTC) {
    const startTime = new Date(game.startTimeUTC).getTime();
    if (!isNaN(startTime) && Date.now() < startTime) {
      return false;
    }
  }

  // If state is explicitly FUT, it is not live
  if (state === "FUT") {
    return false;
  }

  return false;
}


export function xgToRadius(xg: number): number {
  return 1.5 + xg * 6;
}

export const STATE_LABELS: Record<string, string> = {
  FUT: "Scheduled",
  PRE: "Pre-game",
  LIVE: "Live",
  CRIT: "Live",
  OVER: "Final",
  OFF: "Final",
};

export const STATE_COLORS: Record<string, string> = {
  FUT: "#888780",
  PRE: "#BA7517",
  LIVE: "#E24B4A",
  CRIT: "#E24B4A",
  OVER: "#3B6D11",
  OFF: "#3B6D11",
};

function brightenHex(hex: string): string {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // Boost lightness if it's too dark for dark mode backgrounds
  if (l < 0.55) {
    l = 0.55; 
  }

  let r2, g2, b2;
  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1/3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hexStr = Math.round(x * 255).toString(16);
    return hexStr.length === 1 ? '0' + hexStr : hexStr;
  };

  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`.toUpperCase();
}

const RAW_TEAM_COLORS: Record<string, string> = {
  ANA: "#F47A38", BOS: "#FFB81C", BUF: "#002654", CGY: "#C8102E",
  CAR: "#CE1126", CHI: "#CF0A2C", COL: "#6F263D", CBJ: "#002654",
  DAL: "#006847", DET: "#CE1126", EDM: "#FF4C00", FLA: "#C8102E",
  LAK: "#111111", MIN: "#154734", MTL: "#AF1E2D", NSH: "#FFB81C",
  NJD: "#CE1126", NYI: "#00539B", NYR: "#0038A8", OTT: "#C52032",
  PHI: "#F74902", PIT: "#FCB514", SJS: "#006D75", SEA: "#99D9D9",
  STL: "#002F87", TBL: "#002868", TOR: "#00205B", VAN: "#00205B",
  VGK: "#B4975A", WSH: "#C8102E", WPG: "#041E42", UTA: "#71AFE5"
};

export const TEAM_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_TEAM_COLORS).map(([team, hex]) => [team, brightenHex(hex)])
);

export function formatTOI(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
