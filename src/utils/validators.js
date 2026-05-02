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
  unit: Joi.string().required(),
  min_stock_level: Joi.number().required(),
  opening_stock: Joi.number().required(),
});

export const updateItemSchema = Joi.object({
  name: Joi.string().optional(),
  unit: Joi.string().optional(),
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
        approval_remarks: Joi.string().optional(),
      }),
    )
    .required(),
});

export const receiveRequisitionSchema = Joi.object({
  total_amount: Joi.number().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        received_quantity: Joi.number().required(),
      }),
    )
    .required(),
});

export const updateRequisitionSchema = Joi.object({
  vendor_id: Joi.number().optional(),
  notes: Joi.string().optional(),
  total_amount: Joi.number().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        required_quantity: Joi.number().required(),
        approved_quantity: Joi.number().required(),
        approval_remarks: Joi.string().allow("").optional(),
        received_quantity: Joi.number().required(),
      }),
    )
    .required(),
});

// Consumption
export const createConsumptionSchema = Joi.object({
  purpose: Joi.string().required(),
  notes: Joi.string().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        item_id: Joi.number().required(),
        quantity: Joi.number().required(),
      }),
    )
    .required(),
});

export const updateConsumptionSchema = Joi.object({
  purpose: Joi.string().optional(),
  notes: Joi.string().optional(),
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().required(),
        quantity: Joi.number().required(),
      }),
    )
    .optional(),
});
