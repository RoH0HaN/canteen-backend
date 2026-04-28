import morgan from "morgan";
import fs from "fs";
import path from "path";

// Create logs directory if it doesn't exist
const logsDir = path.join("../../logs");
if (!fs.existsSync(logsDir)) {
  fs.promises.mkdir(logsDir, { recursive: true });
}

// File stream for production logs
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), {
  flags: "a",
});

/**
 * Custom Morgan tokens
 */
morgan.token("user-id", (req) => (req.user ? req.user.id : "anonymous"));
morgan.token("user-role", (req) => (req.user ? req.user.role : "guest"));

/**
 * Development logger (console with colors)
 */
export const devLogger = morgan((tokens, req, res) => {
  const status = Number(tokens.status(req, res));
  const method = tokens.method(req, res);
  const url = tokens.url(req, res);
  const responseTime = tokens["response-time"](req, res);
  const contentLength = tokens.res(req, res, "content-length") || "-";
  const userId = tokens["user-id"](req, res);
  const userRole = tokens["user-role"](req, res);
  const timestamp = new Date().toLocaleString();

  // Colors
  let statusColor = "\x1b[32m"; // Green for 2xx
  if (status >= 400 && status < 500) statusColor = "\x1b[33m"; // Yellow for 4xx
  if (status >= 500) statusColor = "\x1b[31m"; // Red for 5xx

  let methodColor = "\x1b[36m"; // Cyan
  if (method === "POST") methodColor = "\x1b[33m"; // Yellow
  if (["PUT", "PATCH"].includes(method)) methodColor = "\x1b[35m"; // Magenta
  if (method === "DELETE") methodColor = "\x1b[31m"; // Red

  return `[${timestamp}] ${methodColor}${method}\x1b[0m ${url} ${statusColor}${status}\x1b[0m [${responseTime}ms | ${contentLength} bytes] user:${userId} role:${userRole}`;
});

/**
 * Production logger (structured logs, written to file)
 */
export const prodLogger = morgan(
  ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms - role::user-role',
  {
    stream: accessLogStream,
    skip: (req, res) => req.url === "/health",
  },
);

/**
 * Simple request logger (console)
 */
export const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
};

/**
 * Simple response logger (console)
 */
export const responseLogger = (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    console.log(
      `[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} -> ${res.statusCode}`,
    );
    return originalSend.call(this, body);
  };
  next();
};
