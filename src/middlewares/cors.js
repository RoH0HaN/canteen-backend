/**
 * Custom CORS middleware
 */
export const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const origin = req.headers.origin;

  // Must NOT allow "*" when using credentials
  if (allowedOrigins.some((o) => origin?.startsWith(o))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );

  // Required to send cookies between frontend & backend
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
};
