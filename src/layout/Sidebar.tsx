import { NavLink } from "react-router-dom";
import { Activity, Calendar, Users, Settings } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Activity className="brand-icon" />
        <span className="brand-text">NHL xG</span>
      </div>
      
      <nav className="sidebar-nav">
        <NavLink 
          to="/" 
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Activity className="nav-icon" />
          <span className="nav-text">Live Tracker</span>
        </NavLink>
        
        <NavLink 
          to="/schedule" 
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Calendar className="nav-icon" />
          <span className="nav-text">Schedule</span>
        </NavLink>
        
        <NavLink 
          to="/teams" 
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Users className="nav-icon" />
          <span className="nav-text">Teams</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="nav-link">
          <Settings className="nav-icon" />
          <span className="nav-text">Settings</span>
        </button>
      </div>
    </aside>
  );
}
