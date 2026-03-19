import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const adminName = process.env.DEFAULT_ADMIN_NAME || 'Administrador';

  if (!adminEmail || !adminPassword) {
    console.warn('⚠️ DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD not set. Skipping admin seed.');
    return;
  }

  console.log(`🌱 Seeding admin: ${adminEmail}`);
  const hashedPassword = await argon2.hash(adminPassword);

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log('Admin already exists, updating password.');
    await prisma.user.update({
      where: { email: adminEmail },
      data: { password: hashedPassword, role: 'ADMIN', status: 'ACTIVE' }
    });
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: 'ADMIN',
        status: 'ACTIVE'
      }
    });
    console.log('Admin created.');
  }

  console.log('Admin seeding complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
