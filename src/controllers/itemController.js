import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ItemService } from "../services/itemService.js";
import { createItemSchema, updateItemSchema } from "../utils/validators.js";
import { deleteFile, uploadFile } from "../services/storageService.js";

/**
 * @desc    Create a new inventory item
 * @route   POST /api/v1/items
 * @access  Private (Admin/Manager)
 * @returns {AppSuccess} Created item object
 *
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Item created successfully",
 *   "data": {
 *     "id": 12,
 *     "name": "Basmati Rice",
 *     "unit": "kg",
 *     "min_stock_level": 10,
 *     "opening_stock": 50,
 *     "current_stock": 50
 *   }
 * }
 */
export const createItem = asyncHandler(async (req, res, next) => {
  const { error, value } = createItemSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { name, unit, min_stock_level, opening_stock } = value;

  const existingItem = await ItemService.getItemByName(name);
  if (existingItem) {
    return next(new AppError("Item with this name already exists", 409));
  }

  const item = await ItemService.insertItem({
    name,
    unit,
    min_stock_level,
    opening_stock,
    current_stock: opening_stock,
  });

  res.status(201).json(new AppSuccess("Item created successfully", item, 201));
});

/**
 * @desc    Get a single item by ID
 * @route   GET /api/v1/items/:id
 * @access  Private (Admin/Staff)
 * @param   {number} id - Item ID in URL
 * @returns {AppSuccess} Item object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Item fetched successfully",
 *   "data": {
 *     "id": 12,
 *     "name": "Basmati Rice",
 *     "unit": "kg",
 *     "min_stock_level": 10,
 *     "opening_stock": 50,
 *     "current_stock": 45
 *   }
 * }
 */
export const getItemById = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return next(new AppError("Invalid item ID", 400));
  }

  const item = await ItemService.getItemById(itemId);
  if (!item) {
    return next(new AppError("Item not found", 404));
  }

  res.status(200).json(new AppSuccess("Item fetched successfully", item, 200));
});

/**
 * @desc    Update an existing item (name, unit, min stock, opening stock)
 * @route   PUT /api/v1/items/:id
 * @access  Private (Admin/Manager)
 * @param   {number} id - Item ID in URL
 * @returns {AppSuccess} Updated item object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Item updated successfully",
 *   "data": {
 *     "id": 12,
 *     "name": "Premium Basmati Rice",
 *     "unit": "kg",
 *     "min_stock_level": 15,
 *     "opening_stock": 50,
 *     "current_stock": 45
 *   }
 * }
 */
export const updateItem = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return next(new AppError("Invalid item ID", 400));
  }

  // Use updateItemSchema (should be defined; fallback to createItemSchema if not)
  const { error, value } = (updateItemSchema || createItemSchema).validate(
    req.body,
  );
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { name, unit, min_stock_level, opening_stock } = value;

  const existingItem = await ItemService.getItemByName(name);
  if (existingItem && existingItem.id !== itemId) {
    return next(new AppError("Item with this name already exists", 409));
  }

  const updatedItem = await ItemService.updateItem(itemId, {
    name,
    unit,
    min_stock_level,
    opening_stock,
    // Note: current_stock is NOT updated here; it's managed separately via stock adjustments
  });

  res
    .status(200)
    .json(new AppSuccess("Item updated successfully", updatedItem, 200));
});

/**
 * @desc    Delete an item (only if no purchase/consumption records exist)
 * @route   DELETE /api/v1/items/:id
 * @access  Private (Admin only)
 * @param   {number} id - Item ID in URL
 * @returns {AppSuccess} Confirmation message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Item deleted successfully",
 *   "data": null
 * }
 */
export const deleteItem = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.id, 10);
  if (isNaN(itemId)) {
    return next(new AppError("Invalid item ID", 400));
  }

  const item = await ItemService.getItemById(itemId);
  if (!item) {
    return next(new AppError("Item not found", 404));
  }

  await ItemService.deleteItem(itemId);
  res.status(200).json(new AppSuccess("Item deleted successfully", 200));
});

/**
 * @desc    Get all items with pagination and optional search
 * @route   GET /api/v1/items?page=1&limit=10&search=rice
 * @access  Private (Admin/Staff)
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by item name (optional)
 * @returns {AppSuccess} Paginated list of items
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Items fetched successfully",
 *   "data": {
 *     "data": [
 *       { "id": 12, "name": "Basmati Rice", "current_stock": 45, ... },
 *       { "id": 15, "name": "Chicken", "current_stock": 20, ... }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 25,
 *       "totalPages": 3,
 *       "hasNextPage": true,
 *       "hasPrevPage": false,
 *       "search": "rice"
 *     }
 *   }
 * }
 */
export const getAllItems = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await ItemService.getAllItems({ page, limit, search });
  res
    .status(200)
    .json(new AppSuccess("Items fetched successfully", result, 200));
});
