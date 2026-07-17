import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ConsumptionService } from "../services/consumptionService.js";
import { ItemService } from "../services/itemService.js";
import {
  approveConsumptionSchema,
  createConsumptionSchema,
  updateConsumptionSchema,
} from "../utils/validators.js";
import { Enums } from "../utils/enums.js";
import { StockMovementService } from "../services/stockMovementsService.js";
import { runTransaction } from "../utils/transaction.js";
import { UnitConversionService } from "../services/unitConversionService.js";

/**
 * @desc    Create a new consumption event (deduct stock)
 * @route   POST /api/v1/consumptions/create
 * @access  Private
 * @returns {AppSuccess} Created consumption header (without items)
 *
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Consumption created successfully",
 *   "data": {
 *     "id": 12,
 *     "purpose": "Daily Lunch",
 *     "notes": "For 100 students",
 *     "placed_by": 3,
 *     "created_at": "2026-05-02T10:00:00Z"
 *   }
 * }
 */
export const createConsumption = asyncHandler(async (req, res, next) => {
  const { error, value } = createConsumptionSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );

  const { items, ...consumptionData } = value;

  // Generate reference number
  const referenceNumber =
    await ConsumptionService.generateConsumptionReferenceNumber();
  consumptionData.reference_number = referenceNumber;
  consumptionData.placed_by = req.user.id;

  // Validate items (outside transaction)
  for (const item of items) {
    // Check if item exists
    const itemExists = await ItemService.getItemById(item.item_id);
    if (!itemExists)
      return next(new AppError(`Item ${item.item_id} not found`, 404));

    // Validate unit_id is allowed for this item
    const availableUnits = await UnitConversionService.getAvailableUnits(
      item.item_id,
    );
    if (!availableUnits.some((u) => u.id == item.unit_id)) {
      return next(
        new AppError(
          `Unit ${item.unit_id} is not valid for item ${item.item_id}`,
          400,
        ),
      );
    }

    // Convert requested quantity to base unit
    const baseQuantity = await UnitConversionService.convertToBaseUnit(
      item.item_id,
      item.quantity,
      item.unit_id,
    );

    // Get current stock in base unit (call RPC)
    const stockResult = await StockMovementService.getCurrentStock(
      item.item_id,
    );
    const currentStock = stockResult?.current_stock || 0;

    // Check stock sufficiency (optional: warn only, or block)
    if (baseQuantity > currentStock) {
      return next(
        new AppError(
          `Insufficient stock for item ${itemExists.name}. Required: ${baseQuantity} ${itemExists.base_unit}, Available: ${currentStock}`,
          400,
        ),
      );
    }
  }

  // Execute all writes inside a transaction
  const newConsumption = await runTransaction(async (client) => {
    // Insert consumption header
    const conHeader = await ConsumptionService.insertConsumption(
      consumptionData,
      client,
    );

    // Insert consumption items
    for (const item of items) {
      await ConsumptionService.insertConsumptionItem(
        {
          consumption_event_id: conHeader.id,
          item_id: item.item_id,
          quantity: item.quantity,
          unit_id: item.unit_id,
          // approved_quantity and approval_remarks not set at creation
        },
        client,
      );
    }

    // Insert status log
    await ConsumptionService.insertConsumptionStatusLog(
      {
        consumption_id: conHeader.id,
        old_status: null,
        new_status: "draft",
        changed_by: req.user.id,
        remarks: "Consumption drafted",
      },
      client,
    );

    return conHeader;
  });

  res
    .status(201)
    .json(
      new AppSuccess("Consumption drafted successfully", newConsumption, 201),
    );
});

/**
 * @desc    Submit a final consumption for approval (Manager only)
 * @route   PUT /api/v1/consumptions/submit-final-consumption/:id
 * @access  Private (Manager only)
 * @param   {number} id - Consumption ID in URL
 * @returns {AppSuccess} No data, only message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumption submitted for approval successfully",
 *   "data": null
 * }
 */
export const submitFinalConsumption = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (isNaN(consumptionId))
    return next(new AppError("Invalid consumption ID", 400));

  const consumption =
    await ConsumptionService.getConsumptionById(consumptionId);
  if (!consumption) return next(new AppError("Consumption not found", 404));

  if (consumption.status !== "draft")
    return next(new AppError("Consumption is not in draft status", 400));

  await runTransaction(async (client) => {
    await ConsumptionService.updateConsumption(
      consumptionId,
      {
        status: "pending_approval",
      },
      client,
    );

    await ConsumptionService.insertConsumptionStatusLog(
      {
        consumption_id: consumptionId,
        old_status: "draft",
        new_status: "pending_approval",
        changed_by: req.user.id,
        remarks: "Consumption submitted for approval",
      },
      client,
    );
  });

  res
    .status(200)
    .json(
      new AppSuccess(
        "Consumption submitted for approval successfully",
        null,
        200,
      ),
    );
});

/**
 * @desc    Approve a consumption event (add stock)
 * @route   POST /api/v1/consumptions/approve/:id
 * @access  Private (Canteen Incharge only)
 * @returns {AppSuccess} No data
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumption approved successfully",
 *   "data": null
 * }
 */
