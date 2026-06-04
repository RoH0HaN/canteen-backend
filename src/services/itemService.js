import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class ItemService {
  // ----- Insert a new item (invalidate all item caches) -----
  static async insertItem(itemData) {
    const { data, error } = await supabase
      .from("items")
      .insert(itemData)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate all item‑related caches
    this._invalidateAllItemCaches();
    return data;
  }

  // ----- Get item by ID (cached) -----
  static async getItemById(id) {
    const cacheKey = `item:id:${id}`;
    let item = cacheHelper.get(cacheKey);
    if (item) return item;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const stockSummary = await this.getItemCurrentStockSummery(data.id);
    if (stockSummary) {
      data.current_stock = stockSummary.current_stock;
      data.average_rate = stockSummary.average_rate;
      data.stock_value = stockSummary.stock_value;
    }

    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Get item by name (cached) -----
  static async getItemByName(name) {
    const cacheKey = `item:name:${name}`;
    let item = cacheHelper.get(cacheKey);
    if (item) return item;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const stockSummary = await this.getItemCurrentStockSummery(data.id);
    if (stockSummary) {
      data.current_stock = stockSummary.current_stock;
      data.average_rate = stockSummary.average_rate;
      data.stock_value = stockSummary.stock_value;
    }

    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Update item (invalidate specific caches) -----
  static async updateItem(id, updates) {
    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate caches for this item (by id and by its old name if changed)
    cacheHelper.del(`item:id:${id}`);
    if (updates.name) cacheHelper.del(`item:name:${updates.name}`);
    // Also invalidate aggregated lists
    cacheHelper.delPattern("items:");
    return data;
  }

  // ----- Delete item (invalidate caches) -----
  static async deleteItem(id) {
    const item = await this.getItemById(id);
    if (!item) throw new Error("Item not found");

    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // Invalidate all item caches
    this._invalidateAllItemCaches();
  }

  // ----- Get all items with pagination, optional search -----
  static async getAllItems({ page = 1, limit = 10, search = "" } = {}) {
    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    const cacheKey = `items:all:${page}:${limit}:${trimmedSearch}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    // Count total
    let countQuery = supabase
      .from("items")
      .select("*", { count: "exact", head: true });
    if (trimmedSearch) {
      countQuery = countQuery.ilike("name", `%${trimmedSearch}%`);
    }
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // Fetch paginated data
    let dataQuery = supabase
      .from("items")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (trimmedSearch) {
      dataQuery = dataQuery.ilike("name", `%${trimmedSearch}%`);
    }
    const { data, error } = await dataQuery;
    if (error) throw new Error(error.message);

    // Bulk fetch stock summaries
    if (data.length > 0) {
      const itemIds = data.map((item) => item.id);
      const { data: stockSummaries, error: stockError } = await supabase.rpc(
        "get_current_stock_bulk",
        { item_ids: itemIds },
      );
      if (stockError) throw new Error(stockError.message);

      const stockMap = new Map(stockSummaries.map((s) => [s.item_id, s]));
      for (const item of data) {
        const summary = stockMap.get(item.id);
        if (summary) {
          item.current_stock = summary.current_stock;
          item.average_rate = summary.average_rate;
          item.stock_value = summary.stock_value;
        }
      }
    }

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

  static async decrementStock(itemId, quantity) {
    const { data, error } = await supabase.rpc("decrement_stock", {
      item_id: itemId,
      quantity: quantity,
    });
    if (error) throw new Error(error.message);
    if (data === true) {
      // Invalidate caches for this item
      cacheHelper.del(`item:id:${itemId}`);
      cacheHelper.delPattern("items:"); // invalidate list caches
    }
    return data; // true = success, false = insufficient stock
  }

  static async incrementStock(itemId, quantity) {
    const { error } = await supabase.rpc("increment_stock", {
      item_id: itemId,
      quantity: quantity,
    });
    if (error) throw new Error(error.message);
    // Invalidate caches for this item
    cacheHelper.del(`item:id:${itemId}`);
    cacheHelper.delPattern("items:");
  }

  static async getItemCurrentStockSummery(itemId) {
    const { data, error } = await supabase.rpc("get_current_stock", {
      item_id: itemId,
    });
    if (error) throw new Error(error.message);

    return data;
  }

  // ----- Helper: Invalidate all item caches -----
  static _invalidateAllItemCaches() {
    cacheHelper.delPattern("item:");
    cacheHelper.delPattern("items:");
  }
}
