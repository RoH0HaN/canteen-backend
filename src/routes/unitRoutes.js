import express from "express";
import {
  createUnit,
  deleteUnit,
  getAllUnits,
  getUnitById,
  updateUnit,
} from "../controllers/unitController.js";
import { authMiddleware } from "../middlewares/auth.js";

class UnitRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/get", getAllUnits);
    this.router.get("/get/:id", getUnitById);
    this.router.post("/create", authMiddleware.authenticateToken, createUnit);
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      updateUnit,
    );
    this.router.delete(
      "/delete/:id",
      authMiddleware.authenticateToken,
      deleteUnit,
    );
  }
}

export default UnitRoutes;
