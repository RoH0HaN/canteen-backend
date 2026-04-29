import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class VendorService {
  // ----- Single vendor by ID (cached) -----
  static async getVendorById(id) {
    const cacheKey = `vendor:${id}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor) return vendor;

    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Vendor by PAN (cached – useful for duplicate check) -----
  static async getVendorByPan(pan_number) {
    const cacheKey = `vendor:pan:${pan_number}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor !== undefined) return vendor; // null means not found

    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("pan_number", pan_number)
      .maybeSingle();
    if (error) throw new Error(error.message);

    cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Insert new vendor (clear relevant caches) -----
  static async insertVendor(vendorData) {
    const { data, error } = await supabase
      .from("vendors")
      .insert(vendorData)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate paginated lists (all vendors caches)
    cacheHelper.delPattern("vendors:");
    return data;
  }

  // ----- Update vendor (clear caches for this vendor and lists) -----
  static async updateVendor(id, vendorData) {
    const { data, error } = await supabase
      .from("vendors")
      .update(vendorData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate specific vendor cache and all list caches
    cacheHelper.del(`vendor:${id}`);
    if (vendorData.pan_number) {
      cacheHelper.del(`vendor:pan:${vendorData.pan_number}`);
    }
    cacheHelper.delPattern("vendors:");
    return data;
  }

  // ----- Delete vendor (clear caches) -----
  static async deleteVendor(id) {
    // First get the vendor to know its PAN for cache deletion
    const vendor = await this.getVendorById(id);
    if (vendor) {
      cacheHelper.del(`vendor:${id}`);
      if (vendor.pan_number) cacheHelper.del(`vendor:pan:${vendor.pan_number}`);
    }
    cacheHelper.delPattern("vendors:");

    const { error } = await supabase.from("vendors").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  // ----- Get all vendors with pagination & search (cached by query) -----
  static async getVendors({ page = 1, limit = 10, search = "" } = {}) {
    const cacheKey = `vendors:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    // Count total
    let countQuery = supabase
      .from("vendors")
      .select("*", { count: "exact", head: true });
    if (trimmedSearch) {
      countQuery = countQuery.ilike("name", `%${trimmedSearch}%`);
    }
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // Fetch data
    let dataQuery = supabase
      .from("vendors")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (trimmedSearch) {
      dataQuery = dataQuery.ilike("name", `%${trimmedSearch}%`);
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
        search,
      },
    };

    cacheHelper.set(cacheKey, result);
    return result;
  }
}
