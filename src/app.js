const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const authenticate = require('./middleware/authenticate');
const errorHandler = require('./middleware/error-handler');
const resourceRoutes = require('./routes');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(helmet());
app.use(hpp());
const requestLimit = Number(process.env.MMMS_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? 600 : 120));
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: requestLimit,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
}));
app.get('/health', (req, res) => res.json({ service: 'mmms-backend', status: 'ok', version: '0.1.0' }));
app.use('/v1', authenticate, resourceRoutes);
app.use(errorHandler);

module.exports = app;
