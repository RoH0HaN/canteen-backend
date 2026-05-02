import { supabase } from "../config/supabase.js";

export class ConsumptionService {
  static async getConsumptionById(consumptionId) {
    const { data, error } = await supabase
      .from("consumption_events")
      .select("*")
      .eq("id", consumptionId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async insertConsumption(consumptionData) {
    const { data, error } = await supabase
      .from("consumption_events")
      .insert(consumptionData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async updateConsumption(consumptionId, updateData) {
    const { data, error } = await supabase
      .from("consumption_events")
      .update(updateData)
      .eq("id", consumptionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async insertConsumptionItem(itemData) {
    const { data, error } = await supabase
      .from("consumption_items")
      .insert(itemData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async updateConsumptionItem(itemId, updateData) {
    const { data, error } = await supabase
      .from("consumption_items")
      .update(updateData)
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
