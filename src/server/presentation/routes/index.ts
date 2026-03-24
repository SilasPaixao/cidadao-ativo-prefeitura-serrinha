import { Express, Request, Response } from "express";
import multer from "multer";
import { AuthService, loginSchema, registerSchema } from "../../application/authService.js";
import { IssueService, createIssueSchema } from "../../application/issueService.js";
import { PoleService, createPoleSchema } from "../../application/poleService.js";
import { authenticate, authorize, AuthRequest } from "../middlewares/auth.js";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import prisma from "../../infra/database/prisma.js";

const upload = multer({ storage: multer.memoryStorage() });
const authService = new AuthService();
const issueService = new IssueService();
const poleService = new PoleService();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 10, // Limite de 10 tentativas por IP
  message: { error: "Muitas tentativas de login. Por favor, tente novamente em 10 minutos." },
  standardHeaders: true, // Retorna informações de limite nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita os headers `X-RateLimit-*`
  statusCode: 429,
});

function handleError(res: Response, error: any, status: number = 400) {
  console.error("❌ API Error:", error);
  
  // Detailed Prisma error logging
  if (error.code) {
    console.error(`Prisma Error Code: ${error.code}`);
  }
  if (error.meta) {
    console.error(`Prisma Error Meta:`, JSON.stringify(error.meta, null, 2));
  }
  if (error.message) {
    console.error(`Error Message: ${error.message}`);
  }
  
  // Attempt to log the full error object for debugging
  try {
    const fullError = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    console.error("Full Error Details:", fullError);
  } catch (e) {
    console.error("Could not stringify error object");
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.issues[0].message });
  }
  const message = error.message || "Ocorreu um erro interno";
  res.status(status).json({ error: message, details: error.stack });
}

