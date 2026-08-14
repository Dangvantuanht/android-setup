-- CreateTable
CREATE TABLE "ManualClaimCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "claimedAt" DATETIME,
    CONSTRAINT "ManualClaimCode_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TargetApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "assignedToSessionId" TEXT,
    "assignedToClaimCodeId" TEXT,
    "assignedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailAccount_assignedToSessionId_fkey" FOREIGN KEY ("assignedToSessionId") REFERENCES "EnrollmentSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GmailAccount_assignedToClaimCodeId_fkey" FOREIGN KEY ("assignedToClaimCodeId") REFERENCES "ManualClaimCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GmailAccount" ("assignedAt", "assignedToSessionId", "createdAt", "email", "id", "note", "password", "status") SELECT "assignedAt", "assignedToSessionId", "createdAt", "email", "id", "note", "password", "status" FROM "GmailAccount";
DROP TABLE "GmailAccount";
ALTER TABLE "new_GmailAccount" RENAME TO "GmailAccount";
CREATE UNIQUE INDEX "GmailAccount_email_key" ON "GmailAccount"("email");
CREATE INDEX "GmailAccount_status_idx" ON "GmailAccount"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ManualClaimCode_code_key" ON "ManualClaimCode"("code");

-- CreateIndex
CREATE INDEX "ManualClaimCode_status_idx" ON "ManualClaimCode"("status");

-- CreateIndex
CREATE INDEX "ManualClaimCode_expiresAt_idx" ON "ManualClaimCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TargetApp_packageName_key" ON "TargetApp"("packageName");
