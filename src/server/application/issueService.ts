import prisma from "../infra/database/prisma.js";
import { z } from "zod";
import { S3Service } from "../infra/storage/s3.js";
import { format } from "date-fns";

export const createIssueSchema = z.object({
  category: z.string({ message: "Categoria é obrigatória" }).min(1, "Categoria é obrigatória"),
  description: z.string({ message: "Descrição é obrigatória" }).min(1, "Descrição é obrigatória"),
  latitude: z.coerce.number({ message: "Latitude é obrigatória" }),
  longitude: z.coerce.number({ message: "Longitude é obrigatória" }),
  address: z.string().optional(),
  whatsapp: z.string().optional().refine(val => !val || /^\d{10,15}$/.test(val.replace(/\D/g, '')), {
    message: "WhatsApp deve conter apenas números com DDD (10-11 dígitos)"
  }),
  poleId: z.string().optional().or(z.literal("")),
  isNearPole: z.coerce.boolean().optional(),
  poleAddress: z.string().optional(),
  poleReference: z.string().optional(),
  poleImageUrl: z.string().optional(),
  poleLocationUrl: z.string().optional(),
});

import { WhatsAppService } from "./services/WhatsAppService.js";

const s3Service = new S3Service();
const whatsappService = new WhatsAppService();

export class IssueService {
  private generateProtocol(): string {
    const date = format(new Date(), "yyyyMMdd");
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `SC-${date}-${random}`;
  }

  private async resolveImageUrl(imageUrl: string | null | undefined): Promise<string | null> {
    return s3Service.getFileUrl(imageUrl);
  }

  async createIssue(data: z.infer<typeof createIssueSchema>, userId: string | null, file?: Express.Multer.File) {
    const protocol = this.generateProtocol();
    let imageUrl: string | undefined;

    if (file) {
      imageUrl = await s3Service.uploadFile(file);
    }

    const { whatsapp, poleId, isNearPole, poleAddress, poleReference, poleImageUrl, poleLocationUrl, ...issueData } = data;

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
        poleLocationUrl,
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
    const issues = await prisma.issue.findMany({
      where: filters,
      include: {
        user: {
          select: { name: true, email: true }
        },
        pole: true,
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
