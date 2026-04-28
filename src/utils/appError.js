import dayjs from "dayjs";

export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = dayjs().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}
