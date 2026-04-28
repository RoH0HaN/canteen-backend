import express from "express";
import upload from "../middlewares/upload.js";
import {
  createGood,
  updateGood,
  getGoodById,
  deleteGood,
  getAllGoods,
  adjustStock,
} from "../controllers/goodsController.js";
import { apiRateLimiter } from "../middlewares/rateLimit.js";

class GoodsRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/", apiRateLimiter, createGood);
    this.router.put("/:id", apiRateLimiter, updateGood);
    this.router.get("/:id", apiRateLimiter, getGoodById);
    this.router.delete("/:id", apiRateLimiter, deleteGood);
    this.router.get("/", apiRateLimiter, getAllGoods);
    this.router.post("/adjust-stock/:id", apiRateLimiter, adjustStock);
  }
}
export default GoodsRoutes;
