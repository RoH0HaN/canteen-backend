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
  regd_office: Joi.string().optional(),
  type_of_organization: Joi.string().optional(),
  pan_number: Joi.string().optional(),
  quality_certification: Joi.string().optional(),
  service_provided: Joi.string().optional(),
  trade_license: Joi.string().optional(),
  gst_no: Joi.string().optional(),
});
