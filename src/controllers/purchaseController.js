import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { GoodsService } from "../services/goodsService.js";
import { PurchaseService } from "../services/purchaseService.js";
import { uploadBillFile, deleteBillFile } from "../services/storageService.js";
import { purchaseSchema } from "../utils/validators.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * @desc    Create a new purchase
 * @route   POST /api/v1/purchases
 * @access  Private
 * @returns {AppSuccess}
 *
 * Request body (form-data):
 *   - purchase_data: JSON string of array
 *   - purchase_date: ISO date string
 *   - purchased_by: string
 *   - files: (optional) multiple file attachments
 *
 * Demo request body:
  {
    purchase_data: [
        {
        good_id: 1,
        quantity: 2,
        unit_cost: 10.5,
        total_cost: 21.0,
        },
        {
        good_id: 2,
        quantity: 5,
        unit_cost: 5.0,
        total_cost: 25.0,
        },
    ],
    purchase_date: "2024-06-01",
    purchased_by: "John Doe",
    files: [`(file object from multer)`],
    };
 */
export const createPurchase = asyncHandler(async (req, res, next) => {
  // Extract data from request
  let { purchase_data, purchase_date, purchased_by } = req.body;
  const files = req.files || []; // safety guard

  // Parse purchase_data if it's a string (coming from form-data)
  if (typeof purchase_data === "string") {
    purchase_data = JSON.parse(purchase_data);
  }

  // Validate the parsed data (files are not in body, so we validate separately)
  const { error, value } = purchaseSchema.validate({
    purchase_data,
    purchase_date,
    purchased_by,
  });
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  // Check existence of all goods & validate quantities
  for (const item of purchase_data) {
    const good = await GoodsService.findGoodById(item.good_id);
    if (!good) {
      return next(new AppError(`Good with id ${item.good_id} not found`, 404));
    }
    if (item.quantity <= 0) {
      return next(
        new AppError(
          `Quantity must be positive for good id ${item.good_id}`,
          400,
        ),
      );
    }
  }

  //Upload bill files (if any) with unique base name
  let billFileUrls = [];
  if (files.length > 0) {
    try {
      billFileUrls = await Promise.all(
        files.map((file) => uploadBillFile(file, purchase_date)),
      );
    } catch (uploadError) {
      return next(
        new AppError(`File upload failed: ${uploadError.message}`, 500),
      );
    }
  }

  // Insert purchase record
  let purchase;
  try {
    purchase = await PurchaseService.insertPurchase({
      purchase_date,
      purchased_by,
      bill_files: billFileUrls,
    });
  } catch (dbError) {
    // Rollback uploaded files if purchase insert fails
    if (billFileUrls.length) {
      await deleteBillFile(billFileUrls);
    }
    return next(
      new AppError(`Failed to create purchase: ${dbError.message}`, 500),
    );
  }

  // Insert purchased items and update stock atomically
  for (const item of purchase_data) {
    const total_cost = item.total_cost || item.quantity * item.unit_cost;

    // Insert purchased item
    await PurchaseService.insertPurchasedItem({
      purchase_id: purchase.id,
      good_id: item.good_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: total_cost,
    });

    // Atomic stock increment (no race condition)
    await GoodsService.incrementStock(item.good_id, item.quantity);
  }

  // Return success
  return res
    .status(201)
    .json(new AppSuccess("Purchase created successfully", purchase));
});

/**
 * @desc    Get a single purchase by ID with all items
 * @route   GET /api/v1/purchases/:id
 * @access  Private
 * @returns {AppSuccess} Purchase object with flattened items array
 *
 * URL params:
 *   - id: purchase ID (integer)
 *
 * Demo response data:
 *   {
 *     "id": 5,
 *     "purchase_date": "2024-06-01T10:00:00Z",
 *     "purchased_by": "John Doe",
 *     "bill_files": ["https://.../bill1.pdf"],
 *     "items": [
 *       {
 *         "id": 12,
 *         "quantity": 10,
 *         "unit_cost": 25.5,
 *         "total_cost": 255,
 *         "good_id": 3,
 *         "good_name": "Rice",
 *         "unit": "kg"
 *       }
 *     ]
 *   }
 */
export const getPurchaseById = asyncHandler(async (req, res, next) => {
  const purchaseId = parseInt(req.params.id, 10);

  if (isNaN(purchaseId) || !Number.isInteger(purchaseId) || !purchaseId) {
    return next(new AppError("Invalid Purchase ID", 400));
  }

  const purchase = await PurchaseService.getPurchaseById(purchaseId);
  if (!purchase) {
    return next(new AppError(`Purchase with id ${purchaseId} not found`, 404));
  }
  res
    .status(200)
    .json(new AppSuccess("Purchase retrieved successfully", purchase));
});

/**
 * @desc    Get all purchases with pagination, filters, and search
 * @route   GET /api/v1/purchases?page=1&limit=10&startDate=2024-01-01&endDate=2024-12-31&purchased_by=John&search=doe
 * @access  Private
 * @returns {AppSuccess} Paginated list of purchases (each flattened)
 *
 * Query parameters:
 *   - page: number (default 1)
 *   - limit: number (default 10)
 *   - startDate: ISO date (filter purchases after this date)
 *   - endDate: ISO date (filter purchases before this date)
 *   - purchased_by: string (exact match)
 *   - search: string (case-insensitive partial match on purchased_by)
 *
 * Demo response:
 *   {
 *     "data": { ... },
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 25,
 *       "totalPages": 3,
 *       "hasNextPage": true,
 *       "hasPrevPage": false,
 *       "search": ""
 *     }
 *   }
 */
export const getAllPurchases = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";
  const { startDate, endDate, purchased_by } = req.query;

  const result = await PurchaseService.getAllPurchases({
    page,
    limit,
    search,
    filters: { startDate, endDate, purchased_by },
  });

  res
    .status(200)
    .json(new AppSuccess("Purchases retrieved successfully", result));
});

/**
 * @desc    Delete a purchase and restore stock (subtract purchased quantities)
 * @route   DELETE /api/v1/purchases/:id
 * @access  Private
 * @returns {AppSuccess} Confirmation message and purchase ID
 *
 * URL params:
 *   - id: purchase ID (integer)
 *
 * Demo response:
 *   {
 *     "message": "Purchase deleted and stock restored",
 *     "data": {
 *       "success": true,
 *       "message": "Purchase deleted and stock restored successfully",
 *       "purchase_id": 5
 *     }
 *   }
 */
export const deletePurchase = asyncHandler(async (req, res, next) => {
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId) || !Number.isInteger(purchaseId) || !purchaseId) {
    return next(new AppError("Invalid purchase ID", 400));
  }

  const result =
    await PurchaseService.deletePurchaseAndRestoreStock(purchaseId);
  res
    .status(200)
    .json(new AppSuccess("Purchase deleted and stock restored", result));
});
