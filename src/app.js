import express from "express";
import helmet from "helmet";
import dayjs from "dayjs";
import cookieSession from "cookie-session";
import fs from "fs-extra";
import path from "path";
import { corsMiddleware } from "./middlewares/cors.js";
import { devLogger, prodLogger } from "./middlewares/logger.js";
import { generalRateLimiter } from "./middlewares/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import cookieParser from "cookie-parser";

// Route imports would go here
import UserRoutes from "./routes/userRoutes.js";
import VendorRoutes from "./routes/vendorRoutes.js";
import ItemRoutes from "./routes/itemRoutes.js";
import RequisitionRoutes from "./routes/requisitionRoutes.js";

export class App {
  constructor() {
    this.app = express();

    this.createDirectoryIfNotExists();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddlewares() {
    this.app.use(helmet());
    this.app.use(corsMiddleware);
    this.app.use(
      process.env.NODE_ENV === "production" ? prodLogger : devLogger,
    );
    this.app.use(express.static(path.join(process.cwd(), "uploads")));
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(generalRateLimiter);
    this.app.use(cookieParser());

    // COOKIE SESSION (for OAuth session)
    this.app.use(
      cookieSession({
        name: "session",
        keys: [process.env.SESSION_SECRET || "supersecretkey"],
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      }),
    );
  }

  initializeRoutes() {
    const initial = "/api/v1";

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.status(200).json({
        status: "OK",
        timestamp: dayjs().toISOString(),
      });
    });

    // API routes will be added here
    this.app.use(`${initial}/users`, new UserRoutes().router);
    this.app.use(`${initial}/vendors`, new VendorRoutes().router);
    this.app.use(`${initial}/items`, new ItemRoutes().router);
    this.app.use(`${initial}/requisitions`, new RequisitionRoutes().router);
  }

  initializeErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  createDirectoryIfNotExists(dirPath) {
    const uploadsBase = path.join(process.cwd(), "uploads");

    if (!fs.existsSync(uploadsBase)) {
      fs.mkdirSync(uploadsBase, { recursive: true });
      console.log("📁 Created base uploads directory");
    }
  }

  startServer(port) {
    this.app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  }
}
