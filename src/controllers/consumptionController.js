import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ConsumptionService } from "../services/consumptionService.js";
import { ItemService } from "../services/itemService.js";
import {
  createConsumptionSchema,
  updateConsumptionSchema,
} from "../utils/validators.js";

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

  const consumption = await ConsumptionService.insertConsumption({
    purpose,
    notes,
    placed_by: req.user.id,
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

    const success = await ItemService.decrementStock(
      item.item_id,
      item.quantity,
    );
    if (!success) {
      return next(
        new AppError(`Insufficient stock for item ${item.item_id}`, 400),
      );
    }
  }

  res
    .status(201)
    .json(new AppSuccess("Consumption created successfully", consumption));
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

  await ConsumptionService.updateConsumption(consumptionId, updatedData);

  if (items && items.length) {
    for (const item of items) {
      const existingItem = await ConsumptionService.getConsumptionItemById(
        item.id,
      );
      if (!existingItem)
        return next(new AppError(`Consumption item ${item.id} not found`, 404));

      if (
        existingItem.current_stock <
        Math.abs(existingItem.quantity - item.quantity)
      ) {
        return next(
          new AppError(
            `Insufficient stock for item ${existingItem.item_id}`,
            400,
          ),
        );
      }

      // Restore old stock
      await ItemService.incrementStock(
        existingItem.item_id,
        existingItem.quantity,
      );
      // Update quantity
      await ConsumptionService.updateConsumptionItem(item.id, {
        quantity: item.quantity,
      });
      // Deduct new stock
      const success = await ItemService.decrementStock(
        existingItem.item_id,
        item.quantity,
      );
      if (!success) {
        return next(
          new AppError(
            `Insufficient stock for item ${existingItem.item_id}`,
            400,
          ),
        );
      }
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
  if (!consumption) return next(new AppError("Consumption not found", 404));

  for (const item of consumption.items) {
    await ItemService.incrementStock(item.item.id, item.quantity);
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
 *       { "id": 12, "purpose": "Daily Lunch", "placed_by_user": { "id": 3, "name": "Rohan" }, ... }
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
