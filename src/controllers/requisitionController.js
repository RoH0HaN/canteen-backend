import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { RequisitionService } from "../services/requisitionService.js";
import { VendorService } from "../services/vendorServices.js";
import {
  createRequisitionSchema,
  approveRequisitionSchema,
  receiveRequisitionSchema,
  updateRequisitionSchema,
} from "../utils/validators.js";
import { deleteFile, uploadFile } from "../services/storageService.js";
import { v4 as uuidv4 } from "uuid";
import { Enums } from "../utils/enums.js";
import { ItemService } from "../services/itemService.js";

/**
 * @desc    Create a new requisition
 * @route   POST /api/v1/requisitions/create
 * @access  Public (Data Entry)
 * @returns {AppSuccess} Created requisition object (basic info, without items)
 *
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Requisition created successfully",
 *   "data": {
 *     "id": 5,
 *     "reference_number": "REQ-1734567890123-456",
 *     "vendor_id": 2,
 *     "status": "pending_approval",
 *     "notes": "Urgent restock",
 *     "created_at": "2026-04-30T10:00:00Z"
 *   }
 * }
 */
export const createRequisition = asyncHandler(async (req, res, next) => {
  const { error, value } = createRequisitionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items, ...requisitionData } = value;

  const existingVendor = await VendorService.getVendorById(
    requisitionData.vendor_id,
  );
  if (!existingVendor) return next(new AppError("Vendor not found", 404));

  const referenceNumber =
    await RequisitionService.generateRequisitionReferenceNumber();
  requisitionData.reference_number = referenceNumber;
  requisitionData.placed_by = req.user.id;

  const newRequisition =
    await RequisitionService.insertRequisition(requisitionData);

  for (const item of items) {
    if (item.required_quantity <= 0) {
      return next(
        new AppError(
          `Required quantity for item_id ${item.item_id} must be > 0`,
          400,
        ),
      );
    }
    await RequisitionService.insertRequisitionItems({
      requisition_id: newRequisition.id,
      item_id: item.item_id,
      required_quantity: item.required_quantity,
    });
  }

  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: newRequisition.id,
    old_status: null,
    new_status: "draft",
    changed_by: req.user.id,
    remarks: "Requisition drafted",
  });

  res
    .status(201)
    .json(
      new AppSuccess("Requisition drafed successfully", newRequisition, 201),
    );
});

/**
 * @desc    Submit a final requisition for approval (Manager only)
 * @route   PUT /api/v1/requisitions/submit-final-requisition/:id
 * @access  Private (Manager only)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition submitted for approval successfully",
 *   "data": null
 * }
 */
export const submitFinalRequisition = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));

  if (requisition.status !== "draft")
    return next(new AppError("Requisition is not in draft status", 400));

  if (!requisition.show_pdf)
    return next(new AppError("PDF preview (submission) not viewd", 400));

  await RequisitionService.updateRequisition(requisitionId, {
    status: "pending_approval",
    show_pdf: false,
  });
  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: requisitionId,
    old_status: "draft",
    new_status: "pending_approval",
    changed_by: req.user.id,
    remarks: "Requisition submitted for approval",
  });
  res
    .status(200)
    .json(
      new AppSuccess(
        "Requisition submitted for approval successfully",
        null,
        200,
      ),
    );
});

/**
 * @desc    Get a single requisition by ID with full details (vendor, user, items)
 * @route   GET /api/v1/requisitions/get/:id
 * @access  Public
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} Full requisition object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition retrieved successfully",
 *   "data": {
 *     "id": 5,
 *     "reference_number": "REQ-1734567890123-456",
 *     "status": "pending_approval",
 *     "notes": "Urgent restock",
 *     "bill_file_url": null,
 *     "placed_at": "2026-04-30T10:00:00Z",
 *     "created_at": "2026-04-30T10:00:00Z",
 *     "placed_by": {
 *       "id": 3,
 *       "name": "Rohan Debnath",
 *       "role": "admin",
 *       "user_id": "NIT/2025/0675"
 *       "designation": "Teaching Assistant",
 *       "signature_url": "...."
 *     },
 *     "vendor": {
 *       "id": 2,
 *       "name": "Gunjan Das",
 *       "address": "Station Road Badkulla, Nadia",
 *       "pan_number": "KKYTD6947L"
 *       "type_of_organization": "Individual",
 *       "regd_office": "Nadia",
 *       "signature_url": "...."
 *       "phone_number": "1234567890"
 *     },
 *     "items": [
 *       {
 *         "id": 10,
 *         "required_quantity": 65,
 *         "approved_quantity": 0,
 *         "approval_remarks": null,
 *         "received_quantity": 0,
 *         "item": { "id": 1, "name": "Basmati Rice", "unit": "KG", "current_stock": 0 }
 *       }
 *     ]
 *   }
 * }
 */
