import { AppError } from "../utils/appError.js";
import { AppSuccess } from "../utils/appSuccess.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { UserService } from "../services/userServices.js";
import {
  changePasswordSchema,
  createUserSchema,
  loginUserSchema,
  updateUserSchema,
} from "../utils/validators.js";
import { Enums } from "../utils/enums.js";
import { deleteFile, uploadFile } from "../services/storageService.js";
import {
  generateTokens,
  updateUserRefreshToken,
  authMiddleware,
} from "../middlewares/auth.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

/**
 * @desc    Create a new user
 * @route   POST /api/v1/users/create
 * @access  Private (Admin only)
 * @returns {AppSuccess} Created user object (without password)
 *
 * @example Response (201 Created)
 * {
 *   "statusCode": 201,
 *   "message": "User created successfully",
 *   "data": {
 *     "id": 5,
 *     "name": "John Doe",
 *     "designation": "Canteen Manager",
 *     "role": "manager",
 *     "user_id": "john123",
 *     "signature_url": "https://...",
 *     "status": "active"
 *   }
 * }
 */
export const createUser = asyncHandler(async (req, res, next) => {
  // Parse body if string
  if (req.body && typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body);
    } catch (err) {
      return next(
        new AppError("Invalid format. Must be a valid JSON array", 400),
      );
    }
  }

  // Validate request body FIRST
  const { error, value } = createUserSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { name, designation, role, user_id, password } = value;

  // Validate role against allowed values
  if (!Enums.roles.includes(role)) {
    return next(new AppError(`Validation error: Invalid role`, 400));
  }

  // Check if user_id already exists
  const existingUser = await UserService.getUserByUserId(user_id);
  if (existingUser) {
    return next(new AppError(`User ID already exists`, 409));
  }

  // Hash password before any other operation
  const hashedPassword = await bcrypt.hash(password, 10);

  // Prepare user data
  const userData = {
    name,
    designation,
    role,
    user_id,
    password: hashedPassword,
  };

  // Handle signature file upload (if provided)
  if (req.file) {
    try {
      userData.signature_url = await uploadFile(
        req.file,
        `SIGNATURE/USER/${uuidv4()}`,
      );
    } catch (uploadError) {
      return next(
        new AppError(`Failed to upload signature: ${uploadError.message}`, 500),
      );
    }
  }

  const user = await UserService.insertUser(userData);

  // Remove sensitive data from response
  const { password: _, ...userWithoutPassword } = user;

  res
    .status(201)
    .json(
      new AppSuccess("User created successfully", userWithoutPassword, 201),
    );
});

/**
 * @desc    Login user and issue access & refresh tokens (as httpOnly cookies)
 * @route   POST /api/v1/users/login
 * @access  Public
 * @returns {AppSuccess} User basic info (tokens are set in cookies)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Login successful",
 *   "data": {
 *     "id": 5,
 *     "user_id": "john123",
 *     "name": "John Doe",
 *     "role": "manager",
 *     "designation": "Canteen Manager"
 *   }
 * }
 */
export const loginUser = asyncHandler(async (req, res, next) => {
  const { error, value } = loginUserSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { user_id, password } = value;

  const user = await UserService.getUserByUserId(user_id);
  if (!user) {
    return next(new AppError(`Validation error: Invalid credentials`, 401));
  }

  if (user.status && user.status !== "active") {
    return next(
      new AppError(`Account is inactive. Please contact admin.`, 401),
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError(`Validation error: Invalid credentials`, 401));
  }

  const payload = {
    id: user.id,
    userId: user.user_id,
    role: user.role,
  };
  const { accessToken, refreshToken } = generateTokens(payload);
  await UserService.saveRefreshToken(user.user_id, refreshToken);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new AppSuccess(
        "Login successful",
        {
          accessToken,
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          role: user.role,
          designation: user.designation,
        },
        200,
      ),
    );
});

/**
 * @desc    Refresh access token using the refresh token cookie
 * @route   POST /api/v1/users/refresh-token
 * @access  Public (requires valid refresh token cookie)
 * @returns {AppSuccess} No data, only new access token in cookie
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Token refreshed",
 *   "data": null
 * }
 */
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) {
    return next(new AppError("Refresh token not found", 401));
  }

  const decoded = await authMiddleware.verifyRefreshToken(refreshToken);
  if (!decoded) {
    return next(new AppError("Invalid or expired refresh token", 401));
  }

  const payload = {
    id: decoded.id,
    userId: decoded.userId,
    role: decoded.role,
  };
  const { accessToken } = generateTokens(payload); // no await

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .json(new AppSuccess("Token refreshed", null, 200));
});

/**
 * @desc    Logout user – blacklist refresh token and clear cookies
 * @route   POST /api/v1/users/logout
 * @access  Private
 * @returns {AppSuccess} Success message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Logout successful",
 *   "data": null
 * }
 */
export const logoutUser = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) {
    return next(new AppError("Refresh token not found", 400));
  }

  await authMiddleware.addToBlacklist(refreshToken);
  res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new AppSuccess("Logout successful", null, 200));
});

/**
 * @desc    Get the currently authenticated user's profile
 * @route   GET /api/v1/users/me
 * @access  Private
 * @returns {AppSuccess} Full user object (excluding password)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "User found",
 *   "data": {
 *     "id": 5,
 *     "name": "John Doe",
 *     "designation": "Canteen Manager",
 *     "role": "manager",
 *     "user_id": "john123",
 *     "signature_url": "https://...",
 *     "status": "active"
 *   }
 * }
 */
