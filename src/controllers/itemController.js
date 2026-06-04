import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ItemService } from "../services/itemService.js";
import { createItemSchema, updateItemSchema } from "../utils/validators.js";
import { deleteFile, uploadFile } from "../services/storageService.js";
import { StockMovementService } from "../services/stockMovementsService.js";

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
  }); // current stock will be fetched database separately

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
 *     "average_rate": 45
 *     "stock_value": 2025
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

  const { error, value } = updateItemSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { name, unit, min_stock_level } = value;

  const existingItem = await ItemService.getItemByName(name);
  if (existingItem && existingItem.id !== itemId) {
    return next(new AppError("Item with this name already exists", 409));
  }

  const updatedItem = await ItemService.updateItem(itemId, {
    name,
    unit,
    min_stock_level,
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
  res.status(200).json(new AppSuccess("Item deleted successfully", null, 200));
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

/**
 * @desc    Get daily item stock summery
 * @route   GET /api/v1/items/daily-stock-summery
 * @access  Private (Admin/Staff)
 * @param   {string} date - Date in YYYY-MM-DD format
 * @returns {AppSuccess} Item stock summery for the day
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Item stock summery fetched successfully",
 *   "data": [
 *     { "item_id": 12, "item_name": "Basmati Rice", "opening_stock": 45, ... },
 *     { "item_id": 15, "item_name": "Chicken", "opening_stock": 20, ... }
 *   ]
 * }
 */
export const getDailyItemStockSummery = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query; // fields changed from "date" to "startDate" and "endDate" for better clarity and flexibility

  if (!startDate || !endDate)
    return next(new AppError("Missing required parameters", 400));

  const result = await StockMovementService.getStockSummeryRange(
    startDate,
    endDate,
  );

  res
    .status(200)
    .json(
      new AppSuccess("Item stock summery fetched successfully", result, 200),
    );
});

/**
 * @desc    Get item daily stock summery
 * @route   GET /api/v1/items/daily-stock-summery
 * @access  Private (Admin/Staff)
 * @param   {number} itemId - Item ID
 * @param   {string} startDate - Start date in YYYY-MM-DD format
 * @param   {string} endDate - End date in YYYY-MM-DD format
 * @returns {AppSuccess} Item stock summery for the day
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Item stock summery fetched successfully",
 *   "data": [
 *     { "report_date": "2023-01-01", "item_id": 12, "opening_stock": 45, "received": 45, ... },
 *     { "report_date": "2023-01-01", "item_id": 15, "opening_stock": 20, "received": 20, ... }
 *   ]
 * }
 */
export const getItemStockSummery = asyncHandler(async (req, res, next) => {
  const { itemId, startDate, endDate } = req.query;

  if (!itemId || !startDate || !endDate)
    return next(new AppError("Missing required parameters", 400));

  const result = await StockMovementService.getItemStockSummeryRange(
    itemId,
    startDate,
    endDate,
  );

  const item = await ItemService.getItemById(itemId);
  if (!item) {
    return next(new AppError("Item not found", 404));
  }

  const data = {
    item: item,
    data: result,
  };

  res
    .status(200)
    .json(new AppSuccess("Item stock summery fetched successfully", data, 200));
});
