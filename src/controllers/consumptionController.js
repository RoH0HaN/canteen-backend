import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { GoodsService } from "../services/goodsService.js";
import { ConsumptionService } from "../services/consumptionServices.js";
import { consumptionSchema } from "../utils/validators.js";
import { asyncHandler } from "../utils/asyncHandler.js";
/**
 * @desc    Consume items (create a new consumption record)
 * @route   POST /api/v1/consume
 * @access  Private
 * @returns {AppSuccess}
 *
 * Request body (JSON):
 *   - consumption_data: JSON string of array
 *   - issued_by: string
 *   - issue_date: ISO date string
 *   - menu: string
 *   - person_counts: JSON string of array
 *   - purpose: string
 *   - issued_for: string
 * 
 * Demo request body:
  {
    consumption_data: [
        {
        good_id: 1,
        quantity: 2,
        },
        {
        good_id: 2,
        quantity: 5,
        }
    ],
    issued_by: "John Doe",
    issue_date: "2024-06-01",
    menu: "Fried Rice, Chicken Curry, Salad",
    person_counts: [
        { category: "students", count: 50 },
        { category: "staff", count: 10 }
    ],
    purpose: "Hostel, Counter Sale, Order, Event",
    issued_for: "Composite"
}
 */
export const createConsumption = asyncHandler(async (req, res, next) => {
  const {
    consumption_data,
    issued_by,
    issue_date,
    menu,
    person_counts,
    purpose,
    issued_for,
  } = req.body;

  // Validate the parsed data (files are not in body, so we validate separately)
  const { error, value } = consumptionSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  // Check existence of all goods & validate quantities
  for (const item of consumption_data) {
    const good = await GoodsService.findGoodById(item.good_id);
    if (!good) {
      return next(new AppError(`Good with id ${item.good_id} not found`, 404));
    }

    // Validate quantity: must be positive and not exceed current stock
    if (item.quantity <= 0 || item.quantity > good.current_stock) {
      return next(
        new AppError(
          `Quantity must be positive and not exceed current stock for good id ${item.good_id}`,
          400,
        ),
      );
    }
  }

  // Insert into consumptions table
  const consumptionRecord = await ConsumptionService.insertConsumption({
    issued_by,
    issue_date,
    menu,
    person_counts,
    purpose,
    issued_for,
  });

  // Process each consumed item
  for (const item of consumption_data) {
    // Insert into consumed_items table
    await ConsumptionService.insertConsumedItem({
      good_id: item.good_id,
      consumption_id: consumptionRecord.id,
      quantity: item.quantity,
    });

    // Decrement stock
    await GoodsService.decrementStockIfAvailable(item.good_id, item.quantity);
  }

  return res.status(200).json(new AppSuccess("Consumption successful"));
});

/**
 * @desc    Get a single consumption by ID with all consumed items
 * @route   GET /api/v1/consumptions/:id
 * @access  Private
 * @returns {AppSuccess} Consumption object with flattened items array
 *
 * URL params:
 *   - id: consumption ID (integer)
 *
 * Demo response data:
 *   {
 *     "id": 1,
 *     "issued_by": "John Doe",
 *     "issue_date": "2024-06-01",
 *     "menu": "Fried Rice, Chicken Curry, Salad",
 *     "person_counts": [{"category":"students","count":50}],
 *     "purpose": "Hostel",
 *     "issued_for": "Composite",
 *     "items": [
 *       {
 *         "id": 101,
 *         "quantity": 2,
 *         "good_id": 1,
 *         "good_name": "Basmati Rice",
 *         "unit": "kg"
 *       }
 *     ]
 *   }
 */
export const getConsumptionById = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);

  if (
    isNaN(consumptionId) ||
    !Number.isInteger(consumptionId) ||
    !consumptionId
  ) {
    return next(new AppError("Invalid consumption ID", 400));
  }

  const consumption =
    await ConsumptionService.getConsumptionById(consumptionId);
  if (!consumption) {
    return next(
      new AppError(`Consumption with id ${consumptionId} not found`, 404),
    );
  }
  res
    .status(200)
    .json(new AppSuccess("Consumption retrieved successfully", consumption));
});

/**
 * @desc    Get all consumptions with pagination, filters, and search
 * @route   GET /api/v1/consumptions?page=1&limit=10&startDate=2024-01-01&endDate=2024-12-31&issued_by=John&search=rice
 * @access  Private
 * @returns {AppSuccess} Paginated list of consumptions (each flattened)
 *
 * Query parameters:
 *   - page: number (default 1)
 *   - limit: number (default 10)
 *   - startDate: ISO date (filter consumptions after this date)
 *   - endDate: ISO date (filter consumptions before this date)
 *   - issued_by: string (exact match)
 *   - search: string (case-insensitive partial match on issued_by, menu, purpose, issued_for)
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
export const getAllConsumptions = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";
  const { startDate, endDate, issued_by } = req.query;

  const result = await ConsumptionService.getAllConsumptions({
    page,
    limit,
    search,
    filters: { startDate, endDate, issued_by },
  });

  res
    .status(200)
    .json(new AppSuccess("Consumptions retrieved successfully", result));
});

/**
 * @desc    Delete a consumption and restore consumed stock
 * @route   DELETE /api/v1/consumptions/:id
 * @access  Private
 * @returns {AppSuccess} Confirmation message and consumption ID
 *
 * URL params:
 *   - id: consumption ID (integer)
 *
 * Demo response:
 *   {
 *     "message": "Consumption deleted and stock restored",
 *     "data": {
 *       "success": true,
 *       "message": "Consumption deleted and stock restored successfully",
 *       "consumption_id": 42
 *     }
 *   }
 */
export const deleteConsumption = asyncHandler(async (req, res, next) => {
  const consumptionId = parseInt(req.params.id, 10);
  if (
    isNaN(consumptionId) ||
    !Number.isInteger(consumptionId) ||
    !consumptionId
  ) {
    return next(new AppError("Invalid consumption ID", 400));
  }

  const result =
    await ConsumptionService.deleteConsumptionAndRestoreStock(consumptionId);

  res
    .status(200)
    .json(new AppSuccess("Consumption deleted and stock restored", result));
});
