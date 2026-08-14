import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error("Usage: tsx prisma/seed.ts <email> <password>");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.staffUser.upsert({
    where: { email },
    update: { passwordHash, status: "APPROVED" },
    create: { email, passwordHash, role: "admin", status: "APPROVED" },
  });
  console.log(`Staff user ready: ${user.email}`);
}

main().finally(() => prisma.$disconnect());
