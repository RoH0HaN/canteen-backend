import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { UnitService } from "../services/unitService.js";
import { createUnitSchema, updateUnitSchema } from "../utils/validators.js";

/**
 * @desc    Get all units (with optional category filter)
 * @route   GET /api/v1/units/get
 * @access  Public
 * @returns {AppSuccess} List of units
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Units retrieved",
 *   "data": [
 *     {
 *       "id": 1,
 *       "name": "Gram",
 *       "category": "mass",
 *       "symbol": "g",
 *       "base_unit_id": null,
 *       "conversion_factor_to_base": 1,
 *       "created_at": "2021-01-01T00:00:00.000Z"
 *     }
 *   ]
 * }
 */
export const getAllUnits = asyncHandler(async (req, res, next) => {
  const { category } = req.query;
  const units = await UnitService.getAllUnits({ category });
  res.status(200).json(new AppSuccess("Units retrieved", units, 200));
});

/**
 * @desc    Get a unit by ID
 * @route   GET /api/v1/units/get/:id
 * @access  Public
 * @param   {number} id - Unit ID
 * @returns {AppSuccess} Unit
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Unit retrieved",
 *   "data": {
 *     "id": 1,
 *     "name": "Gram",
 *     "category": "mass",
 *     "symbol": "g",
 *     "base_unit_id": null,
 *     "conversion_factor_to_base": 1,
 *     "created_at": "2021-01-01T00:00:00.000Z"
 *   }
 * }
 */
export const getUnitById = asyncHandler(async (req, res, next) => {
  const unitId = parseInt(req.params.id, 10);
  if (isNaN(unitId)) return next(new AppError("Invalid unit ID", 400));
  const unit = await UnitService.getUnitById(unitId);
  if (!unit) return next(new AppError("Unit not found", 404));
  res.status(200).json(new AppSuccess("Unit retrieved", unit, 200));
});

/**
 * @desc    Create a new unit
 * @route   POST /api/v1/units/create
 * @access  Private (Admin)
 * @param   {string} name - Name of the unit
 * @param   {string} category - Category of the unit
 * @param   {string} symbol - Symbol of the unit
 * @param   {number} base_unit_id - ID of the base unit
 * @param   {number} conversion_factor_to_base - Conversion factor to the base unit
 * @returns {AppSuccess} Created unit
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Unit created",
 *   "data": {
 *     "id": 1,
 *     "name": "Gram",
 *     "category": "mass",
 *     "symbol": "g",
 *     "base_unit_id": null,
 *     "conversion_factor_to_base": 1,
 *     "created_at": "2021-01-01T00:00:00.000Z"
 *   }
 * }
 */
export const createUnit = asyncHandler(async (req, res, next) => {
  const { error, value } = createUnitSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  const newUnit = await UnitService.createUnit(value);
  res.status(201).json(new AppSuccess("Unit created", newUnit, 201));
});

/**
 * @desc    Update a unit
 * @route   PUT /api/v1/units/update/:id
 * @access  Private (Admin)
 * @param   {number} id - Unit ID in URL
 * @param   {string} name - Name of the unit
 * @param   {string} category - Category of the unit
 * @param   {string} symbol - Symbol of the unit
 * @param   {number} base_unit_id - ID of the base unit
 * @param   {number} conversion_factor_to_base - Conversion factor to the base unit
 * @returns {AppSuccess} Updated unit
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Unit updated",
 *   "data": {
 *     "id": 1,
 *     "name": "Gram",
 *     "category": "mass",
 *     "symbol": "g",
 *     "base_unit_id": null,
 *     "conversion_factor_to_base": 1,
 *     "created_at": "2021-01-01T00:00:00.000Z"
    }
  }
 */
export const updateUnit = asyncHandler(async (req, res, next) => {
  const unitId = parseInt(req.params.id, 10);
  if (isNaN(unitId)) return next(new AppError("Invalid unit ID", 400));
  const { error, value } = updateUnitSchema.validate(req.body);
  if (error)
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  const updated = await UnitService.updateUnit(unitId, value);
  res.status(200).json(new AppSuccess("Unit updated", updated, 200));
});

/**
 * @desc    Delete a unit
 * @route   DELETE /api/v1/units/delete/:id
 * @access  Private (Admin)
 * @param   {number} id - Unit ID in URL
 * @returns {AppSuccess} Deleted unit
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Unit deleted",
 *   "data": null
 * }
 */
export const deleteUnit = asyncHandler(async (req, res, next) => {
  const unitId = parseInt(req.params.id, 10);
  if (isNaN(unitId)) return next(new AppError("Invalid unit ID", 400));
  await UnitService.deleteUnit(unitId);
  res.status(200).json(new AppSuccess("Unit deleted", null, 200));
});
