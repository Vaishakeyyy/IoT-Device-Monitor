import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const SAMPLE_CREDENTIALS = [
  { username: "admin", password: "adminpass", label: "Admin user" },
  { username: "alice", password: "alicepass", label: "Regular user" }
];

export default function Login({ navigate }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(username, password);
      if (res && res.success) {
        navigate("dashboard");
      } else {
        setError(res?.error || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 460, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, padding: 20, borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,.08)", background: "var(--card)" }}>
        <h2 style={{ margin: 0, marginBottom: 8 }}>Sign in</h2>
        <p style={{ margin: 0, color: "var(--text3)" }}>Use one of the sample accounts below to log in.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Username</span>
          <input
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin or alice"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="adminpass or alicepass"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ whiteSpace: "nowrap", minWidth: 120, padding: "8px 12px" }}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {error && <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('dashboard')}>Back</button>
        </div>
      </form>

      <div style={{ padding: 18, borderRadius: 12, background: "var(--surface)" }}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>Sample login credentials</div>
        {SAMPLE_CREDENTIALS.map((cred) => (
          <div key={cred.username} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span>{cred.label}</span>
            <span style={{ color: "var(--text3)", fontFamily: "var(--mono)" }}>{cred.username}/{cred.password}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
