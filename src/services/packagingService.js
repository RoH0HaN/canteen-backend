// src/services/packagingService.js
import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class PackagingService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ---------- Get all packaging entries for an item ----------
  static async getPackagingByItemId(itemId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `packaging:item:${itemId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        pp.*,
        u.name AS unit_name,
        u.symbol AS unit_symbol,
        u.category AS unit_category
      FROM product_packaging pp
      JOIN units u ON u.id = pp.from_unit_id
      WHERE pp.item_id = $1
    `;
    const result = await db.query(query, [itemId]);
    const data = result.rows;
    cacheHelper.set(cacheKey, data);
    return data;
  }

  // ---------- Get a single packaging entry ----------
  static async getPackagingById(packagingId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `packaging:${packagingId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT 
        pp.*,
        u.name AS unit_name,
        u.symbol AS unit_symbol,
        u.category AS unit_category
      FROM product_packaging pp
      JOIN units u ON u.id = pp.from_unit_id
      WHERE pp.id = $1
    `;
    const result = await db.query(query, [packagingId]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ---------- Create a new packaging entry ----------
  static async createPackaging(packagingData, client = null) {
    const db = this._getDb(client);
    const { item_id, from_unit_id, quantity_in_base_unit } = packagingData;

    // Validate that from_unit_id is not the same as the item's base_unit
    const baseCheck = await db.query(
      "SELECT base_unit_id FROM items WHERE id = $1",
      [item_id],
    );
    if (!baseCheck.rows.length) throw new Error("Item not found");
    const baseUnitId = baseCheck.rows[0].base_unit_id;
    if (from_unit_id === baseUnitId) {
      throw new Error("Cannot add packaging for the base unit itself");
    }

    // Check if this unit is already defined for this item
    const exists = await db.query(
      "SELECT id FROM product_packaging WHERE item_id = $1 AND from_unit_id = $2",
      [item_id, from_unit_id],
    );
    if (exists.rows.length) {
      throw new Error("Packaging for this unit already exists for this item");
    }

    const query = `
      INSERT INTO product_packaging (item_id, from_unit_id, quantity_in_base_unit)
      VALUES ($1, $2, $3) RETURNING *
    `;
    const result = await db.query(query, [
      item_id,
      from_unit_id,
      quantity_in_base_unit,
    ]);
    if (!result.rows.length) throw new Error("Failed to create packaging");
    const data = result.rows[0];
    this._invalidatePackagingCaches(item_id, data.id);
    return data;
  }

  // ---------- Update a packaging entry ----------
  static async updatePackaging(packagingId, updates, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return this.getPackagingById(packagingId, client);
    }

    // Get item_id to invalidate cache later
    const itemResult = await db.query(
      "SELECT item_id FROM product_packaging WHERE id = $1",
      [packagingId],
    );
    const itemId = itemResult.rows[0]?.item_id;
    if (!itemId) throw new Error("Packaging not found");

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE product_packaging SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updates), packagingId];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Packaging not found");
    const data = result.rows[0];
    this._invalidatePackagingCaches(itemId, packagingId);
    return data;
  }

  // ---------- Delete a packaging entry ----------
  static async deletePackaging(packagingId, client = null) {
    const db = this._getDb(client);
    const itemResult = await db.query(
      "SELECT item_id FROM product_packaging WHERE id = $1",
      [packagingId],
    );
    const itemId = itemResult.rows[0]?.item_id;
    if (!itemId) throw new Error("Packaging not found");

    await db.query("DELETE FROM product_packaging WHERE id = $1", [
      packagingId,
    ]);
    this._invalidatePackagingCaches(itemId, packagingId);
  }

  // ---------- Cache invalidation ----------
  static _invalidatePackagingCaches(itemId, packagingId = null) {
    cacheHelper.del(`packaging:item:${itemId}`);
    if (packagingId) cacheHelper.del(`packaging:${packagingId}`);
    // Also invalidate items lists if you include packaging in item responses
    cacheHelper.delPattern("items:");
  }
}
