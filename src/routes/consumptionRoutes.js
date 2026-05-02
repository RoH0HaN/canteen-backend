import express from "express";
import upload from "../middlewares/upload.js";
import {
  createConsumption,
  deleteConsumption,
  getAllConsumptions,
  getConsumptionById,
  updateConsumption,
} from "../controllers/consumptionController.js";
import { apiRateLimiter } from "../middlewares/rateLimit.js";
import { authMiddleware } from "../middlewares/auth.js";

class ConsumptionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      createConsumption,
    );
    this.router.get(
      "/list",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getAllConsumptions,
    );
    this.router.get(
      "/get/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getConsumptionById,
    );
    this.router.put(
      "/update/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      updateConsumption,
    );
    this.router.delete(
      "/delete/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      deleteConsumption,
    );
  }
}
export default ConsumptionRoutes;