export const getCurrentUser = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const user = await UserService.getUserById(userId);

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.status(200).json(new AppSuccess("User found", user, 200));
});

/**
 * @desc    Get the user by ID
 * @route   GET /api/v1/users/me
 * @access  Private
 * @param   {number} id - User ID in URL
 * @returns {AppSuccess} Full user object (excluding password)
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "User found",
 *   "data": {
 *     "id": 5,
 *     "name": "John Doe",
 *     "designation": "Canteen Manager",
 *     "role": "manager",
 *     "user_id": "john123",
 *     "signature_url": "https://...",
 *     "status": "active"
 *   }
 * }
 */
export const getUserById = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const user = await UserService.getUserById(userId);

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.status(200).json(new AppSuccess("User found", user, 200));
});

/**
 * @desc    Update the currently authenticated user's profile
 * @route   PUT /api/v1/users/update/:id
 * @access  Public (but user can only update their own profile, admin can update any)
 * @param   {number} id - User ID in URL (must match authenticated user's ID unless admin)
 * @returns {AppSuccess} Updated user object
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "User John Doe updated",
 *   "data": {
 *     "id": 5,
 *     "name": "John Updated",
 *     "designation": "Senior Manager",
 *     "role": "manager",
 *     "user_id": "john123",
 *     "signature_url": "https://..."
 *   }
 * }
 */
export const updateCurrentUser = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return next(new AppError("Invalid user ID", 400));
  }

  const { error, value } = updateUserSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const existingUser = await UserService.getUserById(userId);
  if (!existingUser) {
    return next(new AppError("User not found", 404));
  }

  const updateData = { ...value };

  if (req.file) {
    if (existingUser.signature_url && existingUser.signature_url !== "N/A") {
      await deleteFile(existingUser.signature_url);
    }
    try {
      updateData.signature_url = await uploadFile(
        req.file,
        `SIGNATURE/USER/${uuidv4()}`,
      );
    } catch (uploadError) {
      return next(
        new AppError(`Failed to upload signature: ${uploadError.message}`, 500),
      );
    }
  }

  const updatedUser = await UserService.updateUser(userId, updateData);
  res
    .status(200)
    .json(new AppSuccess(`User ${updatedUser.name} updated`, updatedUser, 200));
});

/**
 * @desc    Block a user (admin only)
 * @route   PATCH /api/v1/users/block/:id
 * @access  Private (Admin)
 * @param   {number} id - User ID in URL
 * @returns {AppSuccess} Confirmation message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "User John Doe blocked",
 *   "data": null
 * }
 */
export const blockUser = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return next(new AppError("Invalid user ID", 400));
  }

  const user = await UserService.getUserById(userId);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const updatedUser = await UserService.updateUser(userId, {
    status: "blocked",
  });
  res
    .status(200)
    .json(new AppSuccess(`User ${updatedUser.name} blocked`, null, 200));
});

/**
 * @desc    Unblock a user (admin only)
 * @route   PATCH /api/v1/users/unblock/:id
 * @access  Private (Admin)
 * @param   {number} id - User ID in URL
 * @returns {AppSuccess} Confirmation message
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "User John Doe unblocked",
 *   "data": null
 * }
 */
export const unblockUser = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return next(new AppError("Invalid user ID", 400));
  }

  const user = await UserService.getUserById(userId);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const updatedUser = await UserService.updateUser(userId, {
    status: "active",
  });
  res
    .status(200)
    .json(new AppSuccess(`User ${updatedUser.name} unblocked`, null, 200));
});

/**
 * @desc    Change the current user's password
 * @route   POST /api/v1/users/change-password
 * @access  Private
 * @returns {AppSuccess} Success message only
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Password for John Doe changed",
 *   "data": null
 * }
 */
export const changeUserPassword = asyncHandler(async (req, res, next) => {
  const userId = parseInt(req.user.id, 10);
  if (isNaN(userId)) {
    return next(new AppError("Invalid user ID", 400));
  }

  const { error, value } = changePasswordSchema.validate(req.body);
  if (error) {
    return next(
      new AppError(`Validation error: ${error.details[0].message}`, 400),
    );
  }

  const { current_password, new_password } = value;

  const user = await UserService.getUserById(userId);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (!(await bcrypt.compare(current_password, user.password))) {
    return next(new AppError("Current password is incorrect", 400));
  }

  const updatedUser = await UserService.updateUser(userId, {
    password: await bcrypt.hash(new_password, 10),
  });

  res
    .status(200)
    .json(
      new AppSuccess(`Password for ${updatedUser.name} changed`, null, 200),
    );
});

/**
 * @desc    Get all users with pagination and optional search
 * @route   GET /api/v1/users/list?page=1&limit=10&search=john
 * @access  Private (Admin)
 * @param   {number} page - Page number (default 1)
 * @param   {number} limit - Items per page (default 10)
 * @param   {string} search - Search by user name (optional)
 * @returns {AppSuccess} Paginated list of users
 *
 * @example Response (200 OK)
 * {
 *   "statusCode": 200,
 *   "message": "Users retrieved",
 *   "data": {
 *     "data": [
 *       {
 *         "id": 5,
 *         "name": "John Doe",
 *         "user_id": "john123",
 *         "role": "manager",
 *         "status": "active"
 *       }
 *     ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 10,
 *       "totalItems": 25,
 *       "totalPages": 3,
 *       "hasNextPage": true,
 *       "hasPrevPage": false,
 *       "search": "john"
 *     }
 *   }
 * }
 */
export const getAllUsers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const result = await UserService.getAllUsers({ page, limit, search });
  res.status(200).json(new AppSuccess("Users retrieved", result, 200));
});
