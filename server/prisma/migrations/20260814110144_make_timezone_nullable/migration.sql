-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EnrollmentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "wifiSsid" TEXT,
    "wifiPassword" TEXT,
    "wifiSecurityType" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'vi_VN',
    "timezone" TEXT,
    "note" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "enrolledAt" DATETIME,
    "downloadedAt" DATETIME,
    "deviceModel" TEXT,
    "androidRelease" TEXT,
    "apkVersion" TEXT,
    "batteryLevel" INTEGER,
    "lastSeenAt" DATETIME,
    CONSTRAINT "EnrollmentSession_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EnrollmentSession" ("androidRelease", "apkVersion", "batteryLevel", "createdAt", "createdByStaffId", "deviceModel", "downloadedAt", "enrolledAt", "expiresAt", "id", "lastSeenAt", "locale", "note", "status", "timezone", "token", "wifiPassword", "wifiSecurityType", "wifiSsid") SELECT "androidRelease", "apkVersion", "batteryLevel", "createdAt", "createdByStaffId", "deviceModel", "downloadedAt", "enrolledAt", "expiresAt", "id", "lastSeenAt", "locale", "note", "status", "timezone", "token", "wifiPassword", "wifiSecurityType", "wifiSsid" FROM "EnrollmentSession";
DROP TABLE "EnrollmentSession";
ALTER TABLE "new_EnrollmentSession" RENAME TO "EnrollmentSession";
CREATE UNIQUE INDEX "EnrollmentSession_token_key" ON "EnrollmentSession"("token");
CREATE INDEX "EnrollmentSession_status_idx" ON "EnrollmentSession"("status");
CREATE INDEX "EnrollmentSession_expiresAt_idx" ON "EnrollmentSession"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
