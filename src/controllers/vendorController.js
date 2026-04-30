import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { VendorService } from "../services/vendorServices.js";
import { createVendorSchema, updateVendorSchema } from "../utils/validators.js";
import { uploadFile, deleteFile } from "../services/storageService.js";
import { v4 as uuidv4 } from "uuid";

/**
 * @desc    Create a new vendor
 * @route   POST /api/v1/vendors/create
 * @access  Private (Admin only)
 * @returns {AppSuccess} Created vendor object
 *
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "Vendor ABC Traders created",
 *   "data": {
 *     "id": 7,
 *     "name": "ABC Traders",
 *     "pan_number": "ABCDE1234F",
 *     "address": "123 Market Street",
 *     "contact": "9876543210",
 *     "signature_url": "https://.../SIGNATURE/VENDOR/abc-123.png"
 *   }
 * }
 */
export const createVendor = asyncHandler(async (req, res, next) => {
  const { error, value } = createVendorSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { pan_number } = value;

  // Check for duplicate PAN
  const existingVendor = await VendorService.getVendorByPan(pan_number);
  if (existingVendor) {
    return next(new AppError("Vendor with this PAN already exists", 409));
  }

  const vendorData = { ...value };

  // Handle optional file upload (vendor logo or document)
  if (req.file) {
    try {
      vendorData.signature_url = await uploadFile(
        req.file,
        `SIGNATURE/VENDOR/${uuidv4()}`,
      );
    } catch (uploadError) {
      return next(
        new AppError(`Failed to upload signature: ${uploadError.message}`, 500),
      );
    }
  }

  const newVendor = await VendorService.insertVendor(vendorData);

  res
    .status(201)
    .json(new AppSuccess(`Vendor ${newVendor.name} created`, newVendor, 201));
});

/**
 * @desc    Update an existing vendor
 * @route   PUT /api/v1/vendors/update/:id
 * @access  Private (Admin only)
 * @param   {number} id - Vendor ID in URL
 * @returns {AppSuccess} Updated vendor object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Vendor ABC Traders updated",
 *   "data": {
 *     "id": 7,
 *     "name": "ABC Traders Updated",
 *     "pan_number": "ABCDE1234F",
 *     "address": "456 New Address",
 *     "contact": "9988776655",
 *     "signature_url": "https://.../new-signature.png"
 *   }
 * }
 */
export const updateVendor = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(new AppError("Invalid vendor ID", 400));
  }

  const { error, value } = updateVendorSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const existingVendor = await VendorService.getVendorById(vendorId);
  if (!existingVendor) {
    return next(new AppError("Vendor not found", 404));
  }

  // If PAN is being updated, check uniqueness
  if (value.pan_number && value.pan_number !== existingVendor.pan_number) {
    const panExists = await VendorService.getVendorByPan(value.pan_number);
    if (panExists) {
      return next(
        new AppError("Another vendor with this PAN already exists", 409),
      );
    }
  }

  const vendorData = { ...value };

  // Handle optional file upload (vendor logo or document)
  if (req.file) {
    if (
      existingVendor.signature_url &&
      existingVendor.signature_url !== "N/A"
    ) {
      await deleteFile(existingVendor.signature_url);
    }
    try {
      vendorData.signature_url = await uploadFile(
        req.file,
        `SIGNATURE/VENDOR/${uuidv4()}`,
      );
    } catch (uploadError) {
      return next(
        new AppError(`Failed to upload signature: ${uploadError.message}`, 500),
      );
    }
  }

  const updatedVendor = await VendorService.updateVendor(vendorId, vendorData);
  res
    .status(200)
    .json(
      new AppSuccess(
        `Vendor ${updatedVendor.name} updated`,
        updatedVendor,
        200,
      ),
    );
});

/**
 * @desc    Get a single vendor by ID
 * @route   GET /api/v1/vendors/get/:id
 * @access  Private (Admin/Staff)
 * @param   {number} id - Vendor ID in URL
 * @returns {AppSuccess} Vendor object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Vendor retrieved",
 *   "data": {
 *     "id": 7,
 *     "name": "ABC Traders",
 *     "pan_number": "ABCDE1234F",
 *     "address": "123 Market Street",
 *     "contact": "9876543210",
 *     "signature_url": "https://.../signature.png"
 *   }
 * }
 */
export const getVendorById = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(new AppError("Invalid vendor ID", 400));
  }

  const vendor = await VendorService.getVendorById(vendorId);
  if (!vendor) {
    return next(new AppError("Vendor not found", 404));
  }

  res.status(200).json(new AppSuccess("Vendor retrieved", vendor, 200));
});

/**
 * @desc    Delete a vendor (hard delete – removes all records)
 * @route   DELETE /api/v1/vendors/delete/:id
 * @access  Private (Admin only)
 * @param   {number} id - Vendor ID in URL
 * @returns {AppSuccess} Confirmation message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Vendor ABC Traders deleted",
 *   "data": null
 * }
 */
export const deleteVendor = asyncHandler(async (req, res, next) => {
  const vendorId = parseInt(req.params.id, 10);
  if (isNaN(vendorId)) {
    return next(new AppError("Invalid vendor ID", 400));
  }

  const vendor = await VendorService.getVendorById(vendorId);
  if (!vendor) {
    return next(new AppError("Vendor not found", 404));
  }

  await VendorService.deleteVendor(vendorId);
  res.status(200).json(new AppSuccess(`Vendor ${vendor.name} deleted`, 200));
});

/**
 * @desc    Get all vendors with pagination and optional search
 * @route   GET /api/v1/vendors/list?page=1&limit=10&search=abc
 * @access  Private (Admin/Staff)
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by vendor name (optional)
 * @returns {AppSuccess} Paginated vendor list
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Vendors retrieved",
 *   "data": {
 *     "data": [
 *       { "id": 7, "name": "ABC Traders", "pan_number": "ABCDE1234F", ... },
 *       { "id": 9, "name": "XYZ Suppliers", "pan_number": "XYZ1234567", ... }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 25,
 *       "totalPages": 3,
 *       "hasNextPage": true,
 *       "hasPrevPage": false,
 *       "search": "abc"
 *     }
 *   }
 * }
 */
export const getVendors = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await VendorService.getVendors({ page, limit, search });
  res.status(200).json(new AppSuccess("Vendors retrieved", result, 200));
});
