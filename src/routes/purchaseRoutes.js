import express from "express";
import upload from "../middlewares/upload.js";
import {
  createPurchase,
  getPurchaseById,
  getAllPurchases,
  deletePurchase,
} from "../controllers/purchaseController.js";

class PurchaseRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/", upload.multipleFiles, createPurchase);
    this.router.get("/:id", getPurchaseById);
    this.router.get("/", getAllPurchases);
    this.router.delete("/:id", deletePurchase);
  }
}
export default PurchaseRoutes;
