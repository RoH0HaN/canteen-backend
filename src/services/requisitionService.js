// src/services/requisitionService.js
import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class RequisitionService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ---------- Core CRUD ----------
  static async insertRequisition(requisitionData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(requisitionData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO requisitions (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(requisitionData);

    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert requisition");
    const data = result.rows[0];

    // Invalidate caches (after insert, but not critical if transaction rolls back)
    this._invalidateAllListCaches();
    return data;
  }

  static async getRequisitionById(requisitionId, client = null) {
    // Read operations normally don't need transaction, but we support client anyway
    const db = this._getDb(client);
    const cacheKey = `requisition:${requisitionId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const headerQuery = `
      SELECT 
        r.*,
        jsonb_build_object(
          'id', v.id, 'name', v.name, 'address', v.address,
          'pan_number', v.pan_number, 'type_of_organization', v.type_of_organization,
          'regd_office', v.regd_office, 'signature_url', v.signature_url,
          'phone_number', v.phone_number
        ) AS vendor,
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'role', u.role,
          'user_id', u.user_id, 'signature_url', u.signature_url,
          'designation', u.designation
        ) AS placed_by_user
      FROM requisitions r
      LEFT JOIN vendors v ON v.id = r.vendor_id
      LEFT JOIN users u ON u.id = r.placed_by
      WHERE r.id = $1
    `;
    const headerResult = await db.query(headerQuery, [requisitionId]);
    if (!headerResult.rows.length) return null;
    const row = headerResult.rows[0];

    const itemsQuery = `
      SELECT 
        ri.id,
        ri.required_quantity,
        ri.approved_quantity,
        ri.approval_remarks,
        ri.received_quantity,
        jsonb_build_object(
          'id', i.id, 'name', i.name
        ) AS item
      FROM requisition_items ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.requisition_id = $1
    `;
    const itemsResult = await db.query(itemsQuery, [requisitionId]);

    if (data.requisition_items?.length > 0) {
      const itemIds = data.requisition_items.map((ri) => ri.item.id);
      const { data: stockSummaries, error: stockError } = await supabase.rpc(
        "get_current_stock_bulk",
        { item_ids: itemIds },
      );
      if (stockError) throw new Error(stockError.message);

      const stockMap = new Map(stockSummaries.map((s) => [s.item_id, s]));
      for (const reqItem of data.requisition_items) {
        const summary = stockMap.get(reqItem.item.id);
        if (summary) {
          reqItem.item.current_stock = summary.current_stock;
          reqItem.item.average_rate = summary.average_rate;
          reqItem.item.stock_value = summary.stock_value;
        }
      }
    }

    const result = {
      id: row.id,
      reference_number: row.reference_number,
      status: row.status,
      notes: row.notes,
      bill_file_url: row.bill_file_url,
      placed_at: row.placed_at,
      created_at: row.created_at,
      placed_by: row.placed_by_user,
      vendor: row.vendor,
      items: itemsResult.rows.map((ri) => ({
        id: ri.id,
        required_quantity: ri.required_quantity,
        approved_quantity: ri.approved_quantity,
        approval_remarks: ri.approval_remarks,
        received_quantity: ri.received_quantity,
        item: ri.item,
      })),
    };

    cacheHelper.set(cacheKey, result);
    return result;
  }

  static async getAllRequisitions(
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `requisitions:list:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM requisitions r";
    if (trimmedSearch) {
      countQuery += " WHERE r.reference_number ILIKE $1 OR r.notes ILIKE $1";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated data with joins
    const dataParams = [];
    let dataQuery = `
      SELECT 
        r.id, r.reference_number, r.status, r.notes,
        r.bill_file_url, r.created_at,
        jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'user_id', u.user_id) AS placed_by_user,
        jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'pan_number', v.pan_number, 'type_of_organization', v.type_of_organization, 'regd_office', v.regd_office, 'phone_number', v.phone_number) AS vendor
      FROM requisitions r
      LEFT JOIN users u ON u.id = r.placed_by
      LEFT JOIN vendors v ON v.id = r.vendor_id
    `;
    if (trimmedSearch) {
      dataQuery += " WHERE r.reference_number ILIKE $1 OR r.notes ILIKE $1";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY r.created_at DESC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);

    const dataResult = await db.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);
    const result = {
      data: dataResult.rows.map((row) => ({
        id: row.id,
        reference_number: row.reference_number,
        status: row.status,
        notes: row.notes,
        bill_file_url: row.bill_file_url,
        created_at: row.created_at,
        placed_by: row.placed_by_user,
        vendor: row.vendor,
      })),
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

  static async getRequisitionsByStatus(
    status,
    { page = 1, limit = 10, search = "", userId = null } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `requisitions:status:${status}:${page}:${limit}:${search}:${userId || ""}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM requisitions r WHERE r.status = $1";
    countParams.push(status);
    if (trimmedSearch) {
      countQuery += " AND (r.reference_number ILIKE $2 OR r.notes ILIKE $2)";
      countParams.push(`%${trimmedSearch}%`);
    }
    if (userId) {
      countQuery += ` AND r.placed_by = $${countParams.length + 1}`;
      countParams.push(userId);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Data
    const dataParams = [];
    let dataQuery = `
      SELECT 
        r.id, r.reference_number, r.status, r.notes,
        r.bill_file_url, r.created_at,
        jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'user_id', u.user_id) AS placed_by_user,
        jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'pan_number', v.pan_number, 'type_of_organization', v.type_of_organization, 'regd_office', v.regd_office, 'phone_number', v.phone_number) AS vendor
      FROM requisitions r
      LEFT JOIN users u ON u.id = r.placed_by
      LEFT JOIN vendors v ON v.id = r.vendor_id
      WHERE r.status = $1
    `;
    dataParams.push(status);
    if (trimmedSearch) {
      dataQuery += " AND (r.reference_number ILIKE $2 OR r.notes ILIKE $2)";
      dataParams.push(`%${trimmedSearch}%`);
    }
    if (userId) {
      dataQuery += ` AND r.placed_by = $${dataParams.length + 1}`;
      dataParams.push(userId);
    }
    dataQuery +=
      " ORDER BY r.created_at DESC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);

    const dataResult = await db.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);
    const result = {
      data: dataResult.rows.map((row) => ({
        id: row.id,
        reference_number: row.reference_number,
        status: row.status,
        notes: row.notes,
        bill_file_url: row.bill_file_url,
        created_at: row.created_at,
        placed_by: row.placed_by_user,
        vendor: row.vendor,
      })),
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

  static async getRequisitionsByVendorId(
    vendorId,
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `requisitions:vendor:${vendorId}:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count
    const countParams = [];
    let countQuery =
      "SELECT COUNT(*) FROM requisitions r WHERE r.vendor_id = $1";
    countParams.push(vendorId);
    if (trimmedSearch) {
      countQuery += " AND (r.reference_number ILIKE $2 OR r.notes ILIKE $2)";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Data
    const dataParams = [];
    let dataQuery = `
      SELECT 
        r.id, r.reference_number, r.status, r.notes,
        r.bill_file_url, r.created_at,
        jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'user_id', u.user_id) AS placed_by_user,
        jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'pan_number', v.pan_number, 'type_of_organization', v.type_of_organization, 'regd_office', v.regd_office, 'phone_number', v.phone_number) AS vendor
      FROM requisitions r
      LEFT JOIN users u ON u.id = r.placed_by
      LEFT JOIN vendors v ON v.id = r.vendor_id
      WHERE r.vendor_id = $1
    `;
    dataParams.push(vendorId);
    if (trimmedSearch) {
      dataQuery += " AND (r.reference_number ILIKE $2 OR r.notes ILIKE $2)";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY r.created_at DESC LIMIT $" +
      (dataParams.length + 1) +
      " OFFSET $" +
      (dataParams.length + 2);
    dataParams.push(limit, offset);

    const dataResult = await db.query(dataQuery, dataParams);

    const totalPages = Math.ceil(total / limit);
    const result = {
      data: dataResult.rows.map((row) => ({
        id: row.id,
        reference_number: row.reference_number,
        status: row.status,
        notes: row.notes,
        bill_file_url: row.bill_file_url,
        created_at: row.created_at,
        placed_by: row.placed_by_user,
        vendor: row.vendor,
      })),
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

  static async updateRequisition(requisitionId, updateData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return this.getRequisitionById(requisitionId, client);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE requisitions SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updateData), requisitionId];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Requisition not found");
    const data = result.rows[0];
    this._invalidateRequisitionCache(requisitionId);
    return data;
  }

  static async deleteRequisition(requisitionId, client = null) {
    const db = this._getDb(client);
    const query = "DELETE FROM requisitions WHERE id = $1";
    await db.query(query, [requisitionId]);
    this._invalidateRequisitionCache(requisitionId);
  }

  // ---------- Requisition Items ----------
  static async insertRequisitionItems(itemsData, client = null) {
    const db = this._getDb(client);
    if (!Array.isArray(itemsData)) itemsData = [itemsData];
    if (itemsData.length === 0) return [];

    const keys = Object.keys(itemsData[0]);
    const columns = keys.join(", ");
    const placeholders = itemsData
      .map((_, i) =>
        keys.map((_, j) => `$${i * keys.length + j + 1}`).join(", "),
      )
      .join("), (");
    const query = `INSERT INTO requisition_items (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = itemsData.flatMap((obj) => Object.values(obj));
    const result = await db.query(query, values);
    if (itemsData[0].requisition_id) {
      this._invalidateRequisitionCache(itemsData[0].requisition_id);
    }
    return result.rows;
  }

  static async getRequisitionItemById(itemId, client = null) {
    const db = this._getDb(client);
    const query = "SELECT * FROM requisition_items WHERE id = $1";
    const result = await db.query(query, [itemId]);
    return result.rows[0] || null;
  }

  static async updateRequisitionItem(itemId, updateData, client = null) {
    const db = this._getDb(client);
    // First get requisition_id to invalidate later
    const itemQuery =
      "SELECT requisition_id FROM requisition_items WHERE id = $1";
    const itemResult = await db.query(itemQuery, [itemId]);
    const reqId = itemResult.rows[0]?.requisition_id;

    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return this.getRequisitionItemById(itemId, client);
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE requisition_items SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(updateData), itemId];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Requisition item not found");
    if (reqId) this._invalidateRequisitionCache(reqId);
    return result.rows[0];
  }

  static async deleteRequisitionItem(itemId, client = null) {
    const db = this._getDb(client);
    const itemQuery =
      "SELECT requisition_id FROM requisition_items WHERE id = $1";
    const itemResult = await db.query(itemQuery, [itemId]);
    const reqId = itemResult.rows[0]?.requisition_id;

    const query = "DELETE FROM requisition_items WHERE id = $1";
    await db.query(query, [itemId]);
    if (reqId) this._invalidateRequisitionCache(reqId);
  }

  // ---------- Status Log ----------
  static async insertRequisitionStatusLog(logData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(logData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO requisition_status_log (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(logData);
    const result = await db.query(query, values);
    if (logData.requisition_id) {
      this._invalidateRequisitionCache(logData.requisition_id);
    }
    return result.rows[0];
  }

  static async getRequisitionStatusLogByRequisitionId(
    requisitionId,
    client = null,
  ) {
    const db = this._getDb(client);
    const query = `
      SELECT 
        l.*,
        jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'user_id', u.user_id, 'signature_url', u.signature_url, 'designation', u.designation) AS changed_by_user
      FROM requisition_status_log l
      LEFT JOIN users u ON u.id = l.changed_by
      WHERE l.requisition_id = $1
      ORDER BY l.changed_at ASC
    `;
    const result = await db.query(query, [requisitionId]);
    return result.rows;
  }

  // ---------- Generate Reference Number ----------
  static async generateRequisitionReferenceNumber(client = null) {
    const db = this._getDb(client);
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const startOfDay = new Date(year, now.getMonth(), now.getDate());
    const endOfDay = new Date(year, now.getMonth(), now.getDate() + 1);

    const query = `
      SELECT COUNT(*) FROM requisitions 
      WHERE created_at >= $1 AND created_at < $2
    `;
    const result = await db.query(query, [
      startOfDay.toISOString(),
      endOfDay.toISOString(),
    ]);
    const count = parseInt(result.rows[0].count, 10);
    const nextSeq = count + 1;
    const seqPadded = String(nextSeq).padStart(3, "0");
    return `REQ-${dateStr}-${seqPadded}`;
  }

  // ---------- Cache Helpers ----------
  static _invalidateRequisitionCache(requisitionId) {
    cacheHelper.del(`requisition:${requisitionId}`);
    this._invalidateAllListCaches();
  }

  static _invalidateAllListCaches() {
    cacheHelper.delPattern("requisitions:");
  }
}
