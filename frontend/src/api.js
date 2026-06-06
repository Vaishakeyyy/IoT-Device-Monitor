const BASE = "http://10.150.253.172:5000/api";
async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
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
};
