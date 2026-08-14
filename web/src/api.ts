import type { EnrollmentSession, ModelReliabilityRow, StaffUser, WifiProfile, GmailAccount } from "./types";

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
  login: (email: string, password: string, rememberMe?: boolean) =>
    request<{ id: string; email: string; role: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe }),
    }),
  register: (email: string, password: string) =>
    request<{ ok: true }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ id: string; email: string; role: string }>("/api/auth/me"),

  listUsers: () => request<StaffUser[]>("/api/users"),
  updateUser: (id: string, input: { status?: string; role?: string }) =>
    request<StaffUser>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: "DELETE" }),
  getAutoApprove: () => request<{ enabled: boolean }>("/api/users/settings/auto-approve"),
  setAutoApprove: (enabled: boolean) =>
    request<{ enabled: boolean }>("/api/users/settings/auto-approve", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),

  listSessions: (status?: string) =>
    request<EnrollmentSession[]>(`/api/sessions${status ? `?status=${status}` : ""}`),
  getSession: (id: string) => request<EnrollmentSession>(`/api/sessions/${id}`),
  createSession: (input: {
    wifiSsid?: string;
    wifiPassword?: string;
    wifiSecurityType?: string;
    locale?: string;
    note?: string;
    count?: number;
  }) =>
    request<{ sessions: { id: string; token: string; status: string; expiresAt: string; qrPngUrl: string }[] }>(
      "/api/sessions",
      { method: "POST", body: JSON.stringify(input) },
    ),
  revokeSession: (id: string) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  bulkDeleteSessions: (ids: string[]) =>
    request<{ deleted: number }>("/api/sessions/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  modelReliability: () => request<ModelReliabilityRow[]>("/api/sessions/reports/model-reliability"),

  listWifiProfiles: () => request<WifiProfile[]>("/api/wifi-profiles"),
  createWifiProfile: (input: { label: string; ssid: string; password?: string; securityType?: string }) =>
    request<WifiProfile>("/api/wifi-profiles", { method: "POST", body: JSON.stringify(input) }),
  deleteWifiProfile: (id: string) => request<void>(`/api/wifi-profiles/${id}`, { method: "DELETE" }),

  listGmailAccounts: () => request<GmailAccount[]>("/api/gmail-accounts"),
  bulkAddGmailAccounts: (raw: string) =>
    request<{ added: number; skipped: number }>("/api/gmail-accounts/bulk-add", {
      method: "POST",
      body: JSON.stringify({ raw }),
    }),
  bulkDeleteGmailAccounts: (ids: string[]) =>
    request<{ deleted: number }>("/api/gmail-accounts/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
};
