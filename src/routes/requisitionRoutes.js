import express from "express";
import upload from "../middlewares/upload.js";
import {
  createRequisition,
  getRequisitionById,
  approveRequisition,
  deleteRequisition,
  deleteRequisitionItem,
  getAllRequisitions,
  getRequisitionsByVendor,
  receiveRequisition,
  updateRequisition,
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
    this.router.get(
      "/list",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getAllRequisitions,
    );
    this.router.get(
      "/list-by-vendor/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getRequisitionsByVendor,
    );
    this.router.put(
      "/update/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      updateRequisition,
    );
    this.router.put(
      "/approve/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      approveRequisition,
    );
    this.router.put(
      "/receive/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      upload.singleFile,
      receiveRequisition,
    );
    this.router.delete(
      "/delete/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      deleteRequisition,
    );
    this.router.delete(
      "/delete-item/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      deleteRequisitionItem,
    );
  }
}
export default RequisitionRoutes;
