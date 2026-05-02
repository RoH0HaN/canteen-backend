import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";
import { AppError } from "../utils/AppError.js";
import NodeCache from "node-cache";

// Cache for blacklisted refresh tokens (TTL in seconds)
const tokenBlacklist = new NodeCache();

/**
 * Generate access and refresh tokens
 * @param {Object} payload - { id, user_id, role }
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
  });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  });
  return { accessToken, refreshToken };
};

// Helper: Get user from Supabase by ID
const getUserById = async (id) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, user_id, name, role, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError("Database error", 500);
  return data;
};

// Helper: Update refresh token in DB
export const updateUserRefreshToken = async (userId, refreshToken) => {
  const { error } = await supabase
    .from("users")
    .update({ refresh_token: refreshToken })
    .eq("id", userId);
  if (error) throw new AppError("Failed to store refresh token", 500);
};

export const authMiddleware = {
  /**
   * Verify JWT access token and attach user to request
   */
  authenticateToken: async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];

      const bearerToken = authHeader && authHeader.split(" ")[1];
      const cookieToken = req.cookies?.accessToken;
      const token = bearerToken || cookieToken;

      if (!token) {
        throw new AppError("Access token required", 401);
      }

      // Verify access token
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      // Fetch user from Supabase
      const user = await getUserById(decoded.id);
      if (!user || user.status !== "active") {
        throw new AppError("User no longer exists or is inactive", 401);
      }

      // Attach user info to request
      req.user = {
        id: user.id,
        userId: user.user_id,
        name: user.name,
        role: user.role,
      };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new AppError("Access token expired", 401));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new AppError("Invalid token", 401));
      }
      next(error);
    }
  },

  /**
   * Verify Refresh Token (used when issuing new access tokens)
   * Checks cache blacklist and DB stored token.
   */
  verifyRefreshToken: async (token) => {
    // 1. Check in-memory blacklist
    const isBlacklisted = tokenBlacklist.get(token);
    if (isBlacklisted) {
      throw new AppError("Refresh token has been revoked", 401);
    }

    // 2. Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    // 3. Verify that the token matches the one stored in DB (optional but recommended)
    const { data: user, error } = await supabase
      .from("users")
      .select("refresh_token")
      .eq("id", decoded.id)
      .maybeSingle();
    if (error || !user || user.refresh_token !== token) {
      throw new AppError("Refresh token mismatch or invalid", 401);
    }

    return decoded; // payload
  },

  /**
   * Blacklist a refresh token (on logout)
   */
  addToBlacklist: async (token) => {
    // Decode to get expiry time
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return;
      const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttlSeconds > 0) {
        tokenBlacklist.set(token, "blacklisted", ttlSeconds);
      }
      // Also optionally clear the refresh_token from DB
      const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      await supabase
        .from("users")
        .update({ refresh_token: null })
        .eq("id", payload.id);
    } catch (err) {
      // If token already expired or invalid, ignore
    }
  },

  /**
   * Optional: Clear blacklist (useful for testing)
   */
  clearBlacklist: () => {
    tokenBlacklist.flushAll();
  },
};
