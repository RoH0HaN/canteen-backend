import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class StockMovementService {
  static async insertStockMovement(stockMovementData) {
    const { data, error } = await supabase
      .from("stock_movements")
      .insert(stockMovementData);
    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteStockMovement(id) {
    const { error } = await supabase
      .from("stock_movements")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  static async getDailyStockSummary(date) {
    date = this.formatDateForRPC(date);
    const { data, error } = await supabase.rpc("get_daily_stock_summary", {
      target_date: date, // ISO string 'YYYY-MM-DD'
    });
    if (error) throw new Error(error.message);
    return data;
  }

  static async getItemDailyStockRange(itemId, startDate, endDate) {
    startDate = this.formatDateForRPC(startDate);
    endDate = this.formatDateForRPC(endDate);
    const { data, error } = await supabase.rpc("get_item_daily_stock_range", {
      p_item_id: itemId,
      start_date: startDate,
      end_date: endDate,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // function for date format for RPCs
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
