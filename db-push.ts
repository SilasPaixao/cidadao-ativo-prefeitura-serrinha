import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL || 'postgresql://postgres:bfuI6kAkxrikA1Gr@db.ezlbmzixlnhxlburwdqy.supabase.co:5432/postgres';

console.log('Using DATABASE_URL:', url.replace(/:[^:@]+@/, ':****@'));

try {
  execSync(`npx prisma db push --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit'
  });
  console.log('✅ Database push successful');
} catch (error) {
  console.error('❌ Database push failed');
  process.exit(1);
}
