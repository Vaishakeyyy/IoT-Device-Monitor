import { createContext, useContext, useState, useEffect } from "react";

const SAMPLE_USERS = [
  { username: "admin", password: "adminpass", role: "admin" },
  { username: "alice", password: "alicepass", role: "user" }
];

const SAMPLE_ASSIGNMENTS = { "DEV-001": "alice" };

const AuthContext = createContext(null);

function normalizeUsers(users) {
  if (!Array.isArray(users)) return SAMPLE_USERS.slice();
  const normalized = users
    .filter(Boolean)
    .map((user) => ({
      username: String(user.username || "").trim(),
      password: String(user.password || "").trim(),
      role: user.role || "user"
    }))
    .filter((user) => user.username && user.password);

  SAMPLE_USERS.forEach((sample) => {
    if (!normalized.some((u) => u.username === sample.username)) {
      normalized.unshift(sample);
    }
  });

  return normalized.length ? normalized : SAMPLE_USERS.slice();
}

function seedSampleData() {
  let users = SAMPLE_USERS.slice();

  try {
    const raw = localStorage.getItem("iot-users");
    if (raw) {
      users = normalizeUsers(JSON.parse(raw));
    }
  } catch (e) {
    users = SAMPLE_USERS.slice();
  }

  localStorage.setItem("iot-users", JSON.stringify(users));
  if (!localStorage.getItem("iot-assignments")) {
    localStorage.setItem("iot-assignments", JSON.stringify(SAMPLE_ASSIGNMENTS));
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      seedSampleData();
      const raw = localStorage.getItem("iot-user");
      return raw ? JSON.parse(raw) : { username: "guest", role: "user" };
    } catch (e) {
      return { username: "guest", role: "user" };
    }
  });

  useEffect(() => {
    try { localStorage.setItem("iot-user", JSON.stringify(user)); } catch (e) {}
  }, [user]);

  const loginAs = (role, username = role === "admin" ? "admin" : "user") => setUser({ username, role });
  const logout = () => setUser({ username: "guest", role: "user" });

  const login = (username, password) => {
    try {
      seedSampleData();
      const users = normalizeUsers(JSON.parse(localStorage.getItem("iot-users") || "[]"));
      const found = users.find((u) => u.username === username && u.password === password);
      if (found) {
        const nextUser = { username: found.username, role: found.role };
        try { localStorage.setItem("iot-user", JSON.stringify(nextUser)); } catch (e) {}
        setUser(nextUser);
        return { success: true, role: found.role };
      }
      return { success: false, error: "Invalid credentials" };
    } catch (e) {
      seedSampleData();
      return { success: false, error: "Invalid credentials" };
    }
  };

  useEffect(() => {
    try { window.__auth_login = login; } catch (e) {}
    return () => { try { delete window.__auth_login; } catch (e) {} };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loginAs, logout, setUser, login }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
