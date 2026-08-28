import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BetaBanner } from "../components/BetaBanner";
import { useTelemetry } from "../hooks/useTelemetry";

export function AppLayout() {
  // Automatically track route navigation for real-time admin analytics
  useTelemetry();

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-viewport">
        <BetaBanner />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
