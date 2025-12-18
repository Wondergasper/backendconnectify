// middleware/redisCache.js
const redisService = require('../services/redisService');

// Enhanced cache middleware for API responses
const cacheResponse = (keyGenerator, ttl = 300) => {
  return async (req, res, next) => {
    try {
      const cacheKey = typeof keyGenerator === 'function'
        ? keyGenerator(req)
        : keyGenerator;

      if (!cacheKey) {
        return next(); // Skip caching if no key is provided
      }

      // Add user-specific cache if user is authenticated
      const userCacheKey = req.user ? `${cacheKey}:user:${req.user._id}` : cacheKey;

      const cachedResponse = await redisService.getClient().get(userCacheKey);

      if (cachedResponse) {
        console.log(`Cache HIT for key: ${userCacheKey}`);
        return res.json(JSON.parse(cachedResponse));
      }

      console.log(`Cache MISS for key: ${userCacheKey}`);

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Only cache successful responses with cacheable data
        if (this.statusCode < 400 && data && typeof data === 'object') {
          // Add cache metadata
          const cacheData = {
            ...data,
            _cached: true,
            _cachedAt: new Date().toISOString(),
            _ttl: ttl
          };

          redisService.getClient().setEx(userCacheKey, ttl, JSON.stringify(cacheData))
            .catch(err => console.error('Cache set error:', err));
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Redis cache middleware error:', error);
      next(); // Continue without caching if Redis fails
    }
  };
};

// Cache key generators
const cacheKeyGenerators = {
  // For services endpoint
  services: (req) => `services:${JSON.stringify(req.query)}`,
  
  // For user profile
  user: (req) => `user:${req.params.id}`,
  
  // For conversation list
  conversations: (req) => `conversations:${req.user._id}`,
  
  // For specific booking
  booking: (req) => `booking:${req.params.id}`,
  
  // For categories
  categories: (req) => `categories:${JSON.stringify(req.query)}`,
  
  // For reviews
  reviews: (req) => `reviews:${req.params.id}`,
};

module.exports = {
  cacheResponse,
  cacheKeyGenerators
};