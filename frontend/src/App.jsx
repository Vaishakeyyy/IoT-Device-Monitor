import { useEffect, useState } from "react";
import { WsProvider } from "./context/WsContext";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/DevicesPage";
import AlertsPage from "./pages/AlertsPage";
import DeviceDetail from "./pages/DeviceDetail";
import "./App.css";

const getInitialTheme = () => {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("iot-theme");
  if (saved) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("iot-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const navigate = (p, data) => { setPage(p); if (data) setSelectedDevice(data); };

  return (
    <WsProvider>
      <div className="app">
        <Sidebar page={page} navigate={navigate} theme={theme} setTheme={setTheme} online={online} />
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

function Sidebar({ page, navigate, theme, setTheme, online }) {
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
        <div className="footer-actions">
          <div className={`net-status ${online ? "online" : "offline"}`}>
            <span className="net-dot" />
            {online ? "Wi-Fi Ready" : "Offline"}
          </div>
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
        <div className="version-tag">v1.0.0 • NEXUS</div>
      </div>
    </aside>
  );
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}> 
      <span>{theme === "dark" ? "🌙" : "☀️"}</span>
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
