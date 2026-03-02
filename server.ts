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

  console.log("Checking environment variables...");
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing!");
  } else {
    console.log("✅ DATABASE_URL is present.");
  }

  if (!process.env.SMTP_USER) {
    console.warn("⚠️ SMTP_USER is missing! Email features may not work.");
  } else {
    console.log(`✅ SMTP_USER is present: ${process.env.SMTP_USER}`);
    console.log(`✅ SMTP_HOST: ${process.env.SMTP_HOST}`);
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);
