// middleware/security.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const analyticsService = require('../services/analyticsService');

// Helmet security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://*.cloudinary.com'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: {
    policy: 'same-origin',
  },
});

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs, // Time window in milliseconds
    max, // Limit each IP to max requests per windowMs
    message: {
      success: false,
      message: message
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for certain conditions
      // For example, skip for admin users or internal requests
      return req.user && req.user.role === 'admin';
    }
  });
};

// Different rate limiters for different purposes
const globalRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // Limit each IP to 100 requests per window
  'Too many requests from this IP, please try again later.'
);

const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // Limit each IP to 5 authentication requests per window
  'Too many authentication attempts from this IP, please try again later.'
);

const searchRateLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  30, // Limit each IP to 30 search requests per window
  'Too many search requests from this IP, please try again later.'
);

// XSS protection using built-in express functionality
const xssProtection = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key]
          .replace(/[^a-zA-Z0-9\s\-_.,:;/~=!@#$%^&*()+=}{[\]|\\:";'<>?]/g, '')
          .trim();
      }
    });
  }

  // Sanitize body parameters
  if (req.body) {
    const sanitizeValue = (value) => {
      if (typeof value === 'string') {
        return value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      }
      return value;
    };

    const sanitizeObject = (obj) => {
      if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            obj[key] = sanitizeObject(obj[key]);
          } else if (typeof obj[key] === 'string') {
            obj[key] = sanitizeValue(obj[key]);
          }
        });
      }
      return obj;
    };

    req.body = sanitizeObject(req.body);
  }

  next();
};

// MongoDB query sanitization
const mongoSanitization = mongoSanitize({
  allowDots: true,
  replaceWith: '_'
});

// HTTP Parameter Pollution protection
const hppProtection = hpp();

// Security logging middleware
const securityLogging = (req, res, next) => {
  // Log potential security issues
  if (req.query.password || req.body.password) {
    analyticsService.logSecurityEvent(
      req.user ? req.user._id : 'anonymous',
      'password_in_query_or_body',
      {
        ip: req.ip,
        endpoint: req.originalUrl,
        method: req.method
      }
    );
  }

  next();
};

// IP tracking and logging
const trackIP = (req, res, next) => {
  req.clientIP = req.headers['x-forwarded-for'] ||
                 req.connection.remoteAddress ||
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null);

  next();
};

module.exports = {
  securityHeaders,
  globalRateLimiter,
  authRateLimiter,
  searchRateLimiter,
  xssProtection,
  mongoSanitization,
  hppProtection,
  securityLogging,
  trackIP
};