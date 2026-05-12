import express from "express";
import upload from "../middlewares/upload.js";
import {
  createConsumption,
  deleteConsumption,
  getAllConsumptions,
  getConsumptionById,
  updateConsumption,
  approveConsumption,
  getConsumptionsByStatus,
} from "../controllers/consumptionController.js";
import { authMiddleware } from "../middlewares/auth.js";

class ConsumptionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      authMiddleware.authenticateToken,
      createConsumption,
    );
    this.router.get(
      "/list",
      authMiddleware.authenticateToken,
      getAllConsumptions,
    );
    this.router.get(
      "/get/:id",
      authMiddleware.authenticateToken,
      getConsumptionById,
    );
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      updateConsumption,
    );
    this.router.delete(
      "/delete/:id",
      authMiddleware.authenticateToken,
      deleteConsumption,
    );
    this.router.put(
      "/approve/:id",
      authMiddleware.authenticateToken,
      approveConsumption,
    );
    this.router.get(
      "/list-by-status",
      authMiddleware.authenticateToken,
      getConsumptionsByStatus,
    );
  }
}
export default ConsumptionRoutes;
