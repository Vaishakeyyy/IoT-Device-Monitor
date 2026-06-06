import { useEffect, useState } from "react";
import { WsProvider } from "./context/WsContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/DevicesPage";
import AlertsPage from "./pages/AlertsPage";
import DeviceDetail from "./pages/DeviceDetail";
import Admin from "./pages/Admin";
import UserPage from "./pages/UserPage";
import Login from "./pages/Login";
import "./App.css";

const getInitialTheme = () => {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("iot-theme");
  if (saved) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
};

export default function App() {
  return (
    <AuthProvider>
      <WsProvider>
        <AppShell />
      </WsProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { user } = useAuth();
  const [page, setPage] = useState(user?.username === "guest" ? "login" : "dashboard");
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

  useEffect(() => {
    if (user?.username === "guest" && page !== "login") {
      setPage("login");
    }
    if (page === "admin" && user?.role !== "admin") {
      setPage("dashboard");
    }
  }, [page, user]);

  const navigate = (p, data) => { setPage(p); if (data) setSelectedDevice(data); };

  return (
    <div className="app">
      <Sidebar page={page} navigate={navigate} theme={theme} setTheme={setTheme} online={online} />
      <main className="main-content">
        {page === "dashboard" && <Dashboard navigate={navigate} />}
        {page === "devices" && <DevicesPage navigate={navigate} />}
        {page === "device-detail" && <DeviceDetail device={selectedDevice} navigate={navigate} />}
        {page === "alerts" && <AlertsPage />}
        {page === "login" && <Login navigate={navigate} />}
        {page === "admin" && <Admin navigate={navigate} />}
        {page === "user" && <UserPage navigate={navigate} />}
      </main>
    </div>
  );
}

function Sidebar({ page, navigate, theme, setTheme, online }) {
  const { user, loginAs, logout } = useAuth();
  const nav = [
    { id: "dashboard", icon: "⬢", label: "Dashboard" },
    { id: "devices", icon: "⬡", label: "Devices" },
    { id: "alerts", icon: "⚠", label: "Alerts" },
  ];
  if (user?.role === "admin") nav.push({ id: "admin", icon: "❖ ", label: "Admin" });
  nav.push({ id: "user", icon: "🖧", label: "My Devices" });

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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>{user?.username} · {user?.role}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {user?.username === 'guest' ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('login')}>Login</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => { logout(); window.location.reload(); }}>Logout</button>
            )}
          </div>
        </div>
        <div className="version-tag">v1.0.0 • NEXUS</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Sample creds: admin/adminpass • alice/alicepass</div>
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
