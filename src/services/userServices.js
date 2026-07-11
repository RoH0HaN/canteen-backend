// src/services/userService.js
import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class UserService {
  // ----- Single user by primary key (id) -----
  static async getUserById(id) {
    const cacheKey = `user:id:${id}`;
    let user = cacheHelper.get(cacheKey);
    if (user) return user;

    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Single user by unique user_id (text) -----
  static async getUserByUserId(userId) {
    const cacheKey = `user:userId:${userId}`;
    let user = cacheHelper.get(cacheKey);
    if (user) return user;

    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      userId,
    ]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Insert new user (invalidate all user caches) -----
  static async insertUser(userData) {
    const keys = Object.keys(userData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO users (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(userData);

    const result = await pool.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert user");
    const data = result.rows[0];

    this._invalidateAllUserCaches();
    return data;
  }

  // ----- Update user (invalidate specific user caches) -----
  static async updateUser(id, updates) {
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return this.getUserById(id); // no changes, return existing
    }

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE users SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updates), id];

    const result = await pool.query(query, values);
    if (!result.rows.length) throw new Error("User not found");
    const data = result.rows[0];

    this._invalidateUserCaches(data);
    return data;
  }

  // ----- Save refresh token (updates by user_id, invalidates caches) -----
  static async saveRefreshToken(userId, refreshToken) {
    const query =
      "UPDATE users SET refresh_token = $1 WHERE user_id = $2 RETURNING *";
    const result = await pool.query(query, [refreshToken, userId]);
    if (!result.rows.length) throw new Error("User not found");
    const user = result.rows[0];

    this._invalidateUserCaches(user);
  }

  // ----- Get all users with pagination and optional search -----
  static async getAllUsers({ page = 1, limit = 10, search = "" } = {}) {
    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    const cacheKey = `users:all:${page}:${limit}:${trimmedSearch}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    // Count total
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM users";
    if (trimmedSearch) {
      countQuery += " WHERE name ILIKE $1 OR user_id ILIKE $1";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch data
    const dataParams = [];
    let dataQuery = "SELECT * FROM users";
    if (trimmedSearch) {
      dataQuery += " WHERE name ILIKE $1 OR user_id ILIKE $1";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY name ASC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);

    const dataResult = await pool.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);
    const result = {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        search: trimmedSearch,
      },
    };

    cacheHelper.set(cacheKey, result);
    return result;
  }

  // ----- Helper: Invalidate caches for a specific user -----
  static _invalidateUserCaches(user) {
    if (user) {
      cacheHelper.del(`user:id:${user.id}`);
      cacheHelper.del(`user:userId:${user.user_id}`);
    }
    cacheHelper.delPattern("users:");
  }

  // ----- Helper: Invalidate all user‑related caches (used after insert) -----
  static _invalidateAllUserCaches() {
    cacheHelper.delPattern("user:");
    cacheHelper.delPattern("users:");
  }
}
