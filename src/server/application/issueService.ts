import prisma from "../infra/database/prisma.js";
import { z } from "zod";
import { S3Service } from "../infra/storage/s3.js";
import { format } from "date-fns";

export const createIssueSchema = z.object({
  category: z.string({ message: "Categoria é obrigatória" }).min(1, "Categoria é obrigatória"),
  description: z.string({ message: "Descrição é obrigatória" }).min(1, "Descrição é obrigatória"),
  latitude: z.number({ message: "Latitude é obrigatória" }),
  longitude: z.number({ message: "Longitude é obrigatória" }),
  address: z.string().optional(),
  whatsapp: z.string().optional().refine(val => !val || /^\d{10,15}$/.test(val.replace(/\D/g, '')), {
    message: "WhatsApp deve conter apenas números com DDD (10-11 dígitos)"
  }),
  poleId: z.string().optional().or(z.literal("")),
  isNearPole: z.boolean().optional(),
  poleAddress: z.string().optional(),
  poleReference: z.string().optional(),
  poleImageUrl: z.string().optional(),
});

import { WhatsAppService } from "./services/WhatsAppService.js";

const s3Service = new S3Service();
const whatsappService = new WhatsAppService();

export class IssueService {
  private static columnChecked = false;

  public static async ensureSchema() {
    if (IssueService.columnChecked) return;
    try {
      console.log("Checking and ensuring database schema...");
      
      // 1. Ensure User table exists (Critical for Auth)
      try {
        console.log("Ensuring User table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "password" TEXT NOT NULL,
            "name" TEXT NOT NULL,
            "role" TEXT NOT NULL DEFAULT 'CITIZEN',
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "whatsapp" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "User_pkey" PRIMARY KEY ("id")
          );
        `);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");`);
      } catch (e) {
        console.warn("⚠️ Error ensuring User table:", e);
      }

      // 2. Ensure Issue table exists
      try {
        console.log("Ensuring Issue table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Issue" (
            "id" TEXT NOT NULL,
            "protocol" TEXT NOT NULL,
            "category" TEXT NOT NULL,
            "description" TEXT NOT NULL,
            "latitude" DOUBLE PRECISION NOT NULL,
            "longitude" DOUBLE PRECISION NOT NULL,
            "address" TEXT,
            "reporterEmail" TEXT,
            "whatsapp" TEXT,
            "imageUrl" TEXT,
            "status" TEXT NOT NULL DEFAULT 'PENDING',
            "userId" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
          );
        `);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Issue_protocol_key" ON "Issue"("protocol");`);
      } catch (e) {
        console.warn("⚠️ Error ensuring Issue table:", e);
      }

      // 3. Ensure columns and other tables...
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "reporterEmail" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "address" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE';`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;`);
      } catch (e) {
        console.warn("⚠️ Error altering tables:", e);
      }

