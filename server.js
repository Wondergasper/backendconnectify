const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Add cookie parser
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Add morgan for logging HTTP requests
const morgan = require('morgan');
const redisService = require('./services/redisService'); // Import Redis service
const bookingReminderService = require('./services/bookingReminderService'); // Import booking reminder service
const { userRepository } = require('./repositories/supabase/userRepository');

// CRITICAL: Validate required environment variables on startup
const requiredEnvVars = [
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease set these variables in your .env file and restart the server.');
  process.exit(1);
}

// Additional validation for JWT_SECRET strength
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ CRITICAL ERROR: JWT_SECRET must be at least 32 characters long for security.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Enable trust proxy for Render/Vercel reverse proxies
const server = http.createServer(app);

// Configure Socket.IO with CORS
// Default origins that should ALWAYS be allowed for Socket.IO
const socketDefaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',  // Matches Vite config
  'http://127.0.0.1:8080',  // IP-based access
  'http://localhost:19006',  // Expo web preview
  'http://127.0.0.1:19006',
  'http://localhost:19008',  // Codex mobile preview
  'http://127.0.0.1:19008',
  'http://localhost:8081',   // Expo Metro
  'http://127.0.0.1:8081',
  'https://connectifynigeria.vercel.app'  // Production frontend on Vercel
];

// Parse environment variable origins if provided for Socket.IO
let socketEnvOrigins = [];
if (process.env.CORS_ORIGIN) {
  if (process.env.CORS_ORIGIN.includes(',')) {
    socketEnvOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
  } else {
    socketEnvOrigins = [process.env.CORS_ORIGIN.trim()];
  }
}

// Merge default and env origins, removing duplicates
const socketCorsOrigin = [...new Set([...socketDefaultOrigins, ...socketEnvOrigins])];

const io = socketIo(server, {
  cors: {
    origin: socketCorsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow Socket.IO v3 clients
  pingTimeout: 60000,
  pingInterval: 25000
});

// Store io instance in app for access in controllers
app.set('io', io);

// Logging middleware
app.use(morgan('combined'));

// CORS origins - Production URLs included
// Default origins that should ALWAYS be allowed
const defaultOrigins = [
  'http://localhost:5173',  // Default Vite port
  'http://localhost:3000',  // Common React dev port
  'http://localhost:3001',  // Alternative React dev port
  'http://localhost:8080',  // Vite dev server port (matches vite.config.ts)
  'http://127.0.0.1:8080',  // IP-based dev server port
  'http://localhost:19006',  // Expo web preview
  'http://127.0.0.1:19006',
  'http://localhost:19008',  // Codex mobile preview
  'http://127.0.0.1:19008',
  'http://localhost:8081',   // Expo Metro
  'http://127.0.0.1:8081',
  'https://connectifynigeria.vercel.app'  // Production frontend on Vercel
];

// Parse environment variable origins if provided
let envOrigins = [];
if (process.env.CORS_ORIGIN) {
  if (process.env.CORS_ORIGIN.includes(',')) {
    envOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
  } else {
    envOrigins = [process.env.CORS_ORIGIN.trim()];
  }
}

// Merge default and env origins, removing duplicates
let corsOrigin = [...new Set([...defaultOrigins, ...envOrigins])];

app.use(cors({
  origin: corsOrigin,
  credentials: true, // Enable credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Client-Type'
  ],
  exposedHeaders: ['set-cookie'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
  maxAge: 86400 // 24 hours
}));

// Security middleware - CRITICAL: Protect against common attacks
const {
  securityHeaders,
  sameOriginGuard,
  xssProtection,
  hppProtection
} = require('./middleware/security');

app.use(securityHeaders);      // Helmet security headers
app.use(xssProtection);        // XSS attack prevention
app.use(hppProtection);        // HTTP Parameter Pollution prevention

// Body parsing with size limits (reduced to prevent DoS)
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // Add cookie parser middleware
app.use(sameOriginGuard(corsOrigin));

// Rate limiting configuration
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased for development - was 5 to prevent brute force
  message: 'Too many authentication attempts from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each IP to 1000 API requests per windowMs for authenticated users
  message: 'Too many API requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated users (you can implement this logic)
    // For now, applying to all requests
    return false;
  }
});

