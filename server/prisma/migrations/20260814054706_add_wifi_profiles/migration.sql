-- CreateTable
CREATE TABLE "WifiProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "ssid" TEXT NOT NULL,
    "password" TEXT,
    "securityType" TEXT NOT NULL DEFAULT 'WPA',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
