import express from "express";
import upload from "../middlewares/upload.js";
import {
  createConsumption,
  getAllConsumptions,
  getConsumptionById,
  deleteConsumption,
} from "../controllers/consumptionController.js";

class ConsumptionRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post("/", createConsumption);
    this.router.get("/", getAllConsumptions);
    this.router.get("/:id", getConsumptionById);
    this.router.delete("/:id", deleteConsumption);
  }
}
export default ConsumptionRoutes;
