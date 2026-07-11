import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { PackagingService } from "../services/packagingService.js";
import {
  createPackagingSchema,
  updatePackagingSchema,
} from "../utils/validators.js";

/**
 * @desc    Get all packaging entries for an item
 * @route   GET /api/v1/packaging/item/:itemId
 * @access  Private (Admin/Staff)
 * @param   {number} itemId - Item ID in URL
 * @returns {AppSuccess} List of packaging entries for the item
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Packaging retrieved",
 *   "data": [
 *     {
 *       "id": 1,
 *       "item_id": 1,
 *       "from_unit_id": 1,
 *       "quantity_in_base_unit": 10,
 *       "unit_name": "Gram",
 *       "unit_symbol": "g",
 *       "unit_category": "mass"
 *     }
 *   ]
 * }
 */
export const getPackagingByItem = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) return next(new AppError("Invalid item ID", 400));
  const packaging = await PackagingService.getPackagingByItemId(itemId);
  res.status(200).json(new AppSuccess("Packaging retrieved", packaging, 200));
});

/**
 * @desc    Get a single packaging entry by ID
 * @route   GET /api/v1/packaging/:packagingId
 * @access  Private (Admin/Staff)
 * @param   {number} packagingId - Packaging ID in URL
 * @returns {AppSuccess} Packaging entry
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Packaging retrieved",
 *   "data": {
 *     "id": 1,
 *     "item_id": 1,
 *     "from_unit_id": 1,
 *     "quantity_in_base_unit": 10,
 *     "unit_name": "Gram",
 *     "unit_symbol": "g",
 *     "unit_category": "mass"
 *   }
 * }
 */
export const getPackagingById = asyncHandler(async (req, res, next) => {
  const packagingId = parseInt(req.params.packagingId, 10);
  if (isNaN(packagingId))
    return next(new AppError("Invalid packaging ID", 400));
  const packaging = await PackagingService.getPackagingById(packagingId);
  if (!packaging) return next(new AppError("Packaging not found", 404));
  res.status(200).json(new AppSuccess("Packaging retrieved", packaging, 200));
});

/**
 * @desc    Create a new packaging entry for an item
 * @route   POST /api/v1/packaging/item/:itemId
 * @access  Private (Admin/Staff)
 * @param   {number} itemId - Item ID in URL
 * @returns {AppSuccess} Created packaging entry
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Packaging created",
 *   "data": {
 *     "id": 1,
 *     "item_id": 1,
 *     "from_unit_id": 1,
 *     "quantity_in_base_unit": 10
 *   }
 * }
 */
export const createPackaging = asyncHandler(async (req, res, next) => {
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) return next(new AppError("Invalid item ID", 400));
  const { error, value } = createPackagingSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  const newPackaging = await PackagingService.createPackaging({
    item_id: itemId,
    ...value,
  });
  res.status(201).json(new AppSuccess("Packaging created", newPackaging, 201));
});

/**
 * @desc    Update a packaging entry
 * @route   PUT /api/v1/packaging/:packagingId
 * @access  Private (Admin/Staff)
 * @param   {number} packagingId - Packaging ID in URL
 * @returns {AppSuccess} Updated packaging entry
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Packaging updated",
 *   "data": {
 *     "id": 1,
 *     "item_id": 1,
 *     "from_unit_id": 1,
 *     "quantity_in_base_unit": 10
 *   }
 * }
 */
export const updatePackaging = asyncHandler(async (req, res, next) => {
  const packagingId = parseInt(req.params.packagingId, 10);
  if (isNaN(packagingId))
    return next(new AppError("Invalid packaging ID", 400));
  const { error, value } = updatePackagingSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  const updated = await PackagingService.updatePackaging(packagingId, value);
  res.status(200).json(new AppSuccess("Packaging updated", updated, 200));
});

/**
 * @desc    Delete a packaging entry
 * @route   DELETE /api/v1/packaging/:packagingId
 * @access  Private (Admin/Staff)
 * @param   {number} packagingId - Packaging ID in URL
 * @returns {AppSuccess} Deleted packaging entry
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Packaging deleted",
 *   "data": null
 * }
 */
export const deletePackaging = asyncHandler(async (req, res, next) => {
  const packagingId = parseInt(req.params.packagingId, 10);
  if (isNaN(packagingId))
    return next(new AppError("Invalid packaging ID", 400));
  await PackagingService.deletePackaging(packagingId);
  res.status(200).json(new AppSuccess("Packaging deleted", null, 200));
});
