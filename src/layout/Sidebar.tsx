import { NavLink } from "react-router-dom";
import { Activity, Calendar, Trophy, Users, LogIn, Star, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { BetaBadge } from "../components/BetaBadge";

function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

const BASE_NAV_LINKS = [
  { to: "/", icon: Activity, label: "Live" },
  { to: "/schedule", icon: Calendar, label: "Schedule" },
  { to: "/standings", icon: Trophy, label: "Standings" },
  { to: "/teams", icon: Users, label: "Teams" },
];

export function Sidebar() {
  const isMobile = useMobile();
  const { user, favorites, openAuthModal } = useAuth();

  const sidebarNavLinks = user?.is_admin
    ? [...BASE_NAV_LINKS, { to: "/admin", icon: ShieldCheck, label: "Admin" }]
    : BASE_NAV_LINKS;

  const handleNavClick = (to: string) => {
    if (to === "/") {
      window.dispatchEvent(new CustomEvent("chelstatz:reset-live"));
    }
  };

  if (isMobile) {
    return (
      <nav className="bottom-nav" aria-label="Primary navigation">
        {BASE_NAV_LINKS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => handleNavClick(to)}
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
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <img
          src="/images/logo.png"
          alt="Chel Statz"
          className="brand-logo"
        />
        <BetaBadge />
      </div>
      
      <nav className="sidebar-nav">
        {sidebarNavLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => handleNavClick(to)}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon className="nav-icon" />
            <span className="nav-text">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user ? (
          <NavLink
            to="/profile"
            className={({ isActive }) => `user-profile-badge${isActive ? " active" : ""}`}
            title={`Profile (${user.username})`}
            aria-label={`Profile (${user.username})`}
          >
            <div className="user-avatar-circle">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info-text">
              <span className="user-name-label">
                {user.username}
                {user.is_admin && <span className="user-admin-indicator">ADM</span>}
              </span>
              <span className="user-favs-count">
                <Star size={11} className="fill-amber text-amber" />
                {favorites.length} followed
              </span>
            </div>
          </NavLink>
        ) : (
          <button className="nav-link auth-login-trigger" onClick={() => openAuthModal("login")} title="Sign In / Register">
            <LogIn className="nav-icon" />
            <span className="nav-text nav-text-desktop">Sign In / Register</span>
            <span className="nav-text nav-text-rail">Sign In</span>
          </button>
        )}
      </div>
    </aside>
  );
}
