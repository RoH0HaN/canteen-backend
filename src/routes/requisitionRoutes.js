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
  getRequisitionsByStatus,
  updateRequisitionBill,
  showPdf,
  submitFinalRequisition,
  getRequisitionLogs,
} from "../controllers/requisitionController.js";
import { authMiddleware } from "../middlewares/auth.js";

class RequisitionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      authMiddleware.authenticateToken,
      createRequisition,
    );
    this.router.get(
      "/get/:id",
      authMiddleware.authenticateToken,
      getRequisitionById,
    );
    this.router.get(
      "/list",
      authMiddleware.authenticateToken,
      getAllRequisitions,
    );
    this.router.get(
      "/list-by-vendor/:id",
      authMiddleware.authenticateToken,
      getRequisitionsByVendor,
    );
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      updateRequisition,
    );
    this.router.put(
      "/approve/:id",
      authMiddleware.authenticateToken,
      approveRequisition,
    );
    this.router.put(
      "/receive/:id",
      authMiddleware.authenticateToken,
      upload.singleFile,
      receiveRequisition,
    );
    this.router.delete(
      "/delete/:id",
      authMiddleware.authenticateToken,
      deleteRequisition,
    );
    this.router.delete(
      "/delete-item/:id",
      authMiddleware.authenticateToken,
      deleteRequisitionItem,
    );
    this.router.get(
      "/list-by-status",
      authMiddleware.authenticateToken,
      getRequisitionsByStatus,
    );
    this.router.put(
      "/update-bill/:id",
      authMiddleware.authenticateToken,
      upload.singleFile,
      updateRequisitionBill,
    );
    this.router.put("/show-pdf/:id", authMiddleware.authenticateToken, showPdf);
    this.router.put(
      "/submit-final-requisition/:id",
      authMiddleware.authenticateToken,
      submitFinalRequisition,
    );
    this.router.get(
      "/logs/:id",
      authMiddleware.authenticateToken,
      getRequisitionLogs,
    );
  }
}
export default RequisitionRoutes;
