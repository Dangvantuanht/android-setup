-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StaffUser" ("createdAt", "email", "id", "passwordHash", "role") SELECT "createdAt", "email", "id", "passwordHash", "role" FROM "StaffUser";
DROP TABLE "StaffUser";
ALTER TABLE "new_StaffUser" RENAME TO "StaffUser";
-- Pre-existing accounts (seeded via CLI before self-registration existed)
-- were already trusted; only new self-registrations should start PENDING.
UPDATE "StaffUser" SET "status" = 'APPROVED';
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
