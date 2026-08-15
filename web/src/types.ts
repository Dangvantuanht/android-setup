export type SessionStatus = "PENDING" | "ENROLLED" | "EXPIRED" | "REVOKED" | "FAILED";

export type EnrollmentEvent = {
  id: string;
  type: string;
  payloadJson: string | null;
  createdAt: string;
};

export type DeviceLog = {
  id: string;
  source: string;
  level: string;
  message: string;
  createdAt: string;
};

export type EnrollmentSession = {
  id: string;
  status: SessionStatus;
  wifiSsid: string | null;
  locale: string;
  timezone: string | null;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  enrolledAt: string | null;
  downloadedAt: string | null;
  deviceModel: string | null;
  androidRelease: string | null;
  apkVersion: string | null;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  events?: EnrollmentEvent[];
  createdByStaffId: string | null;
  createdBy: { id: string; email: string } | null;
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
  qrQuota: number | null;
  qrUsed: number;
};

export type QrUsage = {
  used: number;
  quota: number | null;
};

export type WifiProfile = {
  id: string;
  label: string;
  ssid: string;
  password: string | null;
  securityType: string;
  createdAt: string;
};

export type GmailAccountStatus = "AVAILABLE" | "ASSIGNED" | "FAILED";

export type GmailAccount = {
  id: string;
  email: string;
  password: string;
  status: GmailAccountStatus;
  ownerStaffId: string | null;
  owner: { id: string; email: string } | null;
  assignedToSessionId: string | null;
  assignedToSession: { id: string; note: string | null; deviceModel: string | null } | null;
  assignedToClaimCodeId: string | null;
  assignedToClaimCode: { id: string; code: string; note: string | null } | null;
  assignedAt: string | null;
  note: string | null;
  createdAt: string;
};

export type ClaimCodeStatus = "PENDING" | "CLAIMED" | "EXPIRED" | "REVOKED";

export type ManualClaimCode = {
  id: string;
  code: string;
  status: ClaimCodeStatus;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  createdByStaffId: string | null;
  createdBy: { id: string; email: string } | null;
  gmailAccounts: { email: string; status: GmailAccountStatus }[];
};

export type TargetApp = {
  id: string;
  packageName: string;
  label: string;
  enabled: boolean;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  staffId: string | null;
  staff: { id: string; email: string } | null;
  action: string;
  detail: string | null;
  createdAt: string;
};
