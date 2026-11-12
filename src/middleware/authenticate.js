const jwt = require('jsonwebtoken');

module.exports = function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: { message: 'Bearer token required' } });

  const token = match[1];
  if (process.env.NODE_ENV === 'development' && /^development:\d+:\d+:\d+$/.test(token)) {
    req.auth = { development: true, token, permissions: ['*'] };
    return next();
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER || 'platform-iam',
      audience: process.env.JWT_AUDIENCE || 'platform-applications',
    });
    return next();
  } catch {
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }
};
