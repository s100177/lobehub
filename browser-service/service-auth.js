export const createServiceAuthMiddleware = (serviceToken) => (req, res, next) => {
  if (req.path === '/status') return next();
  if (!serviceToken) {
    return res.status(503).json({
      code: 'BROWSER_SERVICE_TOKEN_REQUIRED',
      error: 'BROWSER_SERVICE_TOKEN must be configured',
    });
  }
  if (req.headers['x-browser-service-token'] !== serviceToken) {
    return res.status(401).json({ code: 'BROWSER_SERVICE_UNAUTHORIZED', error: 'Unauthorized' });
  }
  next();
};