export const getRequisitionById = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));

  res
    .status(200)
    .json(
      new AppSuccess("Requisition retrieved successfully", requisition, 200),
    );
});

/**
 * @desc    Approve a requisition (Manager only)
 * @route   PUT /api/v1/requisitions/approve/:id
 * @access  Private (Canteen Incharge only)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition approved successfully",
 *   "data": null
 * }
 */
export const approveRequisition = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const { error, value } = approveRequisitionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items } = value;

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));
  if (requisition.status !== "pending_approval") {
    return next(
      new AppError(
        "Only requisitions in 'Pending Approval' status can be approved",
        400,
      ),
    );
  }

  if (!requisition.show_pdf)
    return next(new AppError("PDF preview (approval) not viewd", 400));

  for (const item of items) {
    const requisitionItem = requisition.items.find((ri) => ri.id === item.id);
    if (!requisitionItem)
      return next(
        new AppError(`Requisition item ID ${item.id} not found`, 404),
      );
    if (item.approved_quantity <= 0) {
      return next(
        new AppError(
          `Approved quantity for item ID ${item.id} must be > 0`,
          400,
        ),
      );
    }
    await RequisitionService.updateRequisitionItem(item.id, {
      approved_quantity: item.approved_quantity,
      approval_remarks: item.approval_remarks,
    });
  }

  await RequisitionService.updateRequisition(requisitionId, {
    status: "approved",
    show_pdf: false,
  });
  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: requisitionId,
    old_status: "pending_approval",
    new_status: "approved",
    changed_by: req.user.id,
    remarks: "Requisition approved",
  });

  res
    .status(200)
    .json(new AppSuccess("Requisition approved successfully", null, 200));
});

/**
 * @desc    Mark a requisition as received (stock is automatically updated)
 * @route   PUT /api/v1/requisitions/receive/:id
 * @access  Private (Data Entry)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition marked as received successfully",
 *   "data": null
 * }
 */
export const receiveRequisition = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  // Parse items if string
  if (req.body.items && typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch (err) {
      return next(
        new AppError("Invalid items format. Must be a valid JSON array", 400),
      );
    }
  }

  const { error, value } = receiveRequisitionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items, total_amount } = value;

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));
  if (requisition.status !== "approved") {
    return next(
      new AppError(
        "Only requisitions in 'Approved' status can be marked as received",
        400,
      ),
    );
  }

  if (!requisition.show_pdf)
    return next(new AppError("PDF preview (receive) not viewd", 400));

  for (const item of items) {
    const requisitionItem = requisition.items.find((ri) => ri.id === item.id);
    if (!requisitionItem)
      return next(
        new AppError(`Requisition item ID ${item.id} not found`, 404),
      );
    if (item.received_quantity < 0) {
      return next(
        new AppError(
          `Received quantity for item ID ${item.id} cannot be negative`,
          400,
        ),
      );
    }
    await RequisitionService.updateRequisitionItem(item.id, {
      received_quantity: item.received_quantity,
    });

    await ItemService.incrementStock(
      requisitionItem.item.id,
      item.received_quantity,
    );
  }

  const requisitionData = {
    status: "received",
    total_amount: total_amount || requisition.total_amount,
    show_pdf: false,
  };
  // Handle optional file upload (vendor bill or delivery challan)
  if (req.file) {
    try {
      requisitionData.bill_file_url = await uploadFile(
        req.file,
        `VENDOR/BILL/${uuidv4()}`,
      );
    } catch (uploadError) {
      return next(
        new AppError(
          `Failed to upload vendor bill: ${uploadError.message}`,
          500,
        ),
      );
    }
  }

  await RequisitionService.updateRequisition(requisitionId, requisitionData);
  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: requisitionId,
    old_status: "approved",
    new_status: "received",
    changed_by: req.user.id,
    remarks: "Requisition received",
  });

  res
    .status(200)
    .json(
      new AppSuccess("Requisition marked as received successfully", null, 200),
    );
});

/**
 * @desc    Update a requisition (Admin & Data Entry Only)
 * @route   PUT /api/v1/requisitions/update/:id
 * @access  Private (Admin only)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition updated successfully",
 *   "data": null
 * }
 */
