import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
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

  return (
    <AuthContext.Provider value={{ user, loginAs, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
