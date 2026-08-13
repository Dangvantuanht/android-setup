import type { EnrollmentSession, ModelReliabilityRow } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; email: string }>("/api/auth/me"),

  listSessions: (status?: string) =>
    request<EnrollmentSession[]>(`/api/sessions${status ? `?status=${status}` : ""}`),
  getSession: (id: string) => request<EnrollmentSession>(`/api/sessions/${id}`),
  createSession: (input: {
    wifiSsid?: string;
    wifiPassword?: string;
    wifiSecurityType?: string;
    locale?: string;
    note?: string;
  }) =>
    request<{ id: string; token: string; status: string; expiresAt: string; qrPngUrl: string }>(
      "/api/sessions",
      { method: "POST", body: JSON.stringify(input) },
    ),
  revokeSession: (id: string) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  modelReliability: () => request<ModelReliabilityRow[]>("/api/sessions/reports/model-reliability"),
};
