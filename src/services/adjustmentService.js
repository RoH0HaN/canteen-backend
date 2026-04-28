import { supabase } from "../config/supabase.js";

export class AdjustmentService {
  static async insertAdjustment(adjustmentData) {
    const { data, error } = await supabase
      .from("stock_adjustments")
      .insert(adjustmentData)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
