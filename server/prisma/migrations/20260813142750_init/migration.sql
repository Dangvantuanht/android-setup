-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EnrollmentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "wifiSsid" TEXT,
    "wifiPassword" TEXT,
    "wifiSecurityType" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'vi_VN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "note" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "enrolledAt" DATETIME,
    "deviceModel" TEXT,
    "androidRelease" TEXT,
    "apkVersion" TEXT,
    CONSTRAINT "EnrollmentSession_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnrollmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrollmentEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EnrollmentSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReleaseApk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256Base64Url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_token_key" ON "EnrollmentSession"("token");

-- CreateIndex
CREATE INDEX "EnrollmentSession_status_idx" ON "EnrollmentSession"("status");

-- CreateIndex
CREATE INDEX "EnrollmentSession_expiresAt_idx" ON "EnrollmentSession"("expiresAt");

-- CreateIndex
CREATE INDEX "EnrollmentEvent_sessionId_idx" ON "EnrollmentEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseApk_version_key" ON "ReleaseApk"("version");
