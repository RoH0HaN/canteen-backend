// src/services/stockMovementService.js
import pool from "../config/database.js";

export class StockMovementService {
  // ---------- Helper to get DB client ----------
  static _getDb(client) {
    return client || pool;
  }

  // ---------- Insert a stock movement ----------
  static async insertStockMovement(stockMovementData, client = null) {
    const db = this._getDb(client);
    const keys = Object.keys(stockMovementData);
    const columns = keys.join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query = `INSERT INTO stock_movements (${columns}) VALUES (${placeholders}) RETURNING *`;
    const values = Object.values(stockMovementData);
    const result = await db.query(query, values);
    if (!result.rows.length) throw new Error("Failed to insert stock movement");
    return result.rows[0];
  }

  // ---------- Delete a stock movement ----------
  static async deleteStockMovement(id, client = null) {
    const db = this._getDb(client);
    const query = "DELETE FROM stock_movements WHERE id = $1";
    await db.query(query, [id]);
    // Optionally invalidate caches if you have them
  }

  // ---------- Get daily stock summary (calls RPC) ----------
  static async getDailyStockSummary(date, client = null) {
    const db = this._getDb(client);
    const formattedDate = this.formatDateForRPC(date);
    const query = "SELECT * FROM get_daily_stock_summary($1)";
    const result = await db.query(query, [formattedDate]);
    return result.rows;
  }

  // ---------- Get daily stock for an item over a date range (calls RPC) ----------
  static async getItemDailyStockRange(
    itemId,
    startDate,
    endDate,
    client = null,
  ) {
    const db = this._getDb(client);
    const formattedStart = this.formatDateForRPC(startDate);
    const formattedEnd = this.formatDateForRPC(endDate);
    const query = "SELECT * FROM get_item_daily_stock_range($1, $2, $3)";
    const result = await db.query(query, [
      itemId,
      formattedStart,
      formattedEnd,
    ]);
    return result.rows;
  }

  // ---------- Get current stock for an item (calls RPC) ----------
  static async getCurrentStock(itemId, client = null) {
    const db = this._getDb(client);
    const query = "SELECT * FROM get_current_stock($1)";
    const result = await db.query(query, [itemId]);
    return (
      result.rows[0] || { current_stock: 0, average_rate: 0, stock_value: 0 }
    );
  }

  // ---------- Helper to format date for RPCs ----------
  static formatDateForRPC(dateInput) {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateInput}`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
