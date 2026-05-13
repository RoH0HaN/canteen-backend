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
          approved_quantity,
          approval_remarks,
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
      reference_number: data.reference_number,
      id: data.id,
      purpose: data.purpose,
      notes: data.notes,
      created_at: data.created_at,
      updated_at: data.updated_at,
      placed_by: data.placed_by_user,
      status: data.status,
      items:
        data.consumption_items?.map((ci) => ({
          id: ci.id,
          quantity: ci.quantity,
          item: ci.item,
          approved_quantity: ci.approved_quantity,
          approval_remarks: ci.approval_remarks,
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
        reference_number,
        status,
        purpose,
        notes,
        created_at,
        placed_by_user:users!placed_by (id, name, user_id, designation, role, signature_url)
      `,
      )
      .order("created_at", { ascending: false })
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

  static async getConsumptionsByStatus(
    status,
    { page = 1, limit = 10, search = "" } = {},
  ) {
    const cacheKey = `consumptions:${status}:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    let countQuery = supabase
      .from("consumption_events")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
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
        reference_number,
        status,
        purpose,
        notes,
        created_at,
        placed_by_user:users!placed_by (id, name, user_id, designation, role, signature_url)
      `,
      )
      .order("created_at", { ascending: false })
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

  // ---------- Generate Reference Number ----------
  static async generateConsumptionReferenceNumber() {
    // Get current date in DDMMYYYY format (local time, consistent with server)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    // Query count of consumption events created today (using created_at column)
    // Use date range from start of day to end of day in local timezone
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const { count, error } = await supabase
      .from("consumption_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString())
      .lt("created_at", endOfDay.toISOString());

    if (error)
      throw new Error(`Failed to count consumptions: ${error.message}`);

    const nextSeq = (count || 0) + 1;
    const seqPadded = String(nextSeq).padStart(3, "0");

    return `CON-${dateStr}-${seqPadded}`;
  }

  // ---------- Status Log ----------
  static async insertConsumptionStatusLog(logData) {
    const { data, error } = await supabase
      .from("consumption_status_log")
      .insert(logData)
      .select();
    if (error) throw new Error(error.message);
    return data;
  }
}
