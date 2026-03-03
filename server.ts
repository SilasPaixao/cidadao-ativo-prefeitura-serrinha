import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development with Vite
  }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }));
  app.use(express.json());

  console.log("Verificando variáveis de ambiente...");
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL está ausente!");
  } else {
    console.log("✅ DATABASE_URL está presente.");
  }

  if (!process.env.BREVO_API_KEY) {
    console.warn("⚠️ BREVO_API_KEY está ausente! Recursos de e-mail não funcionarão.");
  } else {
    console.log("✅ BREVO_API_KEY está presente.");
    const apiKey = process.env.BREVO_API_KEY;
    if (apiKey.includes(" ")) {
      console.warn("⚠️ BREVO_API_KEY contém espaços! Isso pode causar erro de autenticação.");
    }
    if (apiKey.length < 20) {
      console.warn("⚠️ BREVO_API_KEY parece muito curta para uma chave de API Brevo v3.");
    }
  }

  // API Routes
  const { setupRoutes } = await import("./src/server/presentation/routes/index.js");
  setupRoutes(app);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
