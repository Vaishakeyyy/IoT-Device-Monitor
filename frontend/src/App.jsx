import { useState } from "react";
import { WsProvider } from "./context/WsContext";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/DevicesPage";
import AlertsPage from "./pages/AlertsPage";
import DeviceDetail from "./pages/DeviceDetail";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedDevice, setSelectedDevice] = useState(null);

  const navigate = (p, data) => { setPage(p); if (data) setSelectedDevice(data); };

  return (
    <WsProvider>
      <div className="app">
        <Sidebar page={page} navigate={navigate} />
        <main className="main-content">
          {page === "dashboard" && <Dashboard navigate={navigate} />}
          {page === "devices" && <DevicesPage navigate={navigate} />}
          {page === "device-detail" && <DeviceDetail device={selectedDevice} navigate={navigate} />}
          {page === "alerts" && <AlertsPage />}
        </main>
      </div>
    </WsProvider>
  );
}

function Sidebar({ page, navigate }) {
  const nav = [
    { id: "dashboard", icon: "⬡", label: "Dashboard" },
    { id: "devices", icon: "◈", label: "Devices" },
    { id: "alerts", icon: "△", label: "Alerts" },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⬡</span>
        <div>
          <div className="logo-title">IoT<span>Monitor</span></div>
          <div className="logo-sub">NEXUS PLATFORM</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {nav.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => navigate(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="version-tag">v1.0.0 • NEXUS</div>
      </div>
    </aside>
  );
}
