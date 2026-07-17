// src/services/consumptionService.js
import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class ConsumptionService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ---------- Consumption Events ----------
  static async getConsumptionById(consumptionId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `consumption:${consumptionId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    // Fetch header with placed_by details
    const headerQuery = `
      SELECT 
        ce.*,
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'user_id', u.user_id,
          'designation', u.designation, 'role', u.role, 'signature_url', u.signature_url
        ) AS placed_by_user
      FROM consumption_events ce
      LEFT JOIN users u ON u.id = ce.placed_by
      WHERE ce.id = $1
    `;
    const headerResult = await db.query(headerQuery, [consumptionId]);
    if (!headerResult.rows.length) return null;
    const row = headerResult.rows[0];

    // Fetch consumption items with item details
    const itemsQuery = `
      SELECT 
        ci.id,
        ci.quantity,
        ci.unit_id,
        ci.approved_quantity,
        ci.approval_remarks,
        jsonb_build_object(
          'id', i.id, 'name', i.name, 'base_unit_id', i.base_unit_id
        ) AS item
      FROM consumption_items ci
      JOIN items i ON i.id = ci.item_id
      WHERE ci.consumption_event_id = $1
    `;
    const itemsResult = await db.query(itemsQuery, [consumptionId]);

    const result = {
      id: row.id,
      reference_number: row.reference_number,
      purpose: row.purpose,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      placed_by: row.placed_by_user,
      items: itemsResult.rows.map((ci) => ({
        id: ci.id,
        quantity: ci.quantity,
        unit_id: ci.unit_id,
        approved_quantity: ci.approved_quantity,
        approval_remarks: ci.approval_remarks,
        item: ci.item,
      })),
    };

    cacheHelper.set(cacheKey, result);
    return result;
  }

  static async insertConsumption(consumptionData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(consumptionData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO consumption_events (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(consumptionData);
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert consumption");
    const data = result.rows[0];
    cacheHelper.delPattern("consumptions:"); // invalidate list caches
    return data;
  }

  static async updateConsumption(consumptionId, updateData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return this.getConsumptionById(consumptionId, client);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE consumption_events SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updateData), consumptionId];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Consumption not found");
    const data = result.rows[0];
    cacheHelper.del(`consumption:${consumptionId}`);
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async deleteConsumption(consumptionId, client = null) {
    const db = this._getDb(client);
    // Delete items first (if cascade not set)
    await db.query(
      "DELETE FROM consumption_items WHERE consumption_event_id = $1",
      [consumptionId],
    );
    await db.query("DELETE FROM consumption_events WHERE id = $1", [
      consumptionId,
    ]);
    cacheHelper.del(`consumption:${consumptionId}`);
    cacheHelper.delPattern("consumptions:");
  }

  static async getAllConsumptions(
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `consumptions:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM consumption_events ce";
    if (trimmedSearch) {
      countQuery += " WHERE ce.purpose ILIKE $1 OR ce.notes ILIKE $1";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated data with placed_by details (no items for list view)
    const dataParams = [];
    let dataQuery = `
      SELECT 
        ce.id,
        ce.reference_number,
        ce.status,
        ce.purpose,
        ce.notes,
        ce.created_at,
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'user_id', u.user_id,
          'designation', u.designation, 'role', u.role, 'signature_url', u.signature_url
        ) AS placed_by_user
      FROM consumption_events ce
      LEFT JOIN users u ON u.id = ce.placed_by
    `;
    if (trimmedSearch) {
      dataQuery += " WHERE ce.purpose ILIKE $1 OR ce.notes ILIKE $1";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY ce.created_at DESC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);
    const dataResult = await db.query(dataQuery, dataParams);

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

  static async getConsumptionsByStatus(
    status,
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `consumptions:${status}:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    const countParams = [];
    let countQuery =
      "SELECT COUNT(*) FROM consumption_events ce WHERE ce.status = $1";
    countParams.push(status);
    if (trimmedSearch) {
      countQuery += " AND (ce.purpose ILIKE $2 OR ce.notes ILIKE $2)";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated data
    const dataParams = [];
    let dataQuery = `
      SELECT 
        ce.id,
        ce.reference_number,
        ce.status,
        ce.purpose,
        ce.notes,
        ce.created_at,
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'user_id', u.user_id,
          'designation', u.designation, 'role', u.role, 'signature_url', u.signature_url
        ) AS placed_by_user
      FROM consumption_events ce
      LEFT JOIN users u ON u.id = ce.placed_by
      WHERE ce.status = $1
    `;
    dataParams.push(status);
    if (trimmedSearch) {
      dataQuery += " AND (ce.purpose ILIKE $2 OR ce.notes ILIKE $2)";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY ce.created_at DESC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);
    const dataResult = await db.query(dataQuery, dataParams);

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

  // ---------- Consumption Items ----------
  static async insertConsumptionItem(itemData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(itemData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO consumption_items (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(itemData);
    const result = await db.query(query, values);
    if (!result.rows.length)
      throw new Error("Failed to insert consumption item");
    const data = result.rows[0];
    if (itemData.consumption_event_id) {
      cacheHelper.del(`consumption:${itemData.consumption_event_id}`);
    }
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async updateConsumptionItem(itemId, updateData, client = null) {
    const db = this._getDb(client);
    // Get consumption_event_id to invalidate later
    const existingQuery =
      "SELECT consumption_event_id FROM consumption_items WHERE id = $1";
    const existingResult = await db.query(existingQuery, [itemId]);
    const eventId = existingResult.rows[0]?.consumption_event_id;

    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return this.getConsumptionItemById(itemId, client);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE consumption_items SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updateData), itemId];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Consumption item not found");
    const data = result.rows[0];
    if (eventId) cacheHelper.del(`consumption:${eventId}`);
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async getConsumptionItemById(itemId, client = null) {
    const db = this._getDb(client);
    const cacheKey = `consumption_item:${itemId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const query = "SELECT * FROM consumption_items WHERE id = $1";
    const result = await db.query(query, [itemId]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  static async deleteConsumptionItem(itemId) {
    // Get consumption_event_id to invalidate later
    const { data: existing } = await supabase
      .from("consumption_items")
      .select("consumption_event_id")
      .eq("id", itemId)
      .single();
    const { error } = await supabase
      .from("consumption_items")
      .delete()
      .eq("id", itemId);
    if (error) throw new Error(error.message);
    if (existing?.consumption_event_id) {
      cacheHelper.del(`consumption:${existing.consumption_event_id}`);
    }
    cacheHelper.delPattern("consumptions:");
  }

  // ---------- Generate Reference Number ----------
  static async generateConsumptionReferenceNumber(client = null) {
    const db = this._getDb(client);
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const startOfDay = new Date(year, now.getMonth(), now.getDate());
    const endOfDay = new Date(year, now.getMonth(), now.getDate() + 1);

    const query = `
      SELECT COUNT(*) FROM consumption_events
      WHERE created_at >= $1 AND created_at < $2
    `;
    const result = await db.query(query, [
      startOfDay.toISOString(),
      endOfDay.toISOString(),
    ]);
    const count = parseInt(result.rows[0].count, 10);
    const nextSeq = count + 1;
    const seqPadded = String(nextSeq).padStart(3, "0");
    return `CON-${dateStr}-${seqPadded}`;
  }

  // ---------- Status Log ----------
  static async insertConsumptionStatusLog(logData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(logData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO consumption_status_log (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(logData);
    const result = await db.query(query, values);
    if (!result.rows.length)
      throw new Error("Failed to insert consumption status log");
    return result.rows[0];
  }
}