      try {
        console.log("Ensuring Pole table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Pole" (
            "id" TEXT NOT NULL,
            "address" TEXT NOT NULL,
            "reference" TEXT NOT NULL,
            "imageUrl" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Pole_pkey" PRIMARY KEY ("id")
          );
        `);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Pole" ADD COLUMN IF NOT EXISTS "neighborhood" TEXT;`);
      } catch (e) {
        console.warn("⚠️ Error ensuring Pole table:", e);
      }

      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "poleId" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "isNearPole" BOOLEAN;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "poleAddress" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "poleReference" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "poleImageUrl" TEXT;`);
      } catch (e) {
        console.warn("⚠️ Error adding pole columns to Issue:", e);
      }

      try {
        console.log("Ensuring IssueStatusHistory table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "IssueStatusHistory" (
            "id" TEXT NOT NULL,
            "issueId" TEXT NOT NULL,
            "status" TEXT NOT NULL,
            "comment" TEXT,
            "changedById" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "IssueStatusHistory_pkey" PRIMARY KEY ("id")
          );
        `);
      } catch (e) {
        console.warn("⚠️ Error ensuring IssueStatusHistory table:", e);
      }
      
      try {
        console.log("Ensuring WhatsAppLog table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "WhatsAppLog" (
            "id" TEXT NOT NULL,
            "issueId" TEXT,
            "phoneNumber" TEXT NOT NULL,
            "message" TEXT NOT NULL,
            "imageUrl" TEXT,
            "status" TEXT NOT NULL,
            "lastError" TEXT,
            "attempts" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "sentAt" TIMESTAMP(3),
            CONSTRAINT "WhatsAppLog_pkey" PRIMARY KEY ("id")
          );
        `);
        await prisma.$executeRawUnsafe(`ALTER TABLE "WhatsAppLog" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;`);
      } catch (e) {
        console.warn("⚠️ Error ensuring WhatsAppLog table:", e);
      }

      try {
        console.log("Ensuring PasswordResetToken table...");
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
            "id" TEXT NOT NULL,
            "token" TEXT NOT NULL,
            "email" TEXT NOT NULL,
            "expiresAt" TIMESTAMP(3) NOT NULL,
            "used" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
          );
        `);
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");`);
      } catch (e) {
        console.warn("⚠️ Error ensuring PasswordResetToken table:", e);
      }

      console.log("Database schema check completed.");
      IssueService.columnChecked = true;
    } catch (e: any) {
      console.error("❌ Could not ensure database schema:", e);
      if (e.code) console.error("Prisma Error Code:", e.code);
      if (e.meta) console.error("Prisma Error Meta:", JSON.stringify(e.meta));
    }
  }

  private generateProtocol(): string {
    const date = format(new Date(), "yyyyMMdd");
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `SC-${date}-${random}`;
  }

  private async resolveImageUrl(imageUrl: string | null | undefined): Promise<string | null> {
    return s3Service.getFileUrl(imageUrl);
  }

  async createIssue(data: z.infer<typeof createIssueSchema>, userId: string | null, file?: Express.Multer.File) {
    await IssueService.ensureSchema();
    const protocol = this.generateProtocol();
    let imageUrl: string | undefined;

    if (file) {
      imageUrl = await s3Service.uploadFile(file);
    }

    const { whatsapp, poleId, isNearPole, poleAddress, poleReference, poleImageUrl, ...issueData } = data;

    const issue = await prisma.issue.create({
      data: {
        ...issueData,
        whatsapp,
        protocol,
        userId,
        imageUrl,
        status: "PENDING",
        poleId: poleId || null,
        isNearPole,
        poleAddress,
        poleReference,
        poleImageUrl,
      },
    });

    if (whatsapp) {
      whatsappService.notifyNewIssue(whatsapp, protocol, issueData.category, issueData.description, issue.id)
        .catch(error => console.error("Failed to enqueue WhatsApp notification:", error));
    }

    return {
      ...issue,
      imageUrl: await this.resolveImageUrl(issue.imageUrl)
    };
  }

  async getIssues(filters: any) {
    await IssueService.ensureSchema();
    const issues = await prisma.issue.findMany({
      where: filters,
      include: {
        user: {
          select: { name: true, email: true }
        },
        history: {
          include: {
            changedBy: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return Promise.all(issues.map(async issue => ({
      ...issue,
      imageUrl: await this.resolveImageUrl(issue.imageUrl)
    })));
  }

  async updateStatus(issueId: string, status: any, comment: string, changedById: string, file?: Express.Multer.File) {
    const statusMap: Record<string, string> = {
      PENDING: "Pendente",
      IN_PROGRESS: "Em Andamento",
      RESOLVED: "Resolvido",
      REJECTED: "Rejeitado",
    };

    const existingIssue = await prisma.issue.findUnique({ where: { id: issueId } });
    if (!existingIssue) {
      throw new Error("Relato não encontrado.");
    }

    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await s3Service.uploadFile(file);
    }

    return prisma.$transaction(async (tx) => {
      const issue = await tx.issue.update({
        where: { id: issueId },
        data: { status },
      });

      await tx.issueStatusHistory.create({
        data: {
          issueId,
          status,
          comment,
          changedById,
        },
      });

      if (issue.whatsapp) {
        const fullImageUrl = imageUrl ? await s3Service.getFileUrl(imageUrl) : undefined;
        whatsappService.notifyStatusUpdate(issue.whatsapp, issue.protocol, status, comment, issue.id, fullImageUrl || undefined)
          .catch(error => console.error("Failed to enqueue WhatsApp status update:", error));
      }

      return issue;
    });
  }

  async getIssueByProtocol(protocol: string) {
    const issue = await prisma.issue.findUnique({
      where: { protocol },
      include: {
        history: {
          include: {
            changedBy: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!issue) return null;

    return {
      ...issue,
      imageUrl: await this.resolveImageUrl(issue.imageUrl)
    };
  }

  async deleteIssue(id: string) {
    const existingIssue = await prisma.issue.findUnique({ where: { id } });
    if (!existingIssue) return { success: true };
    
    // Delete related history first
    await prisma.issueStatusHistory.deleteMany({
      where: { issueId: id }
    });

    // Delete related WhatsApp logs if any (optional but good for cleanup)
    await prisma.whatsAppLog.deleteMany({
      where: { issueId: id }
    });
    
    return prisma.issue.delete({
      where: { id },
    });
  }

  async sendManualNotification(issueId: string, message: string, file?: Express.Multer.File) {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId }
    });

    if (!issue) {
      throw new Error("Relato não encontrado.");
    }

    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await s3Service.uploadFile(file);
    }

    if (issue.whatsapp) {
      const fullImageUrl = imageUrl ? await s3Service.getFileUrl(imageUrl) : undefined;
      whatsappService.sendManualMessage(issue.whatsapp, issue.protocol, message, issue.id, fullImageUrl || undefined)
        .catch(error => console.error("Failed to enqueue manual WhatsApp message:", error));
    }

    return { success: true };
  }
}
