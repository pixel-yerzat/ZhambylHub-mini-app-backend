import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err);

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    stack: config.isDev ? err.stack : undefined,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Not Found - ${req.originalUrl}`,
  });
}
