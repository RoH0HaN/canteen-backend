// src/services/vendorService.js
import pool from "../config/database.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class VendorService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ----- Single vendor by ID (cached) -----
  static async getVendorById(id, client = null) {
    const db = this._getDb(client);
    const cacheKey = `vendor:${id}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor) return vendor;

    const query = "SELECT * FROM vendors WHERE id = $1";
    const result = await db.query(query, [id]);
    const data = result.rows[0] || null;
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Vendor by PAN (cached) -----
  static async getVendorByPan(pan_number, client = null) {
    const db = this._getDb(client);
    const cacheKey = `vendor:pan:${pan_number}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor !== undefined) return vendor; // null means not found

    const query = "SELECT * FROM vendors WHERE pan_number = $1";
    const result = await db.query(query, [pan_number]);
    const data = result.rows[0] || null;
    cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Vendor by Phone (cached) -----
  static async getVendorByPhone(phone_number, client = null) {
    const db = this._getDb(client);
    const cacheKey = `vendor:phone:${phone_number}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor !== undefined) return vendor;

    const query = "SELECT * FROM vendors WHERE phone_number = $1";
    const result = await db.query(query, [phone_number]);
    const data = result.rows[0] || null;
    cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Insert new vendor (clear relevant caches) -----
  static async insertVendor(vendorData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(vendorData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO vendors (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(vendorData);
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert vendor");
    const data = result.rows[0];

    // Invalidate paginated lists
    cacheHelper.delPattern("vendors:");
    return data;
  }

  // ----- Update vendor (clear caches for this vendor and lists) -----
  static async updateVendor(id, vendorData, client = null) {
    const db = this._getDb(client);
    // Fetch old vendor data to know previous PAN and phone for cache invalidation
    const oldVendor = await this.getVendorById(id, client);
    if (!oldVendor) throw new Error("Vendor not found");

    const keys = Object.keys(vendorData);
    if (keys.length === 0) {
      return oldVendor;
    }
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const query = `UPDATE vendors SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
    const values = [...Object.values(vendorData), id];
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Vendor not found");
    const data = result.rows[0];

    // Invalidate specific vendor cache
    cacheHelper.del(`vendor:${id}`);

    // Invalidate old PAN cache if changed
    if (
      vendorData.pan_number &&
      vendorData.pan_number !== oldVendor.pan_number
    ) {
      cacheHelper.del(`vendor:pan:${oldVendor.pan_number}`);
      cacheHelper.del(`vendor:pan:${vendorData.pan_number}`);
    } else if (oldVendor.pan_number) {
      cacheHelper.del(`vendor:pan:${oldVendor.pan_number}`);
    }

    // Invalidate old phone cache if changed
    if (
      vendorData.phone_number &&
      vendorData.phone_number !== oldVendor.phone_number
    ) {
      cacheHelper.del(`vendor:phone:${oldVendor.phone_number}`);
      cacheHelper.del(`vendor:phone:${vendorData.phone_number}`);
    } else if (oldVendor.phone_number) {
      cacheHelper.del(`vendor:phone:${oldVendor.phone_number}`);
    }

    // Invalidate all list caches
    cacheHelper.delPattern("vendors:");
    return data;
  }

  // ----- Delete vendor (clear all related caches) -----
  static async deleteVendor(id, client = null) {
    const db = this._getDb(client);
    const vendor = await this.getVendorById(id, client);
    if (!vendor) throw new Error("Vendor not found");

    const query = "DELETE FROM vendors WHERE id = $1";
    await db.query(query, [id]);

    // Invalidate all caches related to this vendor
    cacheHelper.del(`vendor:${id}`);
    if (vendor.pan_number) cacheHelper.del(`vendor:pan:${vendor.pan_number}`);
    if (vendor.phone_number)
      cacheHelper.del(`vendor:phone:${vendor.phone_number}`);
    cacheHelper.delPattern("vendors:");
  }

  // ----- Get all vendors with pagination & search (cached by query) -----
  static async getVendors(
    { page = 1, limit = 10, search = "" } = {},
    client = null,
  ) {
    const db = this._getDb(client);
    const cacheKey = `vendors:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    const countParams = [];
    let countQuery = "SELECT COUNT(*) FROM vendors";
    if (trimmedSearch) {
      countQuery += " WHERE name ILIKE $1";
      countParams.push(`%${trimmedSearch}%`);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch data
    const dataParams = [];
    let dataQuery = "SELECT * FROM vendors";
    if (trimmedSearch) {
      dataQuery += " WHERE name ILIKE $1";
      dataParams.push(`%${trimmedSearch}%`);
    }
    dataQuery +=
      " ORDER BY name ASC LIMIT $" +
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
}
