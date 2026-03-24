import argon2 from "argon2";
import jwt from "jsonwebtoken";
import prisma from "../infra/database/prisma.js";
import { z } from "zod";
import { IssueService } from "./issueService.js";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

export const registerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  whatsapp: z.string().optional().refine(val => !val || /^\d{10,15}$/.test(val.replace(/\D/g, '')), {
    message: "WhatsApp deve conter apenas números com DDD (10-11 dígitos)"
  }),
  role: z.enum(["CITIZEN", "GOVERNMENT"], {
    message: "Tipo de acesso inválido",
  }).default("CITIZEN"),
});

import { WhatsAppService } from "./services/WhatsAppService.js";
import { EmailService } from "./services/EmailService.js";

const whatsappService = new WhatsAppService();
const emailService = new EmailService();

export class AuthService {
  async seedAdmin() {
    await IssueService.ensureSchema();
    
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    const adminName = process.env.DEFAULT_ADMIN_NAME || "Administrador";

    if (!adminEmail || !adminPassword) {
      console.warn("⚠️ Variáveis de ambiente DEFAULT_ADMIN_EMAIL ou DEFAULT_ADMIN_PASSWORD não configuradas. Usuário administrador padrão não será criado.");
      return;
    }

    // Verifica se já existe QUALQUER administrador no sistema
    const anyAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" }
    });

    if (anyAdmin) {
      console.log("✅ Já existe um administrador no sistema. Pulando criação do usuário padrão.");
      return;
    }

    console.log(`🌱 Semeando usuário administrador padrão: ${adminEmail}`);
    const hashedPassword = await argon2.hash(adminPassword);

    try {
      await prisma.user.create({
        data: {
          email: adminEmail.toLowerCase().trim(),
          password: hashedPassword,
          name: adminName,
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      console.log("✅ Usuário administrador padrão criado com sucesso.");
    } catch (error) {
      console.error("❌ Erro ao criar usuário administrador padrão:", error);
    }
  }

  async register(data: z.infer<typeof registerSchema>) {
    await IssueService.ensureSchema();
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error("E-mail já registrado!");
    }

    const hashedPassword = await argon2.hash(password);
    const status = data.role === "GOVERNMENT" ? "PENDING" : "ACTIVE";

    const user = await prisma.user.create({
      data: {
        ...data,
        email,
        password: hashedPassword,
        status,
      },
    });

    if (status === "PENDING") {
      if (user.whatsapp) {
        whatsappService.sendManualMessage(user.whatsapp, "CADASTRO-PENDENTE", `Olá ${user.name}, seu pedido de acesso como gestor na plataforma *Prefeitura de Serrinha - Cidadão ativo!* foi recebido e está aguardando aprovação da administração. Você receberá uma notificação assim que for aprovado.`, "auth-pending")
          .catch(error => console.error("Erro ao enviar WhatsApp de cadastro pendente:", error));
      }
      return {
        pending: true,
        message: "Seu cadastro foi registrado com sucesso. Ele ainda não possui permissão de administrador. Seu pedido ficará aguardando aprovação de um administrador já existente. Somente após aprovação ele poderá acessar a área interna.",
      };
    }

    return this.generateToken(user);
  }

  async login(data: z.infer<typeof loginSchema>) {
    await IssueService.ensureSchema();
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();

    // Auto cleanup expired requests on login
    await this.cleanupExpiredRequests();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`🔍 Login falhou: Usuário não encontrado (${email})`);
      throw new Error("Credenciais inválidas");
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      console.log(`🔍 Login falhou: Senha incorreta para (${email})`);
      throw new Error("Credenciais inválidas");
    }

    if (user.status === "PENDING" && user.role !== "ADMIN") {
      throw new Error("Seu cadastro ainda está pendente de aprovação.");
    }

    if (user.status === "REJECTED" && user.role !== "ADMIN") {
      throw new Error("Seu pedido de cadastro foi rejeitado.");
    }

    return this.generateToken(user);
  }

  async getPendingAdmins() {
    await IssueService.ensureSchema();
    await this.cleanupExpiredRequests();
    return prisma.user.findMany({
      where: {
        role: "GOVERNMENT",
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async approveAdmin(userId: string) {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      throw new Error("Usuário não encontrado.");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    if (user.whatsapp) {
      whatsappService.sendManualMessage(user.whatsapp, "CADASTRO-APROVADO", `Olá ${user.name}, seu cadastro como gestor na plataforma *Prefeitura de Serrinha - Cidadão ativo!* foi APROVADO! Você já pode acessar o painel.`, "auth-approval")
        .catch(error => console.error("Erro ao enviar WhatsApp de aprovação:", error));
    }

    return user;
  }

  async rejectAdmin(userId: string) {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      throw new Error("Usuário não encontrado.");
    }

    // Envia notificação antes de deletar
    if (userExists.whatsapp) {
      whatsappService.sendManualMessage(userExists.whatsapp, "CADASTRO-REJEITADO", `Olá ${userExists.name}, lamentamos informar que seu pedido de acesso como gestor na plataforma *Prefeitura de Serrinha - Cidadão ativo!* foi REJEITADO pela administração.`, "auth-rejection")
        .catch(error => console.error("Erro ao enviar WhatsApp de rejeição:", error));
    }

    // Deleta imediatamente conforme solicitado
    const user = await prisma.user.delete({
      where: { id: userId },
    });

    return user;
  }

  async forgotPassword(email: string) {
    await IssueService.ensureSchema();
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`🔍 Recuperação de senha solicitada para: ${normalizedEmail}`);
    
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.warn(`❌ Recuperação de senha solicitada para e-mail inexistente: ${normalizedEmail}`);
      throw new Error("Este email não possui registro!");
    }

    // Generate secure token
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiry

    // Save token to DB
    await prisma.passwordResetToken.create({
      data: {
        token,
        email: normalizedEmail,
        expiresAt,
      },
    });

    // Send email via Brevo
    const baseUrl = process.env.APP_BASE_URL || process.env.APP_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    
    try {
      await emailService.sendPasswordResetEmail(normalizedEmail, user.name, resetUrl);
    } catch (error) {
      console.error("❌ Falha ao enviar e-mail de recuperação:", error);
      // We still return success to the user for security/UX, but log the error
    }

    console.log(`📧 Link de recuperação para ${normalizedEmail}: ${resetUrl}`);

    return { 
      message: "Se o e-mail informado estiver em nossos registros, você receberá um link para redefinir sua senha em instantes.",
      debugToken: process.env.NODE_ENV !== "production" ? token : undefined 
    };
  }

  async resetPassword(token: string, newPassword: string) {
    await IssueService.ensureSchema();
    
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      throw new Error("O link de recuperação é inválido, expirou ou já foi utilizado.");
    }

    const hashedPassword = await argon2.hash(newPassword);

    // Update user password
    await prisma.user.update({
      where: { email: resetToken.email },
      data: { password: hashedPassword },
    });

    // Invalidate token
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return { message: "Senha redefinida com sucesso! Agora você pode fazer login com sua nova senha." };
  }

  private async cleanupExpiredRequests() {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    await prisma.user.deleteMany({
      where: {
        status: "PENDING",
        createdAt: {
          lt: fifteenDaysAgo,
        },
      },
    });
  }

  private generateToken(user: any) {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
