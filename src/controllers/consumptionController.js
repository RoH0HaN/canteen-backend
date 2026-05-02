import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ConsumptionService } from "../services/consumptionService.js";
import { ItemService } from "../services/itemService.js";
import { createConsumptionSchema } from "../utils/validators.js";
import { uploadFile } from "../services/storageService.js";
import { v4 as uuidv4 } from "uuid";
import { Enums } from "../utils/enums.js";

export const createConsumption = asyncHandler(async (req, res, next) => {
  const { error } = createConsumptionSchema.validate(req.body);
  if (error) {
    return next(error);
  }

  const { purpose, notes, items } = req.body;

  const consumption = await ConsumptionService.insertConsumption({
    purpose,
    notes,
  });

  if (!consumption) {
    return next(new AppError("Failed to create consumption", 500));
  }

  for (const item of items) {
    const itemData = await ItemService.getItemById(item.item_id);
    if (!itemData) {
      return next(new AppError("Item not found", 404));
    }

    await ConsumptionService.insertConsumptionItem({
      consumption_event_id: consumption.id,
      item_id: item.requisition_item_id,
      quantity: item.quantity,
    });
  }
});
