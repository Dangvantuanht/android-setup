-- CreateTable
CREATE TABLE "DeviceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "claimCodeId" TEXT,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EnrollmentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceLog_claimCodeId_fkey" FOREIGN KEY ("claimCodeId") REFERENCES "ManualClaimCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeviceLog_sessionId_idx" ON "DeviceLog"("sessionId");

-- CreateIndex
CREATE INDEX "DeviceLog_claimCodeId_idx" ON "DeviceLog"("claimCodeId");
