import express from "express";
import upload from "../middlewares/upload.js";
import {
  createUser,
  loginUser,
  getCurrentUser,
  blockUser,
  changeUserPassword,
  logoutUser,
  refreshToken,
  unblockUser,
  updateCurrentUser,
  getAllUsers,
} from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/auth.js";

class UserRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      "/create",
      authMiddleware.authenticateToken,
      upload.singleFile,
      createUser,
    );
    this.router.post("/login", loginUser);
    this.router.post("/refresh-token", refreshToken);
    this.router.post("/logout", logoutUser);
    this.router.get("/me", authMiddleware.authenticateToken, getCurrentUser);
    this.router.put(
      "/update/:id",
      authMiddleware.authenticateToken,
      upload.singleFile,
      updateCurrentUser,
    );
    this.router.put(
      "/change-password",
      authMiddleware.authenticateToken,
      changeUserPassword,
    );
    this.router.put("/block/:id", authMiddleware.authenticateToken, blockUser);
    this.router.put(
      "/unblock/:id",
      authMiddleware.authenticateToken,
      unblockUser,
    );
    this.router.get("/list", authMiddleware.authenticateToken, getAllUsers);
  }
}
export default UserRoutes;
