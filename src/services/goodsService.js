import { supabase } from "../config/supabase.js";

export class GoodsService {
  static async findGoodById(goodId) {
    const { data, error } = await supabase
      .from("goods")
      .select("*")
      .eq("id", goodId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async incrementStock(goodId, quantity) {
    const { error } = await supabase.rpc("increment_stock", {
      good_id: goodId,
      quantity: quantity,
    });
    if (error) throw new Error(`Stock update failed: ${error.message}`);
  }

  static async decrementStockIfAvailable(goodId, quantity) {
    const { data: success, error } = await supabase.rpc("decrement_stock", {
      p_good_id: goodId,
      p_quantity: quantity,
    });

    if (error) throw new Error(`Stock decrement failed: ${error.message}`);
    if (!success) throw new Error("Insufficient stock");
    return true;
  }

  static async insertGood(goodData) {
    const { data, error } = await supabase
      .from("goods")
      .insert(goodData)
      .select()
      .single();
    if (error) throw new Error(`Failed to insert good: ${error.message}`);
    return data;
  }

  static async updateGood(goodId, updateData) {
    const { data, error } = await supabase
      .from("goods")
      .update(updateData)
      .eq("id", goodId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update good: ${error.message}`);
    return data;
  }

  static async deleteGood(goodId) {
    const { error } = await supabase.from("goods").delete().eq("id", goodId);
    if (error) throw new Error(`Failed to delete good: ${error.message}`);
    return true;
  }

  static async adjustStock(goodId, quantityChange) {
    const { error } = await supabase.rpc("adjust_stock", {
      p_good_id: goodId,
      p_amount: quantityChange,
    });
    if (error) throw new Error(`Stock adjustment failed: ${error.message}`);
  }

  static async getAllGoods() {
    const { data, error } = await supabase.from("goods").select("*");
    if (error) throw new Error(`Failed to fetch goods: ${error.message}`);
    return data;
  }
}