export const updateRequisition = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const { error, value } = updateRequisitionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items, ...requisitionData } = value;

  const existing = await RequisitionService.getRequisitionById(requisitionId);
  if (!existing) return next(new AppError("Requisition not found", 404));

  if (existing.status === "received") {
    return next(
      new AppError(
        "Only requisitions in 'Pending Approval' or 'Approved' status can be updated",
        400,
      ),
    );
  }

  if (req.user.role !== "data_entry" && existing.status === "draft") {
    return next(
      new AppError(
        "Only data entry users can update requisitions in 'Draft' status",
        400,
      ),
    );
  }

  await RequisitionService.updateRequisition(requisitionId, requisitionData);

  if (items && items.length) {
    for (const item of items) {
      const existingItem = existing.items.find((ri) => ri.id === item.id);
      if (!existingItem)
        return next(
          new AppError(`Requisition item ID ${item.id} not found`, 404),
        );

      if (existingItem.current_stock < existingItem.received_quantity) {
        return next(
          new AppError(
            `Insufficient stock for item ${existingItem.item_id}`,
            400,
          ),
        );
      }

      await RequisitionService.updateRequisitionItem(item.id, {
        required_quantity: item.required_quantity,
        approved_quantity: item.approved_quantity,
        approval_remarks: item.approval_remarks,
        received_quantity: item.received_quantity,
      });
    }
  }

  res
    .status(200)
    .json(new AppSuccess("Requisition updated successfully", null, 200));
});

/**
 * @desc    Delete a requisition (hard delete, all items & logs cascade)
 * @route   DELETE /api/v1/requisitions/delete/:id
 * @access  Private (Admin only)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition deleted successfully",
 *   "data": null
 * }
 */
export const deleteRequisition = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const existing = await RequisitionService.getRequisitionById(requisitionId);
  if (!existing) return next(new AppError("Requisition not found", 404));

  if (existing.status === "received") {
    return next(
      new AppError(
        "Only requisitions in 'Pending Approval' or 'Approved' status can be deleted",
        400,
      ),
    );
  }

  await RequisitionService.deleteRequisition(requisitionId);
  res
    .status(200)
    .json(new AppSuccess("Requisition deleted successfully", null, 200));
});

/**
 * @desc    Delete a single item from a requisition (only if still pending approval)
 * @route   DELETE /api/v1/requisitions/delete-item/:id
 * @access  Private (Admin/Manager)
 * @param   {number} id - Requisition item ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition item deleted successfully",
 *   "data": null
 * }
 */
export const deleteRequisitionItem = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) return next(new AppError("Invalid item ID", 400));

  const requisitionItem =
    await RequisitionService.getRequisitionItemById(itemId);
  if (!requisitionItem)
    return next(new AppError("Requisition item not found", 404));

  const requisition = await RequisitionService.getRequisitionById(
    requisitionItem.requisition_id,
  );
  if (!requisition) return next(new AppError("Requisition not found", 404));
  if (requisition.status === "received") {
    return next(
      new AppError(
        "Only requisitions in 'Pending Approval' or 'Approved' status can have items deleted",
        400,
      ),
    );
  }

  await RequisitionService.deleteRequisitionItem(itemId);
  res
    .status(200)
    .json(new AppSuccess("Requisition item deleted successfully", null, 200));
});

/**
 * @desc    Get all requisitions with pagination & optional search
 * @route   GET /api/v1/requisitions/list?page=1&limit=10&search=REQ-2026
 * @access  Public
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by reference number or notes (optional)
 * @returns {AppSuccess} Paginated list (vendor & user names only, no items)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisitions retrieved successfully",
 *   "data": {
 *     "data": [
 *       {
 *         "id": 5,
 *         "reference_number": "REQ-1734567890123-456",
 *         "status": "pending_approval",
 *         "notes": "Urgent restock",
 *         "placed_at": "2026-04-30T10:00:00Z",
 *         "placed_by": { "id": 3, "name": "Rohan Debnath", "role": "admin", "user_id": "ABC123" },
 *         "vendor": { "id": 2, "name": "Gunjan Das",  "address": "...", "pan_number": "...", "type_of_organization": "...", "regd_office": "...", "phone_number": "..." }
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 25,
 *       "totalPages": 3,
 *       "hasNextPage": true,
 *       "hasPrevPage": false,
 *       "search": "REQ-2026"
 *     }
 *   }
 * }
 */
export const getAllRequisitions = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await RequisitionService.getAllRequisitions({
    page,
    limit,
    search,
  });
  res
    .status(200)
    .json(new AppSuccess("Requisitions retrieved successfully", result, 200));
});

