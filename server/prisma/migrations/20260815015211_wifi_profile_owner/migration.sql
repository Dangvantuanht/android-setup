-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WifiProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "ssid" TEXT NOT NULL,
    "password" TEXT,
    "securityType" TEXT NOT NULL DEFAULT 'WPA',
    "ownerStaffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WifiProfile_ownerStaffId_fkey" FOREIGN KEY ("ownerStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WifiProfile" ("createdAt", "id", "label", "password", "securityType", "ssid") SELECT "createdAt", "id", "label", "password", "securityType", "ssid" FROM "WifiProfile";
DROP TABLE "WifiProfile";
ALTER TABLE "new_WifiProfile" RENAME TO "WifiProfile";
CREATE INDEX "WifiProfile_ownerStaffId_idx" ON "WifiProfile"("ownerStaffId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
