import express from "express";
import upload from "../middlewares/upload.js";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendors,
  updateVendor,
} from "../controllers/vendorController.js";
import { apiRateLimiter } from "../middlewares/rateLimit.js";
import { authMiddleware } from "../middlewares/auth.js";

class VendorRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      upload.singleFile,
      createVendor,
    );
    this.router.put(
      "/update/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      upload.singleFile,
      updateVendor,
    );
    this.router.get(
      "/get/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getVendorById,
    );
    this.router.get(
      "/list",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getVendors,
    );
    this.router.delete(
      "/delete/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      deleteVendor,
    );
  }
}
export default VendorRoutes;
