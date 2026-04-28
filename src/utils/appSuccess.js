import dayjs from "dayjs";

export class AppSuccess {
  constructor(message, data = null, statusCode) {
    this.message = message;
    this.data = data;
    this.statusCode = statusCode;
    this.timestamp = dayjs().toISOString();
  }

  toJSON() {
    return {
      message: this.message,
      data: this.data,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    };
  }
}