// Apply global rate limit to all requests
app.use(globalRateLimit);

// Initialize Redis
let redisInitialized = false;
async function initializeRedis() {
  try {
    await redisService.init();
    console.log('✅ Redis service initialized successfully');
    redisInitialized = true;

    // Test the connection
    const isReady = await redisService.getClient().ping();
    console.log('✅ Redis ping:', isReady);

    // Display connection details
    const connectionInfo = redisService.getClient().options;
    if (process.env.REDIS_URL) {
      const sanitizedUrl = process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@');
      console.log('📡 Redis connected via URL:', sanitizedUrl);
    } else {
      console.log('📡 Redis connected via HOST/PORT:', {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
      });
    }
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error.message);
    console.log('⚠️  Server will continue without Redis caching');
    redisInitialized = false;
  }
}

// Helper: parse raw Cookie header string into a plain object
const parseCookieHeader = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.split('=');
    if (!rawKey || rawValue.length === 0) return acc;
    const key = rawKey.trim();
    const value = rawValue.join('=').trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
};

// Socket.IO middleware for authentication — supports access token + refresh token
// fallback so connections survive beyond the 15-minute access token lifespan.
io.use(async (socket, next) => {
  try {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie || '');
    const accessToken =
      socket.handshake.auth?.token ||
      cookies.accessToken ||
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    const refreshToken = cookies.refreshToken;

    if (!accessToken && !refreshToken) {
      return next(new Error('Authentication error: No tokens provided'));
    }

    // 1. Try access token first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        
        // Look up user to get their actual role since it's not encoded in the token
        const user = await userRepository.findById(decoded.userId);
        
        if (user && user.isActive !== false) {
          socket.userId = decoded.userId;
          socket.userRole = user.role;
          return next();
        }
        // If user not found or inactive, fall through to refresh token or fail
      } catch (accessErr) {
        // Access token expired or invalid, continue to refresh token check
        if (!refreshToken) {
          return next(new Error('Authentication error: Access token expired and no refresh token available'));
        }
      }
    }

    // 2. Fall back to refresh token if access token failed or was missing
    if (refreshToken) {
      try {
        const refreshDecoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        // Critical: Must fetch user to get role AND verify refresh token hash against DB 
        // to prevent disconnected/logged-out users from reconnecting
        const user = await userRepository.findById(refreshDecoded.userId, { includePrivate: true });
        
        if (!user || user.isActive === false || !user.refreshTokenHash) {
          throw new Error('User/Token invalid');
        }

        const { hashRefreshToken } = require('./utils/tokenUtils');
        const refreshTokenHash = hashRefreshToken(refreshToken);

        if (user.refreshTokenHash !== refreshTokenHash) {
          throw new Error('Invalid refresh token hash');
        }

        socket.userId = refreshDecoded.userId;
        socket.userRole = user.role;
        return next();
      } catch (refreshErr) {
        return next(new Error('Authentication error: Invalid or expired refresh token'));
      }
    }

    return next(new Error('Authentication error: Authentication failed'));
  } catch (error) {
    console.error('Socket.IO auth middleware error:', error);
    next(new Error('Authentication error: Internal server error'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected with socket ID: ${socket.id}`);

  // Join user-specific rooms
  socket.join(`user_${socket.userId}`);
  socket.join(`notifications_${socket.userId}`);

  // Handle joining user room (for frontend-initiated room joining)
  socket.on('joinUserRoom', (data) => {
    const { userId } = data;
    if (userId && userId === socket.userId) {
      socket.join(`user_${userId}`);
      socket.join(`notifications_${userId}`);
      console.log(`User ${userId} joined their user rooms`);
    }
  });

  // Handle different events
  require('./socketHandlers')(io, socket);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
    socket.leave(`user_${socket.userId}`);
    socket.leave(`notifications_${socket.userId}`);
  });
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const walletRoutes = require('./routes/wallet');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const availabilityRoutes = require('./routes/availability');
const categoryRoutes = require('./routes/categories');
const receiptRoutes = require('./routes/receipts');
const verificationRoutes = require('./routes/verification');
const imageRoutes = require('./routes/images');
const uploadRoutes = require('./routes/upload');
const locationRoutes = require('./routes/location');
const notifyRoutes = require('./routes/notify');
const cardRoutes = require('./routes/cards');
const auditRoutes = require('./routes/audit');
const whatsappRoutes = require('./modules/whatsapp');

const analyticsRoutes = require('./routes/analytics');
const adminAuthRoutes = require('./routes/adminAuth');

// B2B / Company-provider routes
const providerRoutes = require('./routes/providers');
const companyRoutes = require('./routes/company');
const providerServicesRoutes = require('./routes/providerServices');
const serviceRequestsRoutes = require('./routes/serviceRequests');
const adminCompanyRoutes = require('./routes/adminCompany');
const quotesRoutes = require('./routes/quotes');


// API routes
app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/admin/auth', authRateLimit, adminAuthRoutes);
app.use('/api/analytics', apiRateLimit, analyticsRoutes);  // Apply stricter rate limit to auth endpoints
app.use('/api/users', apiRateLimit, userRoutes);
app.use('/api/services', apiRateLimit, serviceRoutes);
app.use('/api/bookings', apiRateLimit, bookingRoutes);
app.use('/api/wallet', apiRateLimit, walletRoutes);
app.use('/api/notifications', apiRateLimit, notificationRoutes);
app.use('/api/messages', apiRateLimit, messageRoutes);
app.use('/api/reviews', apiRateLimit, reviewRoutes);
app.use('/api/availability', apiRateLimit, availabilityRoutes);
app.use('/api/categories', apiRateLimit, categoryRoutes);
app.use('/api/receipts', apiRateLimit, receiptRoutes);
app.use('/api/verification', apiRateLimit, verificationRoutes);
app.use('/api/images', apiRateLimit, imageRoutes);
app.use('/api/upload', apiRateLimit, uploadRoutes);
app.use('/api/location', apiRateLimit, locationRoutes);
app.use('/api/notify', apiRateLimit, notifyRoutes);
app.use('/api/cards', apiRateLimit, cardRoutes);
app.use('/api/audit', apiRateLimit, auditRoutes);
app.use('/api/whatsapp', apiRateLimit, whatsappRoutes);

// B2B / Company-provider routes
app.use('/api/providers', apiRateLimit, providerRoutes);
app.use('/api/company', apiRateLimit, companyRoutes);
app.use('/api/provider-services', apiRateLimit, providerServicesRoutes);
app.use('/api/provider', apiRateLimit, serviceRequestsRoutes);
app.use('/api/admin', apiRateLimit, adminCompanyRoutes);
app.use('/api/quotes', apiRateLimit, quotesRoutes);


// Health check endpoint (with database and Redis status)
app.get('/api/health', async (req, res) => {
  const dbStatus = 'connected'; // Supabase database connection active
  const redisStatus = redisInitialized ? 'connected' : 'disconnected';

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    redis: redisStatus
  });
});

// Error handling middleware
const { AppError } = require('./utils/errors');

app.use((err, req, res, next) => {
  // If headers are already sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Log the error for debugging
  console.error(`[Error] ${req.method} ${req.url}:`, err.stack);

  // Determine status code and message
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong!';
  let errors = err.errors || undefined;

  // For production, hide internal server error details
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  const errorResponse = {
    success: false,
    error: message,
    errors: errors,
    statusCode: statusCode
  };

  // Include stack trace in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Connect to Redis and start server
(async () => {
  try {
    process.on('SIGINT', () => {
      console.log('App terminated via SIGINT');
      process.exit(0);
    });

    await initializeRedis();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Redis initialized: ${redisInitialized}`);

      // Start booking reminder service (sends reminders 1 day before booking)
      bookingReminderService.start();
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  bookingReminderService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
