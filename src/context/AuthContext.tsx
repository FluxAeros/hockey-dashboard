import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from "react";
import { API_BASE } from "../utils/api";
import type { User } from "../types";

export type { User };

interface AuthContextType {
  user: User | null;
  token: string | null;
  favorites: string[];
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalTab: "login" | "register";
  isFeedbackModalOpen: boolean;
  openAuthModal: (tab?: "login" | "register") => void;
  closeAuthModal: () => void;
  openFeedbackModal: () => void;
  closeFeedbackModal: () => void;
  login: (username_or_email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  toggleFavorite: (teamAbbrev: string) => Promise<void>;
  isFavorite: (teamAbbrev: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "chelstatz_jwt_token";
const USER_KEY = "chelstatz_user";
const LOCAL_FAVORITES_KEY = "chelstatz_local_favorites";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (user?.favorites) return user.favorites;
    const local = localStorage.getItem(LOCAL_FAVORITES_KEY);
    return local ? JSON.parse(local) : [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login");
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);

  // Fetch current user and favorites on startup if token exists
  const loadUser = useCallback(async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        if (Array.isArray(data.user.favorites)) {
          setFavorites(data.user.favorites);
        }
      } else {
        // Token expired or invalid
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadUser(token);
    } else {
      setIsLoading(false);
    }
  }, [token, loadUser]);

  const openAuthModal = (tab: "login" | "register" = "login") => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const openFeedbackModal = () => {
    setIsFeedbackModalOpen(true);
  };

  const closeFeedbackModal = () => {
    setIsFeedbackModalOpen(false);
  };

  const login = async (username_or_email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username_or_email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Invalid login credentials.");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    setFavorites(data.user.favorites || []);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    closeAuthModal();
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Registration failed" }));
      throw new Error(err.detail || "Registration error occurred.");
    }

    const data = await res.json();
    setToken(data.token);
    setUser(data.user);
    setFavorites(data.user.favorites || []);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    // If local favorites existed prior to register, sync them to the backend
    const localFavs = localStorage.getItem(LOCAL_FAVORITES_KEY);
    if (localFavs) {
      try {
        const parsed: string[] = JSON.parse(localFavs);
        if (parsed.length > 0) {
          const syncRes = await fetch(`${API_BASE}/user/favorites`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.token}`,
            },
            body: JSON.stringify({ team_abbrevs: parsed }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            setFavorites(syncData.favorites);
          }
        }
      } catch {}
    }

    closeAuthModal();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const toggleFavorite = async (teamAbbrev: string) => {
    const upper = teamAbbrev.toUpperCase();
    const isFav = favorites.includes(upper);
    const updated = isFav ? favorites.filter((f) => f !== upper) : [...favorites, upper];
    
    // Optimistic UI update
    setFavorites(updated);
    setUser((prev) => (prev ? { ...prev, favorites: updated } : prev));
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(updated));

    if (token) {
      try {
        const res = await fetch(`${API_BASE}/user/favorites/toggle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ team_abbrev: upper }),
        });
        if (res.ok) {
          const data = await res.json();
          setFavorites(data.favorites);
          setUser((prev) => (prev ? { ...prev, favorites: data.favorites } : prev));
          return;
        }
      } catch (e) {
        console.error("Failed to sync favorite toggle with backend", e);
      }
    }
  };

  const isFavorite = (teamAbbrev: string) => {
    return favorites.includes(teamAbbrev?.toUpperCase());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        favorites,
        isLoading,
        isAuthModalOpen,
        authModalTab,
        isFeedbackModalOpen,
        openAuthModal,
        closeAuthModal,
        openFeedbackModal,
        closeFeedbackModal,
        login,
        register,
        logout,
        toggleFavorite,
        isFavorite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
