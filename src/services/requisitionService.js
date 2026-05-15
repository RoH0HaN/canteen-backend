import { supabase } from "../config/supabase.js";
import { cacheHelper } from "../utils/cacheHelper.js";

export class RequisitionService {
  // ---------- Core CRUD ----------
  static async insertRequisition(requisitionData) {
    const { data, error } = await supabase
      .from("requisitions")
      .insert(requisitionData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Invalidate all list caches
    this._invalidateAllListCaches();
    return data;
  }

  static async getRequisitionById(requisitionId) {
    const cacheKey = `requisition:${requisitionId}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("requisitions")
      .select(
        `
        *,
        vendor:vendors!vendor_id (id, name, address, pan_number, type_of_organization, regd_office, signature_url, phone_number),
        placed_by_user:users!placed_by (id, name, role, user_id, signature_url, designation),
        requisition_items (
          id,
          required_quantity,
          approved_quantity,
          approval_remarks,
          received_quantity,
          item:items (id, name, unit, current_stock)
        )
      `,
      )
      .eq("id", requisitionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const result = {
      id: data.id,
      reference_number: data.reference_number,
      status: data.status,
      notes: data.notes,
      show_pdf: data.show_pdf,
      bill_file_url: data.bill_file_url,
      placed_at: data.placed_at,
      created_at: data.created_at,
      placed_by: data.placed_by_user,
      vendor: data.vendor,
      items:
        data.requisition_items?.map((ri) => ({
          id: ri.id,
          required_quantity: ri.required_quantity,
          approved_quantity: ri.approved_quantity,
          approval_remarks: ri.approval_remarks,
          received_quantity: ri.received_quantity,
          item: ri.item,
        })) || [],
    };
    cacheHelper.set(cacheKey, result);
    return result;
  }

  static async getAllRequisitions({ page = 1, limit = 10, search = "" } = {}) {
    const cacheKey = `requisitions:list:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    let query = supabase.from("requisitions").select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }
    const { count, error: countErr } = await query;
    if (countErr) throw new Error(countErr.message);

    let dataQuery = supabase
      .from("requisitions")
      .select(
        `
        id,
        reference_number,
        status,
        notes,
        bill_file_url,
        created_at,
        show_pdf,
        placed_by_user:users!placed_by (id, name, role, user_id),
        vendor:vendors!vendor_id (id, name, address, pan_number, type_of_organization, regd_office, phone_number)
      `,
      )
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });
    if (search) {
      dataQuery = dataQuery.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }

    const { data, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const totalPages = Math.ceil(count / limit);
    const result = {
      data: data.map((item) => ({
        id: item.id,
        reference_number: item.reference_number,
        status: item.status,
        notes: item.notes,
        bill_file_url: item.bill_file_url,
        created_at: item.created_at,
        placed_by: item.placed_by_user,
        show_pdf: item.show_pdf,
        vendor: item.vendor,
        // items are omitted for list view (fetch single if needed)
      })),
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

  static async getRequisitionsByStatus(
    status,
    { page = 1, limit = 10, search = "", userId = null } = {},
  ) {
    const cacheKey = `requisitions:vendor:${status}:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    let countQuery = supabase
      .from("requisitions")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (search) {
      countQuery = countQuery.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }
    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    let dataQuery = supabase
      .from("requisitions")
      .select(
        `
        id,
        reference_number,
        status,
        notes,
        bill_file_url,
        created_at,
        show_pdf,
        placed_by_user:users!placed_by (id, name, role, user_id),
        vendor:vendors!vendor_id (id, name, address, pan_number, type_of_organization, regd_office, phone_number)
      `,
      )
      .eq("status", status)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (search) {
      dataQuery = dataQuery.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }
    if (userId) {
      dataQuery = dataQuery.eq("placed_by", userId);
    }

    const { data, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const totalPages = Math.ceil(count / limit);
    const result = {
      data: data.map((item) => ({
        id: item.id,
        reference_number: item.reference_number,
        status: item.status,
        notes: item.notes,
        bill_file_url: item.bill_file_url,
        created_at: item.created_at,
        placed_by: item.placed_by_user,
        show_pdf: item.show_pdf,
        vendor: item.vendor,
        // items are omitted for list view (fetch single if needed)
      })),
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

  static async getRequisitionsByVendorId(
    vendorId,
    { page = 1, limit = 10, search = "" } = {},
  ) {
    const cacheKey = `requisitions:vendor:${vendorId}:${page}:${limit}:${search}`;
    const cached = cacheHelper.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    let countQuery = supabase
      .from("requisitions")
      .select("*", { count: "exact", head: true })
      .eq("vendor_id", vendorId);
    if (search) {
      countQuery = countQuery.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }
    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    let dataQuery = supabase
      .from("requisitions")
      .select(
        `
        id,
        reference_number,
        status,
        notes,
        bill_file_url,
        created_at,
        show_pdf,
        placed_by_user:users!placed_by (id, name, role, user_id),
        vendor:vendors!vendor_id (id, name, address, pan_number, type_of_organization, regd_office, phone_number)
      `,
      )
      .eq("vendor_id", vendorId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });
    if (search) {
      dataQuery = dataQuery.or(
        `reference_number.ilike.%${search}%,notes.ilike.%${search}%`,
      );
    }

    const { data, error } = await dataQuery;
    if (error) throw new Error(error.message);

    const totalPages = Math.ceil(count / limit);
    const result = {
      data: data.map((item) => ({
        id: item.id,
        reference_number: item.reference_number,
        status: item.status,
        notes: item.notes,
        bill_file_url: item.bill_file_url,
        created_at: item.created_at,
        placed_by: item.placed_by_user,
        show_pdf: item.show_pdf,
        vendor: item.vendor,
        // items are omitted for list view (fetch single if needed)
      })),
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

  static async updateRequisition(requisitionId, updateData) {
    const { data, error } = await supabase
      .from("requisitions")
      .update(updateData)
      .eq("id", requisitionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    this._invalidateRequisitionCache(requisitionId);
    return data;
  }

  static async deleteRequisition(requisitionId) {
    const { error } = await supabase
      .from("requisitions")
      .delete()
      .eq("id", requisitionId);
    if (error) throw new Error(error.message);
    this._invalidateRequisitionCache(requisitionId);
  }

  static async toggleShowPdf(requisitionId, status) {
    const { data, error } = await supabase
      .from("requisitions")
      .update({ show_pdf: status })
      .eq("id", requisitionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    this._invalidateRequisitionCache(requisitionId);
    return data;
  }

  // ---------- Requisition Items ----------
  static async insertRequisitionItems(itemsData) {
    const { data, error } = await supabase
      .from("requisition_items")
      .insert(itemsData)
      .select();
    if (error) throw new Error(error.message);
    // Invalidate the parent requisition cache
    if (itemsData.length)
      this._invalidateRequisitionCache(itemsData[0].requisition_id);
    return data;
  }

  static async getRequisitionItemById(itemId) {
    const { data, error } = await supabase
      .from("requisition_items")
      .select("*")
      .eq("id", itemId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  static async updateRequisitionItem(itemId, updateData) {
    // First get requisition_id to invalidate later
    const { data: item } = await supabase
      .from("requisition_items")
      .select("requisition_id")
      .eq("id", itemId)
      .single();
    const { data, error } = await supabase
      .from("requisition_items")
      .update(updateData)
      .eq("id", itemId)
      .select();
    if (error) throw new Error(error.message);
    if (item) this._invalidateRequisitionCache(item.requisition_id);
    return data;
  }

  static async deleteRequisitionItem(itemId) {
    const { data: item } = await supabase
      .from("requisition_items")
      .select("requisition_id")
      .eq("id", itemId)
      .single();
    const { error } = await supabase
      .from("requisition_items")
      .delete()
      .eq("id", itemId);
    if (error) throw new Error(error.message);
    if (item) this._invalidateRequisitionCache(item.requisition_id);
  }

  // ---------- Status Log ----------
  static async insertRequisitionStatusLog(logData) {
    const { data, error } = await supabase
      .from("requisition_status_log")
      .insert(logData)
      .select();
    if (error) throw new Error(error.message);
    if (logData.requisition_id)
      this._invalidateRequisitionCache(logData.requisition_id);
    return data;
  }

  static async getRequisitionStatusLogByRequisitionId(requisitionId) {
    const { data, error } = await supabase
      .from("requisition_status_log")
      .select(
        `
        *,
        changed_by_user:users!changed_by (id, name, role, user_id, signature_url, designation)
      `,
      )
      .eq("requisition_id", requisitionId);
    if (error) throw new Error(error.message);
    return data;
  }

  // ---------- Generate Reference Number ----------
  static async generateRequisitionReferenceNumber() {
    // Get current date in DDMMYYYY format (local time, consistent with server)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    // Query count of requisitions created today (using created_at column)
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
      .from("requisitions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfDay.toISOString())
      .lt("created_at", endOfDay.toISOString());

    if (error)
      throw new Error(`Failed to count requisitions: ${error.message}`);

    const nextSeq = (count || 0) + 1;
    const seqPadded = String(nextSeq).padStart(3, "0");

    return `REQ-${dateStr}-${seqPadded}`;
  }

  // ---------- Cache Helpers ----------
  static _invalidateRequisitionCache(requisitionId) {
    cacheHelper.del(`requisition:${requisitionId}`);
    this._invalidateAllListCaches();
  }

  static _invalidateAllListCaches() {
    cacheHelper.delPattern("requisitions:");
  }
}
