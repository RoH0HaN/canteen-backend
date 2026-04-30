import express from "express";
import upload from "../middlewares/upload.js";
import {
  createItem,
  deleteItem,
  getAllItems,
  getItemById,
  updateItem,
} from "../controllers/itemController.js";
import { apiRateLimiter } from "../middlewares/rateLimit.js";
import { authMiddleware } from "../middlewares/auth.js";

class ItemRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      createItem,
    );
    this.router.get(
      "/list",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getAllItems,
    );
    this.router.get(
      "/get/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getItemById,
    );
    this.router.put(
      "/update/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      updateItem,
    );
    this.router.delete(
      "/delete/:id",
      apiRateLimiter,
      authMiddleware.authenticateToken,
      deleteItem,
    );
  }
}
export default ItemRoutes;