export const approveConsumption = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (isNaN(consumptionId))
    return next(new AppError("Invalid consumption ID", 400));

  const { error, value } = approveConsumptionSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );

  const { items } = value;

  // Fetch consumption (outside transaction)
  const consumption =
    await ConsumptionService.getConsumptionById(consumptionId);
  if (!consumption) return next(new AppError("Consumption not found", 404));
  if (consumption.status !== "pending_approval") {
    return next(
      new AppError(
        "Only consumptions in 'Pending Approval' status can be approved",
        400,
      ),
    );
  }

  // Validate all items (outside transaction)
  for (const item of items) {
    const consumptionItem = consumption.items.find((ri) => ri.id == item.id);
    if (!consumptionItem)
      return next(
        new AppError(`Consumption item ID ${item.id} not found`, 404),
      );

    if (item.approved_quantity <= 0) {
      return next(
        new AppError(
          `Approved quantity for item ID ${item.id} must be > 0`,
          400,
        ),
      );
    }

    // Convert approved quantity to base unit
    const baseQuantity = await UnitConversionService.convertToBaseUnit(
      consumptionItem.item.id,
      item.approved_quantity,
      consumptionItem.unit_id,
    );

    // Get current stock in base unit
    const stockInfo = await StockMovementService.getCurrentStock(
      consumptionItem.item.id,
    );
    const currentStock = stockInfo?.current_stock || 0;

    // Check stock sufficiency
    if (baseQuantity > currentStock) {
      return next(
        new AppError(
          `Insufficient stock for item ${consumptionItem.item.name}. ` +
            `Required: ${baseQuantity} ${consumptionItem.item.base_unit}, ` +
            `Available: ${currentStock}`,
          400,
        ),
      );
    }
  }

  // Execute all writes inside a transaction
  await runTransaction(async (client) => {
    // Update each consumption item
    for (const item of items) {
      const consumptionItem = consumption.items.find((ri) => ri.id == item.id);
      await ConsumptionService.updateConsumptionItem(
        item.id,
        {
          approved_quantity: item.approved_quantity,
          approval_remarks: item.approval_remarks,
        },
        client,
      );

      // Insert stock movement (issue)
      const baseQuantity = await UnitConversionService.convertToBaseUnit(
        consumptionItem.item.id,
        item.approved_quantity,
        consumptionItem.unit_id,
        client,
      );

      await StockMovementService.insertStockMovement(
        {
          item_id: consumptionItem.item.id,
          movement_type: "issue",
          quantity: item.approved_quantity,
          unit_id: consumptionItem.unit_id,
          base_quantity: baseQuantity,
          rate: 0, // issues have no rate
          rate_per_base_unit: 0, // issues have no rate
          movement_date: new Date(),
          reference_number: consumption.reference_number,
        },
        client,
      );
    }

    // Update consumption header status
    await ConsumptionService.updateConsumption(
      consumptionId,
      { status: "approved" },
      client,
    );

    // Insert status log
    await ConsumptionService.insertConsumptionStatusLog(
      {
        consumption_id: consumptionId,
        old_status: "pending_approval",
        new_status: "approved",
        changed_by: req.user.id,
        remarks: "Consumption approved",
      },
      client,
    );
  });

  res
    .status(200)
    .json(new AppSuccess("Consumption approved successfully", null, 200));
});

/**
 * @desc    Update a consumption event (adjust stock accordingly)
 * @route   PUT /api/v1/consumptions/update/:id
 * @access  Private
 * @returns {AppSuccess} No data
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumption updated successfully",
 *   "data": null
 * }
 */
export const updateConsumption = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (isNaN(consumptionId))
    return next(new AppError("Invalid consumption ID", 400));

  const { error, value } = updateConsumptionSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );

  const { items, ...updatedData } = value;

  // Fetch existing consumption (outside transaction)
  const existing = await ConsumptionService.getConsumptionById(consumptionId);
  if (!existing) return next(new AppError("Consumption not found", 404));

  if (existing.status === "approved") {
    return next(
      new AppError("Consumptions in 'Approved' status cannot be updated", 400),
    );
  }

  if (req.user.role !== "data_entry" && existing.status === "draft") {
    return next(
      new AppError(
        "Only data entry users can update consumptions in 'Draft' status",
        400,
      ),
    );
  }

  // Validate items (outside transaction) – each must exist and stock must be sufficient
  for (const item of items || []) {
    const consumptionItem = existing.items.find((ri) => ri.id == item.id);
    if (!consumptionItem) {
      return next(
        new AppError(`Consumption item ID ${item.id} not found`, 404),
      );
    }

    // Validate unit_id is allowed for this item
    const availableUnits = await UnitConversionService.getAvailableUnits(
      consumptionItem.item.id,
    );
    if (!availableUnits.some((u) => u.id == item.unit_id)) {
      return next(
        new AppError(
          `Unit ${item.unit_id} is not valid for item ${consumptionItem.item.name}`,
          400,
        ),
      );
    }

    if (item.quantity <= 0) {
      return next(
        new AppError(
          `Quantity for item ${consumptionItem.item.name} must be > 0`,
          400,
        ),
      );
    }

    // Convert updated quantity to base unit
    const baseQuantity = await UnitConversionService.convertToBaseUnit(
      consumptionItem.item.id,
      item.quantity,
      item.unit_id,
    );

    // Check current stock (in base unit)
    const stockInfo = await StockMovementService.getCurrentStock(
      consumptionItem.item.id,
    );
    const currentStock = stockInfo?.current_stock || 0;

    if (baseQuantity > currentStock) {
      return next(
        new AppError(
          `Insufficient stock for ${consumptionItem.item.name}. ` +
            `Required: ${baseQuantity} ${consumptionItem.item.base_unit}, ` +
            `Available: ${currentStock}`,
          400,
        ),
      );
    }
  }

  // Execute all writes inside a transaction
  await runTransaction(async (client) => {
    // Update header (if any fields provided)
    if (Object.keys(updatedData).length > 0) {
      await ConsumptionService.updateConsumption(
        consumptionId,
        updatedData,
        client,
      );
    }

    // Update each consumption item
    for (const item of items || []) {
      await ConsumptionService.updateConsumptionItem(
        item.id,
        {
          quantity: item.quantity,
          unit_id: item.unit_id,
        },
        client,
      );
    }
  });

  res.status(200).json(new AppSuccess("Consumption updated successfully"));
});

