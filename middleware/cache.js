const NodeCache = require('node-cache');

// Create a cache instance
const cache = new NodeCache({ stdTTL: 600 }); // Default TTL of 10 minutes

// Middleware to cache responses for GET requests
const cacheMiddleware = (duration = 600) => {
  return (req, res, next) => {
    if (req.method !== 'GET') {
      return next(); // Skip caching for non-GET requests
    }

    const key = '__cache__' + req.originalUrl || req.url;
    const cachedData = cache.get(key);

    if (cachedData) {
      // Send cached data if it exists
      res.json(cachedData);
      return;
    }

    // Override res.json to capture the response data
    const originalJson = res.json;
    res.json = function(data) {
      // Cache the response data
      cache.set(key, data, duration);
      // Send the response
      originalJson.call(this, data);
    };

    next();
  };
};

// Function to clear specific cache
const clearCache = (key) => {
  const cacheKey = '__cache__' + key;
  cache.del(cacheKey);
};

// Function to clear all cache
const clearAllCache = () => {
  cache.flushAll();
};

// Function to get cache stats
const getCacheStats = () => {
  return cache.getStats();
};

module.exports = {
  cacheMiddleware,
  clearCache,
  clearAllCache,
  getCacheStats
};