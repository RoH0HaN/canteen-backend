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

  // ----- Vendor by PAN (cached) -----
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

  // ----- Vendor by Phone (cached) -----
  static async getVendorByPhone(phone_number) {
    const cacheKey = `vendor:phone:${phone_number}`;
    let vendor = cacheHelper.get(cacheKey);
    if (vendor !== undefined) return vendor; // cache hit (even if null)

    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("phone_number", phone_number)
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
    // Fetch old vendor data to know previous PAN and phone for cache invalidation
    const oldVendor = await this.getVendorById(id);
    if (!oldVendor) throw new Error("Vendor not found");

    const { data, error } = await supabase
      .from("vendors")
      .update(vendorData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate specific vendor cache
    cacheHelper.del(`vendor:${id}`);

    // Invalidate old PAN cache if changed
    if (
      vendorData.pan_number &&
      vendorData.pan_number !== oldVendor.pan_number
    ) {
      cacheHelper.del(`vendor:pan:${oldVendor.pan_number}`);
      cacheHelper.del(`vendor:pan:${vendorData.pan_number}`);
    } else if (oldVendor.pan_number) {
      cacheHelper.del(`vendor:pan:${oldVendor.pan_number}`);
    }

    // Invalidate old phone cache if changed
    if (
      vendorData.phone_number &&
      vendorData.phone_number !== oldVendor.phone_number
    ) {
      cacheHelper.del(`vendor:phone:${oldVendor.phone_number}`);
      cacheHelper.del(`vendor:phone:${vendorData.phone_number}`);
    } else if (oldVendor.phone_number) {
      cacheHelper.del(`vendor:phone:${oldVendor.phone_number}`);
    }

    // Invalidate all list caches
    cacheHelper.delPattern("vendors:");
    return data;
  }

  // ----- Delete vendor (clear all related caches) -----
  static async deleteVendor(id) {
    const vendor = await this.getVendorById(id);
    if (!vendor) throw new Error("Vendor not found");

    // Delete from database
    const { error } = await supabase.from("vendors").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // Invalidate all caches related to this vendor
    cacheHelper.del(`vendor:${id}`);
    if (vendor.pan_number) cacheHelper.del(`vendor:pan:${vendor.pan_number}`);
    if (vendor.phone_number)
      cacheHelper.del(`vendor:phone:${vendor.phone_number}`);
    cacheHelper.delPattern("vendors:");
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
