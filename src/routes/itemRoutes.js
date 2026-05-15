import express from "express";
import upload from "../middlewares/upload.js";
import {
  createItem,
  deleteItem,
  getAllItems,
  getItemById,
  updateItem,
  getDailyItemStockSummery,
  getItemStockSummery,
} from "../controllers/itemController.js";
import { authMiddleware } from "../middlewares/auth.js";

class ItemRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/create", authMiddleware.authenticateToken, createItem);
    this.router.get("/list", authMiddleware.authenticateToken, getAllItems);
    this.router.get("/get/:id", authMiddleware.authenticateToken, getItemById);
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      updateItem,
    );
    this.router.delete(
      "/delete/:id",
      authMiddleware.authenticateToken,
      deleteItem,
    );
    this.router.get(
      "/daily-stock-summery",
      authMiddleware.authenticateToken,
      getDailyItemStockSummery,
    );
    this.router.get(
      "/stock-summery",
      authMiddleware.authenticateToken,
      getItemStockSummery,
    );
  }
}
export default ItemRoutes;
