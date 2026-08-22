// middleware/security.js
const helmet = require('helmet');
const hpp = require('hpp');

// Helmet security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://*.supabase.com'],
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

// HTTP Parameter Pollution protection
const hppProtection = hpp();

const sameOriginGuard = (allowedOrigins = []) => {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return (req, res, next) => {
    if (!unsafeMethods.has(req.method) || req.method === 'OPTIONS') {
      return next();
    }

    const hasCookieAuth = Boolean(
      req.cookies?.accessToken ||
      req.cookies?.refreshToken ||
      req.cookies?.adminAccessToken ||
      req.cookies?.adminRefreshToken
    );
    if (!hasCookieAuth) {
      return next();
    }

    const source = req.get('origin') || req.get('referer');
    if (!source) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }

    let sourceOrigin;
    try {
      sourceOrigin = new URL(source).origin;
    } catch (error) {
      return res.status(403).json({ error: 'Invalid request origin' });
    }

    if (!allowed.has(sourceOrigin)) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }

    next();
  };
};

module.exports = {
  securityHeaders,
  sameOriginGuard,
  xssProtection,
  hppProtection,
};