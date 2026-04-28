import { supabase } from "../config/supabase.js";
import { GoodsService } from "./goodsService.js";

export class ConsumptionService {
  static async insertConsumedItem(consumedItem) {
    const { data, error } = await supabase
      .from("consumed_items")
      .insert(consumedItem)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async insertConsumption(consumptionData) {
    const { data, error } = await supabase
      .from("consumptions")
      .insert(consumptionData)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async deleteConsumptionAndRestoreStock(consumptionId) {
    const { data, error } = await supabase.rpc(
      "delete_consumption_restore_stock",
      {
        p_consumption_id: consumptionId,
      },
    );
    if (error) throw new Error(error.message);
    return data;
  }

  static async getConsumptionById(consumptionId) {
    // First get the consumption header
    const { data: consumption, error: consumptionError } = await supabase
      .from("consumptions")
      .select("*")
      .eq("id", consumptionId)
      .maybeSingle();

    if (consumptionError) throw new Error(consumptionError.message);
    if (!consumption) return null;

    // Then fetch items with good details
    const { data: items, error: itemsError } = await supabase
      .from("consumed_items")
      .select(
        `
            id,
            quantity,
            goods (id, name, unit)
        `,
      )
      .eq("consumption_id", consumptionId);

    if (itemsError) throw new Error(itemsError.message);

    // Combine
    return {
      ...consumption,
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        good_id: item.goods.id,
        good_name: item.goods.name,
        unit: item.goods.unit,
      })),
    };
  }

  static async getAllConsumptions({
    page = 1,
    limit = 10,
    filters = {},
    search = "",
  } = {}) {
    const offset = (page - 1) * limit;

    // Helper to apply common filters & search
    const applyFilters = (query) => {
      // Date filters
      if (filters.startDate) {
        query = query.gte("issue_date", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("issue_date", filters.endDate);
      }
      if (filters.issued_by) {
        query = query.eq("issued_by", filters.issued_by);
      }

      // Search across text fields (case-insensitive)
      if (search.trim()) {
        query = query.or(
          `issued_by.ilike.%${search}%,` +
            `menu.ilike.%${search}%,` +
            `purpose.ilike.%${search}%,` +
            `issued_for.ilike.%${search}%`,
        );
      }
      return query;
    };

    // 1. Count total matching records
    let countQuery = supabase
      .from("consumptions")
      .select("*", { count: "exact", head: true });
    countQuery = applyFilters(countQuery);
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // 2. Fetch paginated data
    let dataQuery = supabase
      .from("consumptions")
      .select(
        `
            *,
            consumed_items (
                id,
                quantity,
                goods (id, name, unit)
            )
        `,
      )
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);
    dataQuery = applyFilters(dataQuery);

    const { data: consumptions, error: dataError } = await dataQuery;
    if (dataError) throw new Error(dataError.message);

    // 3. Flatten
    const flattened = consumptions.map((c) => ({
      id: c.id,
      issue_date: c.issue_date,
      issued_by: c.issued_by,
      menu: c.menu,
      purpose: c.purpose,
      issued_for: c.issued_for,
      created_at: c.created_at,
      person_counts: c.person_counts || [],
      items:
        c.consumed_items?.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          good_id: item.goods.id,
          good_name: item.goods.name,
          unit: item.goods.unit,
        })) || [],
    }));

    const totalPages = Math.ceil(count / limit);
    return {
      data: flattened,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        search: search || "",
      },
    };
  }
}
