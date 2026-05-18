function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message, err.stack);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
