import express from 'express';
import upload from '../middlewares/upload.js';
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
} from '../controllers/userController.js';
import { authRateLimiter, apiRateLimiter } from '../middlewares/rateLimit.js';
import { authMiddleware } from '../middlewares/auth.js';

class UserRoutes {
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post(
      '/create',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      upload.singleFile,
      createUser,
    );
    this.router.post('/login', loginUser);
    this.router.post('/refresh-token', refreshToken);
    this.router.post('/logout', logoutUser);
    this.router.get('/me', authMiddleware.authenticateToken, getCurrentUser);
    this.router.put(
      '/update/:id',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      upload.singleFile,
      updateCurrentUser,
    );
    this.router.put(
      '/change-password',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      changeUserPassword,
    );
    this.router.put(
      '/block/:id',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      blockUser,
    );
    this.router.put(
      '/unblock/:id',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      unblockUser,
    );
    this.router.get(
      '/list',
      apiRateLimiter,
      authMiddleware.authenticateToken,
      getAllUsers,
    );
  }
}
export default UserRoutes;
