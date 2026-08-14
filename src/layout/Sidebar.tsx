import { NavLink } from "react-router-dom";
import { Activity, Calendar, Trophy, Users, LogIn, LogOut, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const NAV_LINKS = [
  { to: "/", icon: Activity, label: "Live" },
  { to: "/schedule", icon: Calendar, label: "Schedule" },
  { to: "/standings", icon: Trophy, label: "Standings" },
  { to: "/teams", icon: Users, label: "Teams" },
];

export function Sidebar() {
  const isMobile = useMobile();
  const { user, favorites, openAuthModal, logout } = useAuth();

  if (isMobile) {
    return (
      <nav className="bottom-nav">
        {NAV_LINKS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `bottom-nav-link${isActive ? " active" : ""}`}
          >
            <Icon size={22} />
            <span className="bottom-nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img
          src="/images/logo.png"
          alt="Chel Statz"
          className="brand-logo"
        />
      </div>
      
      <nav className="sidebar-nav">
        {NAV_LINKS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon className="nav-icon" />
            <span className="nav-text">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user ? (
          <div className="user-profile-badge">
            <div className="user-avatar-circle">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info-text">
              <span className="user-name-label">{user.username}</span>
              <span className="user-favs-count">
                <Star size={11} className="fill-amber text-amber" />
                {favorites.length} followed
              </span>
            </div>
            <button
              className="user-logout-btn"
              onClick={logout}
              title="Log Out"
              aria-label="Log Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button className="nav-link auth-login-trigger" onClick={() => openAuthModal("login")}>
            <LogIn className="nav-icon" />
            <span className="nav-text">Sign In / Register</span>
          </button>
        )}
      </div>
    </aside>
  );
}
