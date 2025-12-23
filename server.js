const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser'); // Add cookie parser
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Add morgan for logging HTTP requests
const morgan = require('morgan');
const redisService = require('./services/redisService'); // Import Redis service

// Security check for JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback_secret_key') {
  console.warn('WARNING: Using fallback JWT secret. Please set JWT_SECRET in .env for production use.');
}

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
// Parse CORS origin for Socket.IO as well
let socketCorsOrigin = process.env.CORS_ORIGIN || [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',  // Added to match frontend
  'http://127.0.0.1:8080'   // Added to support both access methods
];

if (typeof socketCorsOrigin === 'string') {
  // If it's a comma-separated string, split into array
  if (socketCorsOrigin.includes(',')) {
    socketCorsOrigin = socketCorsOrigin.split(',').map(origin => origin.trim());
  }
}

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

// Middleware
// Parse CORS origin - if it's a comma-separated string, convert to array
let corsOrigin = process.env.CORS_ORIGIN || [
  'http://localhost:5173',  // Default Vite port
  'http://localhost:3000',  // Common React dev port
  'http://localhost:3001',  // Alternative React dev port
  'http://localhost:8080',  // Vite dev server port (matches vite.config.ts)
  'http://127.0.0.1:8080'   // IP-based dev server port
];

if (typeof corsOrigin === 'string') {
  // If it's a comma-separated string, split into array
  if (corsOrigin.includes(',')) {
    corsOrigin = corsOrigin.split(',').map(origin => origin.trim());
  }
}

app.use(cors({
  origin: corsOrigin,
  credentials: true // Enable credentials (cookies)
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser()); // Add cookie parser middleware

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

// Socket.IO middleware for authentication using JWT
const jwt = require('jsonwebtoken');
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  // Verify JWT token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
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

// API routes
app.use('/api/auth', authRateLimit, authRoutes);  // Apply stricter rate limit to auth endpoints
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

// Health check endpoint (with database and Redis status)
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const redisStatus = redisInitialized ? 'connected' : 'disconnected';

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    redis: redisStatus
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and Redis, then start server
(async () => {
  try {
    // MongoDB connection with optimized settings
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/connectify', {
      maxPoolSize: 20,          // Maintain up to 20 socket connections
      serverSelectionTimeoutMS: 5000,  // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000,          // Close sockets after 45 seconds of inactivity
      family: 4,                       // Use IPv4
      bufferCommands: false,           // Disable mongoose buffering
      useUnifiedTopology: true         // Use new topology engine
    });

    console.log('Connected to MongoDB');

    // Set mongoose debug mode in development for performance optimization
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }

    // MongoDB connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

    await initializeRedis();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Redis initialized: ${redisInitialized}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
})();

module.exports = app;