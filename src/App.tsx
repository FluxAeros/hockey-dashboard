import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Schedule from "./pages/Schedule";
import Teams from "./pages/Teams";
import Standings from "./pages/Standings";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/teams" element={<Teams />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}