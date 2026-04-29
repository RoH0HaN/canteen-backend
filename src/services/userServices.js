import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class UserService {
  // ----- Single user by primary key (id) -----
  static async getUserById(id) {
    const cacheKey = `user:id:${id}`;
    let user = cacheHelper.get(cacheKey);
    if (user) return user;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Single user by unique user_id (text) -----
  static async getUserByUserId(userId) {
    const cacheKey = `user:userId:${userId}`;
    let user = cacheHelper.get(cacheKey);
    if (user) return user;

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) cacheHelper.set(cacheKey, data);
    return data;
  }

  // ----- Insert new user (invalidate all user caches) -----
  static async insertUser(userData) {
    const { data, error } = await supabase
      .from("users")
      .insert(userData)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate all caches that might contain this user
    this._invalidateAllUserCaches();
    return data;
  }

  // ----- Update user (invalidate specific user caches) -----
  static async updateUser(id, updates) {
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Invalidate caches for this user
    this._invalidateUserCaches(data);
    return data;
  }

  // ----- Save refresh token (uses user_id unique, not id) -----
  static async saveRefreshToken(userId, refreshToken) {
    const { error } = await supabase
      .from("users")
      .update({ refresh_token: refreshToken })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    // Also invalidate caches because refresh_token changed
    const user = await this.getUserByUserId(userId);
    if (user) this._invalidateUserCaches(user);
  }

  // ----- Get all users with pagination and optional search -----
  static async getAllUsers({ page = 1, limit = 10, search = "" } = {}) {
    const offset = (page - 1) * limit;
    const trimmedSearch = search.trim();

    const cacheKey = `users:all:${page}:${limit}:${trimmedSearch}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    // Count total
    let countQuery = supabase
      .from("users")
      .select("*", { count: "exact", head: true });
    if (trimmedSearch) {
      countQuery = countQuery.or(
        `name.ilike.%${trimmedSearch}%,user_id.ilike.%${trimmedSearch}%`,
      );
    }
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // Fetch paginated data
    let dataQuery = supabase
      .from("users")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (trimmedSearch) {
      dataQuery = dataQuery.or(
        `name.ilike.%${trimmedSearch}%,user_id.ilike.%${trimmedSearch}%`,
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

  // ----- Helper: Invalidate caches for a specific user -----
  static _invalidateUserCaches(user) {
    if (user) {
      cacheHelper.del(`user:id:${user.id}`);
      cacheHelper.del(`user:userId:${user.user_id}`);
    }
    // Also invalidate all aggregated user lists because they may contain this user
    cacheHelper.delPattern("users:");
  }

  // ----- Helper: Invalidate all user‑related caches (used after insert) -----
  static _invalidateAllUserCaches() {
    cacheHelper.delPattern("user:");
    cacheHelper.delPattern("users:");
  }
}
