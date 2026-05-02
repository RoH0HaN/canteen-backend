import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class ConsumptionService {
  // ---------- Consumption Events ----------
  static async getConsumptionById(consumptionId) {
    const cacheKey = `consumption:${consumptionId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("consumption_events")
      .select(
        `
        *,
        consumption_items (
          id,
          quantity,
          item:items (id, name, unit, current_stock)
        ),
        placed_by_user:users!placed_by (id, name, user_id, designation, role, signature_url)
      `,
      )
      .eq("id", consumptionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    // Transform to clean structure
    const result = {
      id: data.id,
      purpose: data.purpose,
      notes: data.notes,
      placed_at: data.placed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      placed_by: data.placed_by_user,
      items:
        data.consumption_items?.map((ci) => ({
          id: ci.id,
          quantity: ci.quantity,
          item: ci.item,
        })) || [],
    };

    cacheHelper.set(cacheKey, result);
    return result;
  }

  static async insertConsumption(consumptionData) {
    const { data, error } = await supabase
      .from("consumption_events")
      .insert(consumptionData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    cacheHelper.delPattern("consumptions:"); // invalidate list caches
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
    cacheHelper.del(`consumption:${consumptionId}`);
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async deleteConsumption(consumptionId) {
    // Delete items first (if cascade not set)
    const { error: itemsError } = await supabase
      .from("consumption_items")
      .delete()
      .eq("consumption_event_id", consumptionId);
    if (itemsError) throw new Error(itemsError.message);

    const { error } = await supabase
      .from("consumption_events")
      .delete()
      .eq("id", consumptionId);
    if (error) throw new Error(error.message);

    cacheHelper.del(`consumption:${consumptionId}`);
    cacheHelper.delPattern("consumptions:");
  }

  static async getAllConsumptions({ page = 1, limit = 10, search = "" } = {}) {
    const cacheKey = `consumptions:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    let countQuery = supabase
      .from("consumption_events")
      .select("*", { count: "exact", head: true });
    if (trimmedSearch) {
      countQuery = countQuery.or(
        `purpose.ilike.%${trimmedSearch}%,notes.ilike.%${trimmedSearch}%`,
      );
    }
    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    // Fetch paginated data with basic joins (no items for list view)
    let dataQuery = supabase
      .from("consumption_events")
      .select(
        `
        id,
        purpose,
        notes,
        placed_at,
        created_at,
        placed_by_user:users!placed_by (id, name, user_id, designation, role, signature_url)
      `,
      )
      .order("placed_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (trimmedSearch) {
      dataQuery = dataQuery.or(
        `purpose.ilike.%${trimmedSearch}%,notes.ilike.%${trimmedSearch}%`,
      );
    }
    const { data, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const totalPages = Math.ceil(count / limit);
    const result = {
      data,
      pagination: {
        page,
        limit,
        totalItems: count,
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
  static async insertConsumptionItem(itemData) {
    const { data, error } = await supabase
      .from("consumption_items")
      .insert(itemData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Invalidate parent consumption cache
    if (itemData.consumption_event_id) {
      cacheHelper.del(`consumption:${itemData.consumption_event_id}`);
    }
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async updateConsumptionItem(itemId, updateData) {
    // Get consumption_event_id to invalidate later
    const { data: existing } = await supabase
      .from("consumption_items")
      .select("consumption_event_id")
      .eq("id", itemId)
      .single();
    const { data, error } = await supabase
      .from("consumption_items")
      .update(updateData)
      .eq("id", itemId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (existing?.consumption_event_id) {
      cacheHelper.del(`consumption:${existing.consumption_event_id}`);
    }
    cacheHelper.delPattern("consumptions:");
    return data;
  }

  static async getConsumptionItemById(itemId) {
    const cacheKey = `consumption_item:${itemId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("consumption_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }
}
