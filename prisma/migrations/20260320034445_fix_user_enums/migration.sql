-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('CITIZEN', 'GOVERNMENT', 'ADMIN');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole"),
  ALTER COLUMN "role" SET DEFAULT 'CITIZEN';

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "UserStatus" USING ("status"::"UserStatus"),
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
