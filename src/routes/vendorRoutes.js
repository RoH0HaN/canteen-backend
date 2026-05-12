import express from "express";
import upload from "../middlewares/upload.js";
import {
  createVendor,
  deleteVendor,
  getVendorById,
  getVendors,
  updateVendor,
} from "../controllers/vendorController.js";
import { authMiddleware } from "../middlewares/auth.js";

class VendorRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      authMiddleware.authenticateToken,
      upload.singleFile,
      createVendor,
    );
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      upload.singleFile,
      updateVendor,
    );
    this.router.get(
      "/get/:id",
      authMiddleware.authenticateToken,
      getVendorById,
    );
    this.router.get("/list", authMiddleware.authenticateToken, getVendors);
    this.router.delete(
      "/delete/:id",
      authMiddleware.authenticateToken,
      deleteVendor,
    );
  }
}
export default VendorRoutes;
