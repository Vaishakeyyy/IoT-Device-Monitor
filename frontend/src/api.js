const host = window.location.hostname || "localhost";
const port = 5000;
const protocol = window.location.protocol === "https:" ? "https" : "http";
const BASE = `${protocol}://${host}:${port}/api`;

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function roleHeader(role) {
  return role ? { "X-User-Role": role } : {};
}

export const api = {
  // Devices
  getDevices: () => request("/devices"),
  getDevice: (id) => request(`/devices/${id}`),
  addDevice: (body) => request("/devices", { method: "POST", body: JSON.stringify(body) }),
  updateDevice: (id, body) => request(`/devices/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteDevice: (id) => request(`/devices/${id}`, { method: "DELETE" }),
  getDeviceReadings: (id, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/devices/${id}/readings${q ? "?" + q : ""}`);
  },
  getDeviceLimits: (id) => request(`/devices/${id}/limits`),
  addDeviceLimit: (id, body, role) =>
    request(`/devices/${id}/limits`, { method: "POST", headers: roleHeader(role), body: JSON.stringify(body) }),
  updateDeviceLimit: (deviceId, limitId, body, role) =>
    request(`/devices/${deviceId}/limits/${limitId}`, { method: "PUT", headers: roleHeader(role), body: JSON.stringify(body) }),
  deleteDeviceLimit: (deviceId, limitId, role, changedBy) => {
    const q = changedBy ? `?changed_by=${encodeURIComponent(changedBy)}` : "";
    return request(`/devices/${deviceId}/limits/${limitId}${q}`, { method: "DELETE", headers: roleHeader(role) });
  },
  getDeviceLimitHistory: (id) => request(`/devices/${id}/limits/history`),

  // Readings
  postReading: (body) => request("/readings", { method: "POST", body: JSON.stringify(body) }),
  getStats: () => request("/readings/stats"),

  // Alerts
  getAlerts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/alerts${q ? "?" + q : ""}`);
  },
  createAlert: (body) => request("/alerts", { method: "POST", body: JSON.stringify(body) }),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: "PATCH" }),
  getSummary: () => request("/alerts/summary"),
  getNetwork: () => request("/network"),

  // ── Control ──────────────────────────────────────────────────────────────
  sendCommand: (deviceId, command, payload = {}, issued_by = "user") =>
    request(`/devices/${deviceId}/command`, { method: "POST", body: JSON.stringify({ command, payload, issued_by }) }),
  getCommandLogs: (deviceId, limit = 30) => request(`/devices/${deviceId}/commands?limit=${limit}`),
  getAllCommandLogs: () => request("/devices/commands/all"),
  pingDevice: (deviceId) => request(`/devices/${deviceId}/ping`, { method: "POST" }),
  getConnectionHistory: (deviceId) => request(`/devices/${deviceId}/connection-history`),
  getControlSummary: () => request("/control/summary"),

  // Users
  loginUser: (body) => request("/users/login", { method: "POST", body: JSON.stringify(body) }),
  getUsers: (role) => request("/users", { headers: roleHeader(role) }),
  addUser: (body, role) => request("/users", { method: "POST", headers: roleHeader(role), body: JSON.stringify(body) }),
  updateUser: (id, body, role) => request(`/users/${id}`, { method: "PUT", headers: roleHeader(role), body: JSON.stringify(body) }),
  deleteUser: (id, role) => request(`/users/${id}`, { method: "DELETE", headers: roleHeader(role) }),
};