/**
 * @desc    Get all requisitions for a specific vendor (paginated & searchable)
 * @route   GET /api/v1/requisitions/list-by-vendor/:id?page=1&limit=10&search=rice
 * @access  Public
 * @param   {number} vendorId - Vendor ID in URL
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by reference number or notes (optional)
 * @returns {AppSuccess} Paginated list of requisitions for that vendor
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisitions retrieved successfully",
 *   "data": {
 *     "data": [
 *       {
 *         "id": 5,
 *         "reference_number": "REQ-1734567890123-456",
 *         "status": "approved",
 *         "notes": "Urgent restock of rice",
 *         "placed_at": "2026-04-30T10:00:00Z",
 *         "placed_by": { "id": 3, "name": "Rohan Debnath", "role": "admin", "user_id": "ABC123" },
 *         "vendor": { "id": 2, "name": "Gunjan Das",  "address": "...", "pan_number": "...", "type_of_organization": "...", "regd_office": "...", "phone_number": "..." }
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 8,
 *       "totalPages": 1,
 *       "hasNextPage": false,
 *       "hasPrevPage": false,
 *       "search": "rice"
 *     }
 *   }
 * }
 */
export const getRequisitionsByVendor = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) return next(new AppError("Invalid vendor ID", 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const vendor = await VendorService.getVendorById(vendorId);
  if (!vendor) return next(new AppError("Vendor not found", 404));

  const result = await RequisitionService.getRequisitionsByVendorId(vendorId, {
    page,
    limit,
    search,
  });
  res
    .status(200)
    .json(new AppSuccess("Requisitions retrieved successfully", result, 200));
});

/**
 * @desc    Get all requisitions of a specific status (paginated & searchable)
 * @route   GET /api/v1/vendors/requisitions/get-by-status?status=approved&page=1&limit=10&search=rice
 * @access  Public
 * @param   {number} status - Status in query
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by reference number or notes (optional)
 * @returns {AppSuccess} Paginated list of requisitions for that vendor
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisitions retrieved successfully",
 *   "data": {
 *     "data": [
 *       {
 *         "id": 5,
 *         "reference_number": "REQ-1734567890123-456",
 *         "status": "approved",
 *         "notes": "Urgent restock of rice",
 *         "placed_at": "2026-04-30T10:00:00Z",
 *         "placed_by": { "id": 3, "name": "Rohan Debnath", "role": "admin", "user_id": "ABC123" },
 *         "vendor": { "id": 2, "name": "Gunjan Das",  "address": "...", "pan_number": "...", "type_of_organization": "...", "regd_office": "...", "phone_number": "..." }
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 8,
 *       "totalPages": 1,
 *       "hasNextPage": false,
 *       "hasPrevPage": false,
 *       "search": "rice"
 *     }
 *   }
 * }
 */
export const getRequisitionsByStatus = asyncHandler(async (req, res, next) => {
  const status = req.query.status;
  if (!status || !Enums.requisitionStatus.includes(status))
    return next(new AppError("Invalid status", 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await RequisitionService.getRequisitionsByStatus(status, {
    page,
    limit,
    search,
    userId: status === "draft" ? req.user.id : undefined,
  });

  res
    .status(200)
    .json(new AppSuccess("Requisitions retrieved successfully", result, 200));
});

/**
 * @desc    Update a requisition's bill file
 * @route   PUT /api/v1/requisitions/update-bill/:id
 * @access  Private (Vendor only)
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Requisition updated successfully",
 *   "data": null
 * }
 */
export const updateRequisitionBill = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  if (!req.file) return next(new AppError("Please upload a file", 400));

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));

  if (requisition.bill_file_url && requisition.bill_file_url !== "N/A") {
    await deleteFile(requisition.bill_file_url);
  }

  try {
    await RequisitionService.updateRequisition(requisitionId, {
      bill_file_url: await uploadFile(req.file, `VENDOR/BILL/${uuidv4()}`),
    });
  } catch (uploadError) {
    return next(new AppError(uploadError.message, 500));
  }

  res
    .status(200)
    .json(new AppSuccess("Requisition updated successfully", null, 200));
});

/**
 * @desc    Show a requisition's PDF
 * @route   PUT /api/v1/requisitions/show-pdf/:id
 * @access  Public
 * @param   {number} id - Requisition ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "PDF viewed successfully",
 *   "data": null
 * }
 */
export const showPdf = asyncHandler(async (req, res, next) => {
  const requisitionId = parseInt(req.params.id, 10);
  if (isNaN(requisitionId))
    return next(new AppError("Invalid requisition ID", 400));

  const requisition =
    await RequisitionService.getRequisitionById(requisitionId);
  if (!requisition) return next(new AppError("Requisition not found", 404));

  await RequisitionService.toggleShowPdf(requisitionId, true);

  res.status(200).json(new AppSuccess("PDF viewed successfully", null, 200));
});
