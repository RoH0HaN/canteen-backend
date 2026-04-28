const asyncHandler =
  (requestHandler) =>
  (req, res, next, ...args) => {
    return Promise.resolve(requestHandler(req, res, next, ...args)).catch(next);
  };

export { asyncHandler };
