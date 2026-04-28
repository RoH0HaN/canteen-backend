import { AppError } from "../utils/appError.js";

/**
 * Centralized Error Handler Middleware
 * Usage: placed at the end of middleware stack in app.ts
 */
export const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";

  // Handle known AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Handle validation errors (example: express-validator / joi / zod)
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token, please login again";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired, please login again";
  }

  // Create error response
  const errorResponse = {
    success: false,
    status: statusCode,
    message,
    details: err.details,
  };

  // Only show stack in development
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
    // console.error("🔥 Error:", err);
  } else {
    // In production, log error in a structured way (to file, Sentry, etc.)
    console.error(
      `[${new Date().toISOString()}] ${statusCode} - ${message} - ${req.method} ${req.originalUrl}`,
    );
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Handler – for unmatched routes
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    status: 404,
    message: `Route ${req.originalUrl} not found`,
  });
};
