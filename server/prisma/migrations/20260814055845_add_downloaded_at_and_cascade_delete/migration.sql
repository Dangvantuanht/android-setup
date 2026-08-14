-- AlterTable
ALTER TABLE "EnrollmentSession" ADD COLUMN "downloadedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EnrollmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrollmentEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EnrollmentSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EnrollmentEvent" ("createdAt", "id", "payloadJson", "sessionId", "type") SELECT "createdAt", "id", "payloadJson", "sessionId", "type" FROM "EnrollmentEvent";
DROP TABLE "EnrollmentEvent";
ALTER TABLE "new_EnrollmentEvent" RENAME TO "EnrollmentEvent";
CREATE INDEX "EnrollmentEvent_sessionId_idx" ON "EnrollmentEvent"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
