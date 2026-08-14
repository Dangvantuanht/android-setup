export type SessionStatus = "PENDING" | "ENROLLED" | "EXPIRED" | "REVOKED" | "FAILED";

export type EnrollmentEvent = {
  id: string;
  type: string;
  payloadJson: string | null;
  createdAt: string;
};

export type EnrollmentSession = {
  id: string;
  status: SessionStatus;
  wifiSsid: string | null;
  locale: string;
  timezone: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  enrolledAt: string | null;
  deviceModel: string | null;
  androidRelease: string | null;
  apkVersion: string | null;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  events?: EnrollmentEvent[];
};

export type ModelReliabilityRow = {
  model: string;
  total: number;
  enrolled: number;
  failed: number;
};

export type UserStatus = "PENDING" | "APPROVED" | "REJECTED";
export type UserRole = "staff" | "admin";

export type StaffUser = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastSeenAt: string | null;
  createdAt: string;
};
