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

  const referenceNumber = `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    new_status: "pending_approval",
    changed_by: req.user.id,
    remarks: "Requisition created",
  });

  res
    .status(201)
    .json(new AppSuccess("Requisition created successfully", newRequisition));
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
    .json(new AppSuccess("Requisition retrieved successfully", requisition));
});

/**
 * @desc    Approve a requisition (Manager only)
 * @route   PATCH /api/v1/requisitions/approve/:id
 * @access  Private (Manager only)
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
  });
  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: requisitionId,
    old_status: "pending_approval",
    new_status: "approved",
    changed_by: req.user.id,
    remarks: "Requisition approved",
  });

  res.status(200).json(new AppSuccess("Requisition approved successfully"));
});

/**
 * @desc    Mark a requisition as received (stock is automatically updated)
 * @route   PATCH /api/v1/requisitions/receive/:id
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

  const { error, value } = receiveRequisitionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items } = value;

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
  }

  await RequisitionService.updateRequisition(requisitionId, {
    status: "received",
  });
  await RequisitionService.insertRequisitionStatusLog({
    requisition_id: requisitionId,
    old_status: "approved",
    new_status: "received",
    changed_by: req.user.id,
    remarks: "Requisition received",
  });

  res
    .status(200)
    .json(new AppSuccess("Requisition marked as received successfully"));
});

/**
 * @desc    Update a requisition (Admin Only)
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

  await RequisitionService.updateRequisition(requisitionId, requisitionData);

  for (const item of items) {
    const existingItem = existing.items.find((ri) => ri.id === item.id);
    if (!existingItem)
      return next(
        new AppError(`Requisition item ID ${item.id} not found`, 404),
      );
    await RequisitionService.updateRequisitionItem(item.id, {
      required_quantity: item.required_quantity,
      approved_quantity: item.approved_quantity,
      approval_remarks: item.approval_remarks,
      received_quantity: item.received_quantity,
    });
  }

  res.status(200).json(new AppSuccess("Requisition updated successfully"));
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

  await RequisitionService.deleteRequisition(requisitionId);
  res.status(200).json(new AppSuccess("Requisition deleted successfully"));
});

/**
 * @desc    Delete a single item from a requisition (only if still pending approval)
 * @route   DELETE /api/v1/requisitions/items/delete/:itemId
 * @access  Private (Admin/Manager)
 * @param   {number} itemId - Requisition item ID in URL
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
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) return next(new AppError("Invalid item ID", 400));

  const requisitionItem =
    await RequisitionService.getRequisitionItemById(itemId);
  if (!requisitionItem)
    return next(new AppError("Requisition item not found", 404));

  await RequisitionService.deleteRequisitionItem(itemId);
  res.status(200).json(new AppSuccess("Requisition item deleted successfully"));
});

/**
 * @desc    Get all requisitions with pagination & optional search
 * @route   GET /api/v1/requisitions?page=1&limit=10&search=REQ-2026
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
 *         "placed_by": { "id": 3, "name": "Rohan Debnath" },
 *         "vendor": { "id": 2, "name": "Gunjan Das" }
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
    .json(new AppSuccess("Requisitions retrieved successfully", result));
});

/**
 * @desc    Get all requisitions for a specific vendor (paginated & searchable)
 * @route   GET /api/v1/vendors/:vendorId/requisitions?page=1&limit=10&search=rice
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
 *         "placed_by": { "id": 3, "name": "Rohan Debnath" },
 *         "vendor": { "id": 2, "name": "Gunjan Das" }
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
  const vendorId = parseInt(req.params.vendorId, 10);
  if (isNaN(vendorId)) return next(new AppError("Invalid vendor ID", 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await RequisitionService.getRequisitionsByVendorId(vendorId, {
    page,
    limit,
    search,
  });
  res
    .status(200)
    .json(new AppSuccess("Requisitions retrieved successfully", result));
});
