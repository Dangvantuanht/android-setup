import { prisma } from "../db/prisma.js";

export async function listTargetApps(onlyEnabled = false) {
  return prisma.targetApp.findMany({
    where: onlyEnabled ? { enabled: true } : undefined,
    orderBy: { label: "asc" },
  });
}

/** Parses "packageName|label" lines (one per line). Duplicate package names
 * are skipped rather than erroring. */
export async function bulkAddTargetApps(
  raw: string,
): Promise<{ added: number; skipped: number }> {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const [packageName, label] = line.split("|").map((s) => s?.trim());
    if (!packageName || !label) {
      skipped++;
      continue;
    }
    const existing = await prisma.targetApp.findUnique({ where: { packageName } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.targetApp.create({ data: { packageName, label } });
    added++;
  }
  return { added, skipped };
}

export async function setTargetAppEnabled(id: string, enabled: boolean) {
  return prisma.targetApp.update({ where: { id }, data: { enabled } });
}

export async function deleteTargetApps(ids: string[]): Promise<number> {
  const result = await prisma.targetApp.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}
