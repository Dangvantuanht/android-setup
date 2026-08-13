// SQLite/Prisma has no native enum support, so these are stored as plain
// strings in the DB and validated at the application boundary via these unions.
export type SessionStatus = "PENDING" | "ENROLLED" | "EXPIRED" | "REVOKED" | "FAILED";

export type EventType = "QR_GENERATED" | "CALLBACK_OK" | "CALLBACK_REJECTED" | "EXPIRED" | "REVOKED";
