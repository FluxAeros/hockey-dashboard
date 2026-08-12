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

export const TEAM_COLORS: Record<string, string> = {
  ANA: "#F47A38", BOS: "#FFB81C", BUF: "#002654", CGY: "#C8102E",
  CAR: "#CE1126", CHI: "#CF0A2C", COL: "#6F263D", CBJ: "#002654",
  DAL: "#006847", DET: "#CE1126", EDM: "#FF4C00", FLA: "#C8102E",
  LAK: "#111111", MIN: "#154734", MTL: "#AF1E2D", NSH: "#FFB81C",
  NJD: "#CE1126", NYI: "#00539B", NYR: "#0038A8", OTT: "#C52032",
  PHI: "#F74902", PIT: "#FCB514", SJS: "#006D75", SEA: "#99D9D9",
  STL: "#002F87", TBL: "#002868", TOR: "#00205B", VAN: "#00205B",
  VGK: "#B4975A", WSH: "#C8102E", WPG: "#041E42", UTA: "#71AFE5"
};

export function formatTOI(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
