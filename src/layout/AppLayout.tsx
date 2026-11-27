import { Outlet, NavLink } from "react-router-dom";
import { User } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BetaBanner } from "../components/BetaBanner";
import { useTelemetry } from "../hooks/useTelemetry";
import { useAuth } from "../context/AuthContext";

export function AppLayout() {
  // Automatically track route navigation for real-time admin analytics
  useTelemetry();
  const { user } = useAuth();

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-viewport">
        <BetaBanner />
        <NavLink
          to="/profile"
          className={({ isActive }) => `mobile-profile-btn${isActive ? " active" : ""}`}
          aria-label={user ? `Profile (${user.username})` : "Profile & Sign In"}
          title={user ? `Profile (${user.username})` : "Profile & Sign In"}
        >
          {user ? (
            <span className="mobile-profile-initial">
              {user.username.charAt(0).toUpperCase()}
            </span>
          ) : (
            <User size={19} />
          )}
        </NavLink>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
