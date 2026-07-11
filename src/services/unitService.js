import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class UnitService {
  // ---------- Get all units (with optional category filter) ----------
  static async getAllUnits({ category = null } = {}) {
    const cacheKey = `units:all:${category || "all"}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    let query = "SELECT * FROM units";
    const params = [];
    if (category) {
      query += " WHERE category = $1";
      params.push(category);
    }
    query += " ORDER BY category, name";
    const result = await pool.query(query, params);
    cacheHelper.set(cacheKey, result.rows);
    return result.rows;
  }

  // ---------- Get a unit by ID ----------
  static async getUnitById(id) {
    const cacheKey = `unit:${id}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const result = await pool.query("SELECT * FROM units WHERE id = $1", [id]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ---------- Create a new unit ----------
  static async createUnit(unitData) {
    const keys = Object.keys(unitData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO units (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(unitData);
    const result = await pool.query(query, values);
    if (!result.rows.length) throw new Error("Failed to create unit");
    const data = result.rows[0];
    this._invalidateAllUnitCaches();
    return data;
  }

  // ---------- Update a unit ----------
  static async updateUnit(id, updates) {
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return this.getUnitById(id);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE units SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updates), id];
    const result = await pool.query(query, values);
    if (!result.rows.length) throw new Error("Unit not found");
    const data = result.rows[0];
    this._invalidateAllUnitCaches();
    return data;
  }

  // ---------- Delete a unit (if not referenced) ----------
  static async deleteUnit(id) {
    // Check if unit is referenced in items.base_unit_id or product_packaging
    const checkQuery = `
      SELECT EXISTS (
        SELECT 1 FROM items WHERE base_unit_id = $1
        UNION
        SELECT 1 FROM product_packaging WHERE from_unit_id = $1
      )
    `;
    const checkResult = await pool.query(checkQuery, [id]);
    if (checkResult.rows[0].exists) {
      throw new Error("Unit is in use and cannot be deleted");
    }
    await pool.query("DELETE FROM units WHERE id = $1", [id]);
    this._invalidateAllUnitCaches();
  }

  // ---------- Cache invalidation ----------
  static _invalidateAllUnitCaches() {
    cacheHelper.delPattern("unit:");
    cacheHelper.delPattern("units:");
  }
}
