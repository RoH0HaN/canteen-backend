import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { GoodsService } from "../services/goodsService.js";
import { AdjustmentService } from "../services/adjustmentService.js";
import {
  createGoodSchema,
  updateGoodSchema,
  adjustStockSchema,
} from "../utils/validators.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * @desc    Create a new good (item in inventory)
 * @route   POST /api/v1/goods
 * @access  Private
 * @returns {AppSuccess}
 *
 * Request body (JSON):
 *   - name: string (required)
 *   - unit: string (required) e.g., "kg", "liters", "pieces"
 *   - current_stock: number (optional, default 0)
 *   - min_stock_level: number (optional, default 0)
 *
 * Demo request body:
 *   {
 *     "name": "Basmati Rice",
 *     "unit": "kg",
 *     "current_stock": 50,
 *     "min_stock_level": 10
 *   }
 */
export const createGood = asyncHandler(async (req, res, next) => {
  const { name, unit, current_stock, min_stock_level } = req.body;

  // Validate input
  const { error, value } = createGoodSchema.validate({
    name,
    unit,
    current_stock,
    min_stock_level,
  });
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  // Insert good into database
  await GoodsService.insertGood(value);

  res.status(201).json(new AppSuccess("Good created successfully"));
});

/**
 * @desc    Update an existing good (excludes stock adjustment)
 * @route   PUT /api/v1/goods/:id
 * @access  Private
 * @returns {AppSuccess}
 *
 * URL params:
 *   - id: good's ID (integer)
 *
 * Request body (JSON):
 *   - name: string (optional)
 *   - unit: string (optional)
 *   - min_stock_level: number (optional)
 *
 * Demo request body:
 *   {
 *     "name": "Premium Basmati Rice",
 *     "unit": "kg",
 *     "min_stock_level": 15
 *   }
 */
export const updateGood = asyncHandler(async (req, res, next) => {
  const goodId = parseInt(req.params.id, 10);

  if (isNaN(goodId) || !Number.isInteger(goodId) || !goodId) {
    return next(new AppError("Invalid good ID", 400));
  }

  const { name, unit, min_stock_level } = req.body;

  // Validate input
  const { error, value } = updateGoodSchema.validate({
    name,
    unit,
    min_stock_level,
  });
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  // Update good in database
  await GoodsService.updateGood(goodId, value);

  res.status(200).json(new AppSuccess("Good updated successfully"));
});

/**
 * @desc    Get a single good by ID
 * @route   GET /api/v1/goods/:id
 * @access  Private
 * @returns {AppSuccess} with good object
 *
 * URL params:
 *   - id: good's ID (integer)
 *
 * Demo response data:
 *   {
 *     "id": 1,
 *     "name": "Basmati Rice",
 *     "unit": "kg",
 *     "current_stock": 50,
 *     "min_stock_level": 10,
 *     "created_at": "2024-06-01T10:00:00Z"
 *   }
 */
export const getGoodById = asyncHandler(async (req, res, next) => {
  const goodId = parseInt(req.params.id, 10);

  if (isNaN(goodId) || !Number.isInteger(goodId) || !goodId) {
    return next(new AppError("Invalid good ID", 400));
  }

  const good = await GoodsService.findGoodById(goodId);
  if (!good) {
    return next(new AppError(`Good with id ${goodId} not found`, 404));
  }
  res.status(200).json(new AppSuccess("Good retrieved successfully", good));
});

/**
 * @desc    Delete a good (only if no purchase/issue records exist)
 * @route   DELETE /api/v1/goods/:id
 * @access  Private
 * @returns {AppSuccess}
 *
 * URL params:
 *   - id: good's ID (integer)
 *
 * Demo response:
 *   { "message": "Good deleted successfully" }
 */
export const deleteGood = asyncHandler(async (req, res, next) => {
  const goodId = parseInt(req.params.id, 10);

  if (isNaN(goodId) || !Number.isInteger(goodId) || !goodId) {
    return next(new AppError("Invalid good ID", 400));
  }

  await GoodsService.deleteGood(goodId);
  res.status(200).json(new AppSuccess("Good deleted successfully"));
});

/**
 * @desc    Adjust stock manually (positive = increase, negative = decrease)
 * @route   PATCH /api/v1/goods/:id/stock
 * @access  Private
 * @returns {AppSuccess}
 *
 * URL params:
 *   - id: good's ID (integer)
 *
 * Request body (JSON):
 *   - quantityChange: number (required) e.g., 50 or -20
 *   - reason: string (required) – short explanation
 *   - adjusted_by: string (required) – name or role
 *
 * Demo request body:
 *   {
 *     "quantityChange": 100,
 *     "reason": "Inventory count correction",
 *     "adjusted_by": "Manager"
 *   }
 */
export const adjustStock = asyncHandler(async (req, res, next) => {
  const goodId = parseInt(req.params.id, 10);

  if (isNaN(goodId) || !Number.isInteger(goodId) || !goodId) {
    return next(new AppError("Invalid good ID", 400));
  }

  const { quantityChange, reason, adjusted_by } = req.body;
  // Validate input
  const { error, value } = adjustStockSchema.validate({
    quantityChange,
    reason,
    adjusted_by,
  });
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  await AdjustmentService.insertAdjustment({
    good_id: goodId,
    quantity_change: quantityChange,
    reason: reason,
    adjusted_by: adjusted_by,
  });

  await GoodsService.adjustStock(goodId, quantityChange);
  res.status(200).json(new AppSuccess("Stock adjusted successfully"));
});

/**
 * @desc    Get all goods
 * @route   GET /api/v1/goods
 * @access  Private
 * @returns {AppSuccess} with an array of good objects
 *
 * Demo response data:
 *   [
 *     {
 *       "id": 1,
 *       "name": "Basmati Rice",
 *       "unit": "kg",
 *       "current_stock": 50,
 *       "min_stock_level": 10,
 *       "created_at": "2024-06-01T10:00:00Z"
 *     },
 *   ]
 */
export const getAllGoods = asyncHandler(async (req, res, next) => {
  const goods = await GoodsService.getAllGoods();
  res
    .status(200)
    .json(new AppSuccess("All goods retrieved successfully", goods));
});