export function setupRoutes(app: Express) {
  // Auth
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      const result = await authService.register(data);
      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login(data);
      res.json(result);
    } catch (error: any) {
      handleError(res, error, 401);
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) throw new Error("E-mail é obrigatório");
      const result = await authService.forgotPassword(email);
      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) throw new Error("Token e nova senha são obrigatórios");
      if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres");
      const result = await authService.resetPassword(token, password);
      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.get("/api/auth/me", authenticate, (req: AuthRequest, res) => {
    res.json(req.user);
  });

  // Issues
  app.post("/api/issues", upload.single("image"), async (req: AuthRequest, res) => {
    try {
      // Handle potential stringified JSON from FormData
      const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
      const data = createIssueSchema.parse(body);
      
      // Let's use a more robust way to get userId if token is present
      let finalUserId: string | null = null;
      const token = req.headers.authorization?.split(" ")[1];
      if (token) {
        try {
          const decoded = (await import("jsonwebtoken")).default.verify(token, process.env.JWT_SECRET || "super-secret") as any;
          finalUserId = decoded.id;
        } catch {}
      }

      const issue = await issueService.createIssue(data, finalUserId, req.file);
      res.json(issue);
    } catch (error: any) {
      console.error(error);
      handleError(res, error);
    }
  });

  app.get("/api/issues/protocol/:protocol", async (req, res) => {
    try {
      const issue = await issueService.getIssueByProtocol(req.params.protocol);
      if (!issue) return res.status(404).json({ error: "Relato não encontrado" });
      res.json(issue);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  // Admin/Government Routes
  app.get("/api/admin/issues", authenticate, authorize(["GOVERNMENT", "ADMIN"]), async (req, res) => {
    try {
      const { status, category, neighborhood } = req.query;
      const filters: any = {};
      if (status) filters.status = status;
      if (category) filters.category = category;
      // Neighborhood filtering would require address parsing or a dedicated field
      // For now, we'll filter by address containing the neighborhood string if provided
      if (neighborhood) {
        filters.address = { contains: neighborhood as string, mode: 'insensitive' };
      }

      const issues = await issueService.getIssues(filters);
      res.json(issues);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  // Admin Poles
  app.get("/api/admin/poles", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      const poles = await poleService.listPoles();
      res.json(poles);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  app.post("/api/admin/poles", authenticate, authorize(["ADMIN"]), upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Foto do poste é obrigatória" });
      const data = createPoleSchema.parse(req.body);
      const pole = await poleService.createPole(data, req.file);
      res.json(pole);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.delete("/api/admin/poles/:id", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      const poleId = req.params.id;
      console.log(`🗑️ Attempting to delete pole with ID: ${poleId}`);
      await poleService.deletePole(poleId);
      console.log(`✅ Successfully deleted pole with ID: ${poleId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`❌ Error deleting pole:`, error);
      handleError(res, error);
    }
  });

  app.post("/api/admin/issues/:id/status", authenticate, authorize(["GOVERNMENT", "ADMIN"]), upload.single("image"), async (req: AuthRequest, res) => {
    try {
      const { status, comment } = req.body;
      const issue = await issueService.updateStatus(req.params.id, status, comment, req.user!.id, req.file);
      res.json(issue);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.post("/api/admin/issues/:id/send-notification", authenticate, authorize(["GOVERNMENT", "ADMIN"]), upload.single("image"), async (req: AuthRequest, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Mensagem é obrigatória" });
      
      const result = await issueService.sendManualNotification(req.params.id, message, req.file);
      res.json(result);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  // Admin Management Routes
  app.get("/api/admin/pending-requests", authenticate, authorize(["GOVERNMENT", "ADMIN"]), async (req, res) => {
    try {
      const requests = await authService.getPendingAdmins();
      res.json(requests);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  app.post("/api/admin/approve-request/:id", authenticate, authorize(["GOVERNMENT", "ADMIN"]), async (req, res) => {
    try {
      const result = await authService.approveAdmin(req.params.id);
      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.post("/api/admin/reject-request/:id", authenticate, authorize(["GOVERNMENT", "ADMIN"]), async (req, res) => {
    try {
      const result = await authService.rejectAdmin(req.params.id);
      res.json(result);
    } catch (error: any) {
      handleError(res, error);
    }
  });

  app.delete("/api/admin/issues/:id", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      await issueService.deleteIssue(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      handleError(res, error);
    }
  });

  // WhatsApp Diagnostic Route
  app.get("/api/admin/whatsapp/logs", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      const logs = await prisma.whatsAppLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json(logs);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  app.get("/api/admin/whatsapp/status", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      const config = {
        apiUrl: process.env.EVOLUTION_API_URL ? "Configurado" : "Ausente",
        apiKey: process.env.EVOLUTION_API_KEY ? "Configurado" : "Ausente",
        instance: process.env.EVOLUTION_INSTANCE ? "Configurado" : "Ausente",
      };
      
      const counts = {
        pending: await prisma.whatsAppLog.count({ where: { status: 'pending' } }),
        processing: await prisma.whatsAppLog.count({ where: { status: 'processing' } }),
        sent: await prisma.whatsAppLog.count({ where: { status: 'sent' } }),
        failed: await prisma.whatsAppLog.count({ where: { status: 'failed' } }),
      };
      
      res.json({ config, stats: counts });
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  app.post("/api/admin/whatsapp/test", authenticate, authorize(["ADMIN"]), async (req, res) => {
    try {
      const { number, message } = req.body;
      if (!number || !message) throw new Error("Número e mensagem são obrigatórios");
      
      const { WhatsAppService } = await import("../../application/services/WhatsAppService.js");
      const whatsappService = new WhatsAppService();
      
      // We don't have an issueId for a pure test
      await whatsappService.sendManualMessage(number, "TEST-000", message, "test-issue-id");
      
      res.json({ success: true });
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });

  // Geocoding Proxy
  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      if (!lat || !lon) return res.status(400).json({ error: "Latitude e longitude são obrigatórios" });
      
      const response = await (await import("axios")).default.get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, {
        headers: {
          'User-Agent': 'SerrinhaConectada/1.0 (silaspaixao873@gmail.com)'
        }
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error("❌ Geocoding proxy error:", error.message);
      if (error.response) {
        console.error("Nominatim Response:", error.response.status, error.response.data);
      }
      res.status(500).json({ error: "Erro ao buscar endereço. Tente novamente mais tarde." });
    }
  });

  // Poles Public
  app.get("/api/poles/:id", async (req, res) => {
    try {
      const pole = await poleService.getPoleById(req.params.id);
      if (!pole) return res.status(404).json({ error: "Poste não encontrado" });
      res.json(pole);
    } catch (error: any) {
      handleError(res, error, 500);
    }
  });
}
