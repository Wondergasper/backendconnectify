// services/analyticsService.js
const winston = require('winston');

class AnalyticsService {
  constructor() {
    this.logger = this.createLogger();
    this.redis = require('../services/redisService');
    this.db = require('mongoose');
  }

  createLogger() {
    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'connectify-backend' },
      transports: [
        // Write all logs with level 'error' and below to error.log
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        // Write all logs with level 'info' and below to combined.log
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        // Console transport for development
        ...(process.env.NODE_ENV !== 'production' ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        ] : [])
      ]
    });
  }

  // Log user activities
  logUserActivity(userId, action, details = {}) {
    const logData = {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      userAgent: details.userAgent,
      ip: details.ip,
      location: details.location
    };

    this.logger.info('User Activity', logData);
    
    // Store in Redis for real-time analytics
    const activityKey = `user:activity:${userId}`;
    this.redis.getClient().lpush(activityKey, JSON.stringify(logData));
    this.redis.getClient().expire(activityKey, 86400 * 7); // 7 days expiry
  }

  // Log API requests
  logApiRequest(request, response, duration) {
    const logData = {
      method: request.method,
      url: request.originalUrl,
      statusCode: response.statusCode,
      duration: `${duration}ms`,
      userId: request.user ? request.user._id : 'anonymous',
      ip: request.ip,
      userAgent: request.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    this.logger.info('API Request', logData);
    
    // Store in Redis for monitoring
    const requestKey = `api:request:${new Date().toISOString().split('T')[0]}`;
    this.redis.getClient().lpush(requestKey, JSON.stringify(logData));
    this.redis.getClient().expire(requestKey, 86400 * 30); // 30 days expiry
  }

  // Log errors
  logError(error, context = {}) {
    const logData = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    };

    this.logger.error('Application Error', logData);
    
    // Store in Redis for error monitoring
    const errorKey = `error:log:${new Date().toISOString().split('T')[0]}`;
    this.redis.getClient().lpush(errorKey, JSON.stringify(logData));
    this.redis.getClient().expire(errorKey, 86400 * 30); // 30 days expiry
  }

  // Track user metrics
  async trackUserMetrics(userId, metric, value = 1) {
    const metricKey = `metric:user:${metric}`;
    await this.redis.getClient().hincrby(metricKey, userId, value);
    await this.redis.getClient().expire(metricKey, 86400 * 30); // 30 days expiry
  }

  // Track system metrics
  async trackSystemMetrics(metric, value = 1) {
    const metricKey = `metric:system:${metric}`;
    await this.redis.getClient().incrby(metricKey, value);
    await this.redis.getClient().expire(metricKey, 86400); // 1 day expiry
  }

  // Get dashboard statistics
  async getDashboardStats() {
    try {
      // Get user activity counts
      const dailyUsers = await this.redis.getClient().scard('users:active:today');
      const weeklyUsers = await this.redis.getClient().scard('users:active:week');
      const monthlyUsers = await this.redis.getClient().scard('users:active:month');
      
      // Get service metrics
      const totalServices = await this.redis.getClient().get('metrics:total_services') || 0;
      
      // Get booking metrics
      const dailyBookings = await this.redis.getClient().get('metrics:bookings:today') || 0;
      const totalBookings = await this.redis.getClient().get('metrics:total_bookings') || 0;
      
      return {
        users: {
          dailyActive: parseInt(dailyUsers),
          weeklyActive: parseInt(weeklyUsers),
          monthlyActive: parseInt(monthlyUsers)
        },
        services: {
          total: parseInt(totalServices)
        },
        bookings: {
          daily: parseInt(dailyBookings),
          total: parseInt(totalBookings)
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logError(error, { function: 'getDashboardStats' });
      return null;
    }
  }

  // Log booking events
  logBookingEvent(bookingId, eventType, details = {}) {
    const logData = {
      bookingId,
      eventType,
      details,
      timestamp: new Date().toISOString()
    };

    this.logger.info('Booking Event', logData);
    
    // Track in Redis
    const key = `booking:events:${bookingId}`;
    this.redis.getClient().lpush(key, JSON.stringify(logData));
    this.redis.getClient().expire(key, 86400 * 30); // 30 days expiry
    
    // Update system metrics
    this.trackSystemMetrics('total_bookings');
    if (eventType === 'created') {
      this.trackSystemMetrics('bookings_today');
    }
  }

  // Log security events
  logSecurityEvent(userId, action, details = {}) {
    const logData = {
      userId,
      action,
      details,
      timestamp: new Date().toISOString(),
      ip: details.ip
    };

    this.logger.warn('Security Event', logData);
    
    // Store security events separately
    const securityKey = `security:events:${new Date().toISOString().split('T')[0]}`;
    this.redis.getClient().lpush(securityKey, JSON.stringify(logData));
    this.redis.getClient().expire(securityKey, 86400 * 90); // 90 days expiry
  }

  // Get user activity history
  async getUserActivityHistory(userId, limit = 50) {
    try {
      const activityKey = `user:activity:${userId}`;
      const activities = await this.redis.getClient().lrange(activityKey, 0, limit - 1);
      return activities.map(activity => JSON.parse(activity));
    } catch (error) {
      this.logError(error, { function: 'getUserActivityHistory', userId });
      return [];
    }
  }

  // Log performance metrics
  logPerformanceMetric(metricName, value, tags = {}) {
    const logData = {
      metricName,
      value,
      tags,
      timestamp: new Date().toISOString()
    };

    this.logger.info('Performance Metric', logData);
  }

  // Get logger instance for direct use
  getLogger() {
    return this.logger;
  }
}

module.exports = new AnalyticsService();