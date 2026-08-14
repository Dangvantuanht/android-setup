-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "ownerStaffId" TEXT,
    "assignedToSessionId" TEXT,
    "assignedToClaimCodeId" TEXT,
    "assignedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailAccount_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GmailAccount_assignedToSessionId_fkey" FOREIGN KEY ("assignedToSessionId") REFERENCES "EnrollmentSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GmailAccount_assignedToClaimCodeId_fkey" FOREIGN KEY ("assignedToClaimCodeId") REFERENCES "ManualClaimCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GmailAccount" ("assignedAt", "assignedToClaimCodeId", "assignedToSessionId", "createdAt", "email", "id", "note", "password", "status") SELECT "assignedAt", "assignedToClaimCodeId", "assignedToSessionId", "createdAt", "email", "id", "note", "password", "status" FROM "GmailAccount";
DROP TABLE "GmailAccount";
ALTER TABLE "new_GmailAccount" RENAME TO "GmailAccount";
CREATE UNIQUE INDEX "GmailAccount_email_key" ON "GmailAccount"("email");
CREATE INDEX "GmailAccount_status_idx" ON "GmailAccount"("status");
CREATE INDEX "GmailAccount_ownerStaffId_idx" ON "GmailAccount"("ownerStaffId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
