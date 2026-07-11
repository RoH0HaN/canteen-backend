import express from "express";
import {
  createPackaging,
  deletePackaging,
  getPackagingById,
  getPackagingByItem,
  updatePackaging,
} from "../controllers/packagingController.js";
import { authMiddleware } from "../middlewares/auth.js";

class PackagingRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/get-by-item/:itemId", getPackagingByItem);
    this.router.get("/get/:packagingId", getPackagingById);
    this.router.post(
      "/create/:itemId",
      authMiddleware.authenticateToken,
      createPackaging,
    );
    this.router.put(
      "/update/:packagingId",
      authMiddleware.authenticateToken,
      updatePackaging,
    );
    this.router.delete(
      "/delete/:packagingId",
      authMiddleware.authenticateToken,
      deletePackaging,
    );
  }
}

export default PackagingRoutes;
