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
  // Parse items if string (from form-data)
  if (req.body.items && typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch (err) {
      return next(
        new AppError("Invalid items format. Must be a valid JSON array", 400),
      );
    }
  }

  const { error, value } = createConsumptionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { purpose, notes, items } = value;

  const referenceNumber =
    await ConsumptionService.generateConsumptionReferenceNumber();

  const consumption = await ConsumptionService.insertConsumption({
    purpose,
    notes,
    placed_by: req.user.id,
    reference_number: referenceNumber,
  });

  if (!consumption)
    return next(new AppError("Failed to create consumption", 500));

  for (const item of items) {
    const itemExists = await ItemService.getItemById(item.item_id);
    if (!itemExists)
      return next(new AppError(`Item ${item.item_id} not found`, 404));

    if (itemExists.current_stock < item.quantity)
      return next(
        new AppError(`Insufficient stock for item ${item.item_id}`, 400),
      );

    await ConsumptionService.insertConsumptionItem({
      consumption_event_id: consumption.id,
      item_id: item.item_id,
      quantity: item.quantity,
    });
  }

  await ConsumptionService.insertConsumptionStatusLog({
    consumption_id: consumption.id,
    old_status: null,
    new_status: "pending_approval",
    changed_by: req.user.id,
    remarks: "Consumption created",
  });

  res
    .status(201)
    .json(new AppSuccess("Consumption created successfully", consumption));
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
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items } = value;

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

  for (const item of items) {
    const consumptionItem = consumption.items.find((ri) => ri.id === item.id);
    if (!consumptionItem)
      return next(
        new AppError(`Consumption item ID ${item.id} not found`, 404),
      );

    if (item.approved_quantity > consumptionItem.item.current_stock) {
      return next(
        new AppError(
          "Approved quantity cannot be greater than current stock",
          400,
        ),
      );
    }

    if (item.approved_quantity <= 0) {
      return next(
        new AppError(
          `Approved quantity for item ID ${item.id} must be > 0`,
          400,
        ),
      );
    }
    await ConsumptionService.updateConsumptionItem(item.id, {
      approved_quantity: item.approved_quantity,
      approval_remarks: item.approval_remarks,
    });

    // ** Below code is commented as we are maintaining stock movements in a separate table and not updating current stock in items table directly. Stock summary will be calculated based on stock movements. **
    // const success = await ItemService.decrementStock(
    //   consumptionItem.item.id,
    //   item.approved_quantity,
    // );
    // if (!success) {
    //   return next(
    //     new AppError(
    //       `Insufficient stock for item ${consumptionItem.item.id}`,
    //       400,
    //     ),
    //   );
    // }

    await StockMovementService.insertStockMovement({
      item_id: consumptionItem.item.id,
      quantity: item.approved_quantity,
      movement_type: "issue",
      movement_date: new Date(),
      reference_number: consumption.reference_number,
      rate: consumptionItem.item.average_rate, // Use average rate for stock valuation. This can be enhanced to use FIFO/LIFO rates if needed.
    });
  }

  await ConsumptionService.updateConsumption(consumptionId, {
    status: "approved",
  });

  await ConsumptionService.insertConsumptionStatusLog({
    consumption_id: consumptionId,
    old_status: "pending_approval",
    new_status: "approved",
    changed_by: req.user.id,
    remarks: "Consumption approved",
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

  const { error, value } = updateConsumptionSchema.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const { items, ...updatedData } = value;

  const existing = await ConsumptionService.getConsumptionById(consumptionId);
  if (!existing) return next(new AppError("Consumption not found", 404));

  if (existing.status !== "pending_approval")
    return next(
      new AppError(
        "Only consumptions in 'Pending Approval' status can be updated",
        400,
      ),
    );

  await ConsumptionService.updateConsumption(consumptionId, updatedData);

  if (items && items.length) {
    for (const item of items) {
      const existingItem = await ConsumptionService.getConsumptionItemById(
        item.id,
      );
      if (!existingItem)
        return next(new AppError(`Consumption item ${item.id} not found`, 404));

      const itemDetails = await ItemService.getItemById(existingItem.item_id);

      if (itemDetails.current_stock < item.quantity) {
        return next(
          new AppError(
            `Insufficient stock for item ${existingItem.item_id}`,
            400,
          ),
        );
      }

      // Update quantity
      await ConsumptionService.updateConsumptionItem(item.id, {
        quantity: item.quantity,
      });
    }
  }

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

  if (consumption.status !== "pending_approval")
    return next(
      new AppError(
        "Only consumptions in 'Pending Approval' status can be deleted",
        400,
      ),
    );

  // if approved consumptions are to be deleted, we need to restore the stock by inserting opposite stock movements. But as per current requirements, only pending approval consumptions can be deleted, so we don't need to handle stock restoration here.

  if (!consumption) return next(new AppError("Consumption not found", 404));

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
