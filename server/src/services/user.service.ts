import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

const AUTO_APPROVE_KEY = "auto_approve_registration";

// Excludes passwordHash — must never leave the server.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  lastSeenAt: true,
  createdAt: true,
} satisfies Prisma.StaffUserSelect;

export async function getAutoApprove(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key: AUTO_APPROVE_KEY } });
  return setting?.value === "true";
}

export async function setAutoApprove(enabled: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: AUTO_APPROVE_KEY },
    update: { value: String(enabled) },
    create: { key: AUTO_APPROVE_KEY, value: String(enabled) },
  });
}

export async function registerUser(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "email already registered" };

  const autoApprove = await getAutoApprove();
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.staffUser.create({
    data: {
      email,
      passwordHash,
      role: "staff",
      status: autoApprove ? "APPROVED" : "PENDING",
    },
  });
  return { ok: true };
}

export async function listUsers() {
  return prisma.staffUser.findMany({
    orderBy: { createdAt: "desc" },
    select: SAFE_USER_SELECT,
  });
}

export async function updateUser(
  id: string,
  data: { status?: string; role?: string },
) {
  return prisma.staffUser.update({
    where: { id },
    data,
    select: SAFE_USER_SELECT,
  });
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.staffUser.delete({ where: { id } });
}
