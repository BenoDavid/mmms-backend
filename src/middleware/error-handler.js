module.exports = function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  const isValidation = error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError';
  const status = error.status || (isValidation ? 400 : 500);
  const message = error.status || isValidation
    ? (error.errors?.map((item) => item.message).join(', ') || error.message)
    : 'Internal server error';
  return res.status(status).json({ error: { message } });
};