/**
 * @desc    Delete a consumption event (restore stock)
 * @route   DELETE /api/v1/consumptions/delete/:id
 * @access  Private
 * @returns {AppSuccess} No data
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumption deleted successfully",
 *   "data": null
 * }
 */
export const deleteConsumption = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (isNaN(consumptionId))
    return next(new AppError("Invalid consumption ID", 400));

  const consumption =
    await ConsumptionService.getConsumptionById(consumptionId);

  if (consumption.status === "approved") {
    return next(
      new AppError("Consumptions in 'Approved' status cannot be deleted", 400),
    );
  }

  await ConsumptionService.deleteConsumption(consumptionId);

  res.status(200).json(new AppSuccess("Consumption deleted successfully"));
});

/**
 * @desc    Get single consumption by ID (with full items)
 * @route   GET /api/v1/consumptions/get/:id
 * @access  Private
 * @returns {AppSuccess} Consumption object with items
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumption retrieved successfully",
 *   "data": {
 *     "id": 12,
 *     "purpose": "Daily Lunch",
 *     "notes": "For 100 students",
 *     "placed_by": { "id": 3, "name": "Rohan", "user_id": "NIT/001" },
 *     "items": [
 *       { "id": 55, "quantity": 10, "item": { "id": 1, "name": "Rice", "unit": "kg" } }
 *     ]
 *   }
 * }
 */
export const getConsumptionById = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (isNaN(consumptionId))
    return next(new AppError("Invalid consumption ID", 400));

  const consumption =
    await ConsumptionService.getConsumptionById(consumptionId);
  if (!consumption) return next(new AppError("Consumption not found", 404));

  res
    .status(200)
    .json(new AppSuccess("Consumption retrieved successfully", consumption));
});

/**
 * @desc    Get all consumptions with pagination & search
 * @route   GET /api/v1/consumptions/list?page=1&limit=10&search=lunch
 * @access  Private
 * @returns {AppSuccess} Paginated list (without item details)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumptions retrieved successfully",
 *   "data": {
 *     "data": [
 *       { "id": 12, "purpose": "Daily Lunch",, "status": "approved", "reference_number": "CON-1234567890123-456", "placed_by_user": { "id": 3, "name": "Rohan" }, ... }
 *     ],
 *     "pagination": { "page": 1, "limit": 10, "totalItems": 42, "totalPages": 5, "hasNextPage": true, "hasPrevPage": false }
 *   }
 * }
 */
export const getAllConsumptions = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await ConsumptionService.getAllConsumptions({
    page,
    limit,
    search,
  });
  res
    .status(200)
    .json(new AppSuccess("Consumptions retrieved successfully", result));
});

/**
 * @desc    Get all consumptions of a specific status with pagination & search
 * @route   GET /api/v1/consumptions/get-by-status?status=approved&page=1&limit=10&search=lunch
 * @access  Private
 * @returns {AppSuccess} Paginated list (without item details)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Consumptions retrieved successfully",
 *   "data": {
 *     "data": [
 *       { "id": 12, "purpose": "Daily Lunch", "status": "approved", "reference_number": "CON-1234567890123-456", "placed_by_user": { "id": 3, "name": "Rohan" }, ... }
 *     ],
 *     "pagination": { "page": 1, "limit": 10, "totalItems": 42, "totalPages": 5, "hasNextPage": true, "hasPrevPage": false }
 *   }
 * }
 */
export const getConsumptionsByStatus = asyncHandler(async (req, res, next) => {
  const status = req.query.status;
  if (!status || !Enums.consumptionStatus.includes(status))
    return next(new AppError("Invalid status", 400));

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await ConsumptionService.getConsumptionsByStatus(status, {
    page,
    limit,
    search,
  });

  res
    .status(200)
    .json(new AppSuccess("Consumptions retrieved successfully", result, 200));
});
