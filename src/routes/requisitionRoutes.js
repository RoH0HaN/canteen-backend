import express from "express";
import upload from "../middlewares/upload.js";
import {
  createRequisition,
  getRequisitionById,
} from "../controllers/requisitionController.js";
import { apiRateLimiter } from "../middlewares/rateLimit.js";
import { authMiddleware } from "../middlewares/auth.js";

class RequisitionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      createRequisition,
    );
    this.router.get(
      "/get/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getRequisitionById,
    );
  }
}
export default RequisitionRoutes;
