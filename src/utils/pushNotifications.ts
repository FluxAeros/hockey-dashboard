import { API_BASE } from "./api";

export interface PushStatus {
  supported: boolean;
  needsIosInstall: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isIosDevice(): boolean {
  const ua = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone)
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  const iosNeedsInstall = isIosDevice() && !isStandalonePwa();
  const hasApis = "serviceWorker" in navigator && "Notification" in window;

  if (!hasApis) {
    return {
      supported: false,
      needsIosInstall: iosNeedsInstall,
      permission: "unsupported",
      subscribed: false,
    };
  }

  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (reg && "pushManager" in reg) {
      const sub = await reg.pushManager.getSubscription();
      subscribed = Boolean(sub);
    }
  } catch {
    subscribed = false;
  }

  // Also allow local-notification fallback flag when backend VAPID isn't configured yet
  const localEnabled = localStorage.getItem("chelstatz_goal_alerts_enabled") === "true";

  return {
    supported: true,
    needsIosInstall: iosNeedsInstall,
    permission: Notification.permission,
    subscribed: subscribed || (Notification.permission === "granted" && localEnabled),
  };
}

export async function subscribeToGoalAlerts(teams: string[]): Promise<{ ok: boolean; mode: "webpush" | "local"; message: string }> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, mode: "local", message: "Notifications are not supported in this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, mode: "local", message: "Notification permission was denied." };
  }

  const reg = (await navigator.serviceWorker.getRegistration("/sw.js")) || (await registerServiceWorker());
  if (!reg) {
    return { ok: false, mode: "local", message: "Could not register service worker." };
  }

  localStorage.setItem("chelstatz_goal_alerts_enabled", "true");

  // Attempt full Web Push subscription via backend VAPID key
  try {
    const keyRes = await fetch(`${API_BASE}/push/vapid-public-key`);
    if (keyRes.ok) {
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (publicKey && "pushManager" in reg) {
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        }

        const token = localStorage.getItem("chelstatz_jwt_token");
        await fetch(`${API_BASE}/push/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            teams,
          }),
        });

        return { ok: true, mode: "webpush", message: "Goal alerts enabled (Web Push active)." };
      }
    }
  } catch (err) {
    console.warn("Web Push subscription fell back to local alerts:", err);
  }

  return { ok: true, mode: "local", message: "Goal alerts enabled (browser notifications active)." };
}

export async function unsubscribeFromGoalAlerts(): Promise<void> {
  localStorage.removeItem("chelstatz_goal_alerts_enabled");
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg && "pushManager" in reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(`${API_BASE}/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("Error unsubscribing from goal alerts:", err);
  }
}

export async function sendTestGoalNotification(): Promise<{ ok: boolean; message: string }> {
  const reg = (await navigator.serviceWorker.getRegistration("/sw.js")) || (await registerServiceWorker());
  if (!reg) {
    return { ok: false, message: "Service worker not registered." };
  }

  // Try server-side Web Push first if subscribed
  try {
    const sub = "pushManager" in reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const res = await fetch(`${API_BASE}/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (res.ok) {
        return { ok: true, message: "Test goal push sent from server!" };
      }
    }
  } catch {
    // Fall back to direct Service Worker notification
  }

  if (Notification.permission === "granted") {
    await reg.showNotification("🚨 GOAL! Colorado Avalanche", {
      body: "COL 3 – 2 DAL · 2nd Period 08:14",
      icon: "/pwa-192x192.png",
      badge: "/favicon-32x32.png",
      tag: "chelstatz-test-goal",
      data: { url: "/" },
    });
    return { ok: true, message: "Test goal notification sent!" };
  }

  return { ok: false, message: "Enable goal alerts first to send a test notification." };
}
