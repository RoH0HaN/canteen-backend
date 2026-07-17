import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class ItemService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ----- Insert a new item (invalidate all item caches) -----
  static async insertItem(itemData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(itemData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO items (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(itemData);

    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert item");
    const data = result.rows[0];

    this._invalidateAllItemCaches();
    return data;
  }

  // ----- Get item by ID (cached) -----
  static async getItemById(id, client = null) {
    const db = this._getDb(client);
    const cacheKey = `item:id:${id}`;
    let item = cacheHelper.get(cacheKey);
    if (item) return item;

    const query = "SELECT * FROM items WHERE id = $1";
    const result = await db.query(query, [id]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Get item by name (cached) -----
  static async getItemByName(name, client = null) {
    const db = this._getDb(client);
    const cacheKey = `item:name:${name}`;
    let item = cacheHelper.get(cacheKey);
    if (item) return item;

    const query = "SELECT * FROM items WHERE name = $1";
    const result = await db.query(query, [name]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Update item (invalidate specific caches) -----
  static async updateItem(id, updates, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return this.getItemById(id, client);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE items SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updates), id];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Item not found");
    const data = result.rows[0];

    // Invalidate caches for this item
    cacheHelper.del(`item:id:${id}`);
    if (updates.name) cacheHelper.del(`item:name:${updates.name}`);
    cacheHelper.delPattern("items:");
    return data;
  }

  // ----- Delete item (invalidate caches) -----
  static async deleteItem(id, client = null) {
    const db = this._getDb(client);
    const item = await this.getItemById(id, client);
    if (!item) throw new Error("Item not found");

    const query = "DELETE FROM items WHERE id = $1";
    await db.query(query, [id]);

    this._invalidateAllItemCaches();
  }

  // ----- Get all items with pagination, optional search -----
  static async getAllItems(
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    const cacheKey = `items:all:${page}:${limit}:${trimmedSearch}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    // Count total items (with search filter)
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM items i";
    if (trimmedSearch) {
      countQuery += " WHERE i.name ILIKE $1";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated items with base unit name
    const dataParams = [];
    let dataQuery = `
    SELECT 
      i.*,
      u.name AS base_unit_name,
      u.symbol AS base_unit_symbol
    FROM items i
    LEFT JOIN units u ON u.id = i.base_unit_id
  `;
    if (trimmedSearch) {
      dataQuery += " WHERE i.name ILIKE $1";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY i.name ASC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);

    const dataResult = await db.query(dataQuery, dataParams);
    const items = dataResult.rows;

    // Fetch current stock for all items in bulk
    if (items.length > 0) {
      const itemIds = items.map((item) => item.id);
      const stockQuery = "SELECT * FROM get_current_stock_bulk($1)";
      const stockResult = await db.query(stockQuery, [itemIds]);
      const stockMap = new Map(
        stockResult.rows.map((row) => [row.item_id, row]),
      );

      // Attach stock info to each item
      for (const item of items) {
        const stock = stockMap.get(item.id);
        item.current_stock = stock?.current_stock || 0;
        item.average_rate = stock?.average_rate || 0;
        item.stock_value = stock?.stock_value || 0;
      }
    }

    const totalPages = Math.ceil(total / limit);
    const result = {
      data: items,
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

  // ----- Helper: Invalidate all item caches -----
  static _invalidateAllItemCaches() {
    cacheHelper.delPattern("item:");
    cacheHelper.delPattern("items:");
  }
}
