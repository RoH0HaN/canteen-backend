import Joi from "joi";

export const createUserSchema = Joi.object({
  name: Joi.string().required(),
  designation: Joi.string().required(),
  role: Joi.string().required(),
  user_id: Joi.string().required(),
  password: Joi.string().required(),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().optional(),
  designation: Joi.string().optional(),
  role: Joi.string().optional(),
});

export const loginUserSchema = Joi.object({
  user_id: Joi.string().required(),
  password: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().required(),
});

// Vendor
export const createVendorSchema = Joi.object({
  name: Joi.string().required(),
  address: Joi.string().required(),
  phone_number: Joi.number().required(),
  regd_office: Joi.string().required(),
  type_of_organization: Joi.string().required(),
  pan_number: Joi.string().required(),
  quality_certification: Joi.string().optional(),
  service_provided: Joi.string().optional(),
  trade_license: Joi.string().optional(),
  gst_no: Joi.string().optional(),
});

export const updateVendorSchema = Joi.object({
  name: Joi.string().optional(),
  address: Joi.string().optional(),
  phone_number: Joi.number().optional(),
  regd_office: Joi.string().optional(),
  type_of_organization: Joi.string().optional(),
  pan_number: Joi.string().optional(),
  quality_certification: Joi.string().optional(),
  service_provided: Joi.string().optional(),
  trade_license: Joi.string().optional(),
  gst_no: Joi.string().optional(),
});

// Item
export const createItemSchema = Joi.object({
  name: Joi.string().required(),
  base_unit_id: Joi.number().required(),
  min_stock_level: Joi.number().required(),
});

export const updateItemSchema = Joi.object({
  name: Joi.string().optional(),
  min_stock_level: Joi.number().optional(),
});

// Requisition
export const createRequisitionSchema = Joi.object({
  vendor_id: Joi.number().required(),
  notes: Joi.string().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        item_id: Joi.number().required(),
        required_quantity: Joi.number().required(),
        ordered_unit_id: Joi.number().required(),
      }),
    )
    .required(),
});

export const approveRequisitionSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        approved_quantity: Joi.number().required(),
        approval_remarks: Joi.string().allow("").optional(),
      }),
    )
    .required(),
});

export const receiveRequisitionSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        received_quantity: Joi.number().required(),
        received_unit_id: Joi.number().required(),
        rate: Joi.number().required(),
      }),
    )
    .required(),
});

export const updateRequisitionSchema = Joi.object({
  vendor_id: Joi.number().optional(),
  notes: Joi.string().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        required_quantity: Joi.number().required(),
        ordered_unit_id: Joi.number().required(),
      }),
    )
    .required(),
  new_items: Joi.array()
    .items(
      Joi.object({
        item_id: Joi.number().required(),
        required_quantity: Joi.number().required(),
        approved_quantity: Joi.number().required(),
      }),
    )
    .optional()
    .default([]), // If not provided, default to empty array
});

// Consumption
export const createConsumptionSchema = Joi.object({
  purpose: Joi.string().required(),
  notes: Joi.string().allow("").optional(),
  items: Joi.array()
    .items(
      Joi.object({
        item_id: Joi.number().required(),
        quantity: Joi.number().required(),
        unit_id: Joi.number().required(),
      }),
    )
    .required(),
});

export const approveConsumptionSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        approved_quantity: Joi.number().required(),
        approval_remarks: Joi.string().allow("").optional(),
      }),
    )
    .required(),
});

export const updateConsumptionSchema = Joi.object({
  purpose: Joi.string().optional(),
  notes: Joi.string().allow("").optional(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        quantity: Joi.number().required(),
        unit_id: Joi.number().required(),
      }),
    )
    .optional(),
});

// Unit
export const createUnitSchema = Joi.object({
  name: Joi.string().required(),
  symbol: Joi.string().optional().allow(""),
  category: Joi.string()
    .valid("count", "volume", "mass", "length")
    .optional()
    .allow(null),
  base_unit_id: Joi.number().integer().optional().allow(null),
  conversion_factor_to_base: Joi.number().positive().default(1),
});

export const updateUnitSchema = Joi.object({
  name: Joi.string().optional(),
  symbol: Joi.string().optional().allow(""),
  category: Joi.string()
    .valid("count", "volume", "mass", "length")
    .optional()
    .allow(null),
  base_unit_id: Joi.number().integer().optional().allow(null),
  conversion_factor_to_base: Joi.number().positive().optional(),
});

// Packaging
export const createPackagingSchema = Joi.object({
  from_unit_id: Joi.number().integer().required(),
  quantity_in_base_unit: Joi.number().positive().required(),
});

export const updatePackagingSchema = Joi.object({
  quantity_in_base_unit: Joi.number().positive().optional(),
});
