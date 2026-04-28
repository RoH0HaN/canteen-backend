import Joi from "joi";

export const createGoodSchema = Joi.object({
  name: Joi.string().required(),
  unit: Joi.string().required(),
  current_stock: Joi.number().min(0).default(0),
  min_stock_level: Joi.number().min(0).default(0),
});

export const updateGoodSchema = Joi.object({
  name: Joi.string().required(),
  unit: Joi.string().required(),
  min_stock_level: Joi.number().min(0).default(0),
});

export const adjustStockSchema = Joi.object({
  quantityChange: Joi.number().integer().required(),
  reason: Joi.string().required(),
  adjusted_by: Joi.string().required(),
});

export const purchaseSchema = Joi.object({
  purchase_data: Joi.array().items(
    Joi.object({
      good_id: Joi.number().positive().required(),
      quantity: Joi.number().positive().required(),
      unit_cost: Joi.number().positive().required(),
      total_cost: Joi.number().positive().required(),
    }),
  ),
  purchase_date: Joi.date().required(),
  purchased_by: Joi.string().required(),
});

export const consumptionSchema = Joi.object({
  consumption_data: Joi.array().items(
    Joi.object({
      good_id: Joi.number().positive().required(),
      quantity: Joi.number().positive().required(),
    }),
  ),
  issued_by: Joi.string().required(),
  issue_date: Joi.date().required(),
  menu: Joi.string(),
  person_counts: Joi.array()
    .items(
      Joi.object({
        category: Joi.string().required(),
        count: Joi.number().integer().min(0).required(),
      }),
    )
    .optional(),
  purpose: Joi.string().required(),
  issued_for: Joi.string().required(),
});
