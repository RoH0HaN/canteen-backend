import { supabase } from "../config/supabase.js";

export class PurchaseService {
  static async insertPurchasedItem(purchasedItem) {
    const { data, error } = await supabase
      .from("purchased_items")
      .insert(purchasedItem)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async insertPurchase(purchaseData) {
    const { data, error } = await supabase
      .from("purchases")
      .insert(purchaseData)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async deletePurchaseAndRestoreStock(purchaseId) {
    const { data, error } = await supabase.rpc(
      "delete_purchase_restore_stock",
      {
        p_purchase_id: purchaseId,
      },
    );
    if (error) throw new Error(error.message);
    return data;
  }

  static async getPurchaseById(purchaseId) {
    // Get purchase header
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", purchaseId)
      .maybeSingle();

    if (purchaseError) throw new Error(purchaseError.message);
    if (!purchase) return null;

    // Get purchased items with good details
    const { data: items, error: itemsError } = await supabase
      .from("purchased_items")
      .select(
        `
                id,
                quantity,
                unit_cost,
                total_cost,
                goods (id, name, unit)
            `,
      )
      .eq("purchase_id", purchaseId);

    if (itemsError) throw new Error(itemsError.message);

    // Flatten items
    return {
      ...purchase,
      items: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        good_id: item.goods.id,
        good_name: item.goods.name,
        unit: item.goods.unit,
      })),
    };
  }

  static async getAllPurchases({
    page = 1,
    limit = 10,
    filters = {},
    search = "",
  } = {}) {
    const offset = (page - 1) * limit;

    // Helper to apply filters & search
    const applyFilters = (query) => {
      // Date filters (purchase_date)
      if (filters.startDate) {
        query = query.gte("purchase_date", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("purchase_date", filters.endDate);
      }
      if (filters.purchased_by) {
        query = query.eq("purchased_by", filters.purchased_by);
      }
      // Search across text fields (purchased_by)
      if (search && search.trim()) {
        query = query.ilike("purchased_by", `%${search.trim()}%`);
      }
      return query;
    };

    // Count total matching records
    let countQuery = supabase
      .from("purchases")
      .select("*", { count: "exact", head: true });
    countQuery = applyFilters(countQuery);
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // Fetch paginated data with items and goods
    let dataQuery = supabase
      .from("purchases")
      .select(
        `
                *,
                purchased_items (
                    id,
                    quantity,
                    unit_cost,
                    total_cost,
                    goods (id, name, unit)
                )
            `,
      )
      .order("purchase_date", { ascending: false })
      .range(offset, offset + limit - 1);
    dataQuery = applyFilters(dataQuery);

    const { data: purchases, error: dataError } = await dataQuery;
    if (dataError) throw new Error(dataError.message);

    // Flatten each purchase
    const flattened = purchases.map((purchase) => ({
      id: purchase.id,
      purchase_date: purchase.purchase_date,
      purchased_by: purchase.purchased_by,
      bill_files: purchase.bill_files,
      created_at: purchase.created_at,
      items:
        purchase.purchased_items?.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
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
