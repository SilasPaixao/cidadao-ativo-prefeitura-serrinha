import prisma from "../infra/database/prisma.js";
import { z } from "zod";
import { S3Service } from "../infra/storage/s3.js";
import { IssueService } from "./issueService.js";

const s3Service = new S3Service();

export const createPoleSchema = z.object({
  id: z.string().min(1, "ID do poste é obrigatório"),
  address: z.string().min(1, "Endereço é obrigatório"),
  neighborhood: z.string().optional(),
  reference: z.string().min(1, "Ponto de referência é obrigatório"),
});

export class PoleService {
  private poleBucket = process.env.S3_BUCKET_POLES || process.env.S3_BUCKET || "serrinha-poles";

  async createPole(data: z.infer<typeof createPoleSchema>, file: Express.Multer.File) {
    await IssueService.ensureSchema();
    
    const imageUrl = await s3Service.uploadFile(file, { bucket: this.poleBucket, prefix: "poles" });
    
    return prisma.pole.create({
      data: {
        ...data,
        imageUrl,
      },
    });
  }

  async getPoleById(id: string) {
    await IssueService.ensureSchema();
    const pole = await prisma.pole.findUnique({
      where: { id },
    });
    
    if (!pole) return null;
    
    return {
      ...pole,
      imageUrl: await s3Service.getFileUrl(pole.imageUrl, this.poleBucket),
      rawImageUrl: pole.imageUrl
    };
  }

  async listPoles() {
    await IssueService.ensureSchema();
    const poles = await prisma.pole.findMany({
      orderBy: { createdAt: "desc" },
    });
    
    return Promise.all(poles.map(async (pole) => ({
      ...pole,
      imageUrl: await s3Service.getFileUrl(pole.imageUrl, this.poleBucket),
      rawImageUrl: pole.imageUrl
    })));
  }

  async deletePole(id: string) {
    await IssueService.ensureSchema();
    
    const pole = await prisma.pole.findUnique({
      where: { id },
    });

    if (!pole) {
      throw new Error("Poste não encontrado");
    }

    // Delete image from S3
    if (pole.imageUrl) {
      await s3Service.deleteFile(pole.imageUrl, this.poleBucket);
    }

    // Ensure issues linked to this pole are updated (onDelete: SetNull fallback)
    await prisma.issue.updateMany({
      where: { poleId: id },
      data: { poleId: null }
    });

    return prisma.pole.delete({
      where: { id },
    });
  }
}
