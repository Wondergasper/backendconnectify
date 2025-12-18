// services/redisService.js
const redisClient = require('../config/redis');

class RedisService {
  constructor() {
    this.client = null;
  }

  async init() {
    this.client = await redisClient.connect();
    return this.client;
  }

  // Get Redis client
  getClient() {
    if (!this.client) {
      throw new Error('Redis service not initialized');
    }
    return this.client;
  }

  // Cache user data
  async cacheUserData(userId, userData, ttl = 3600) { // 1 hour default
    try {
      const key = `user:${userId}`;
      await this.client.setEx(key, ttl, JSON.stringify(userData));
      return true;
    } catch (error) {
      console.error('Error caching user data:', error);
      return false;
    }
  }

  // Get cached user data
  async getCachedUserData(userId) {
    try {
      const key = `user:${userId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached user data:', error);
      return null;
    }
  }

  // Cache services data
  async cacheServices(searchParams, servicesData, ttl = 300) { // 5 minutes default
    try {
      const key = `services:${JSON.stringify(searchParams)}`;
      await this.client.setEx(key, ttl, JSON.stringify(servicesData));
      return true;
    } catch (error) {
      console.error('Error caching services data:', error);
      return false;
    }
  }

  // Get cached services data
  async getCachedServices(searchParams) {
    try {
      const key = `services:${JSON.stringify(searchParams)}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached services data:', error);
      return null;
    }
  }

  // Cache user conversations
  async cacheConversations(userId, conversations, ttl = 300) { // 5 minutes
    try {
      const key = `conversations:${userId}`;
      await this.client.setEx(key, ttl, JSON.stringify(conversations));
      return true;
    } catch (error) {
      console.error('Error caching conversations:', error);
      return false;
    }
  }

  // Get cached conversations
  async getCachedConversations(userId) {
    try {
      const key = `conversations:${userId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached conversations:', error);
      return null;
    }
  }

  // Cache booking data
  async cacheBooking(bookingId, bookingData, ttl = 1800) { // 30 minutes
    try {
      const key = `booking:${bookingId}`;
      await this.client.setEx(key, ttl, JSON.stringify(bookingData));
      return true;
    } catch (error) {
      console.error('Error caching booking data:', error);
      return false;
    }
  }

  // Get cached booking data
  async getCachedBooking(bookingId) {
    try {
      const key = `booking:${bookingId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached booking data:', error);
      return null;
    }
  }

  // Set session data
  async setSession(sessionId, data, ttl = 86400) { // 24 hours default
    try {
      const key = `session:${sessionId}`;
      await this.client.setEx(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error setting session:', error);
      return false;
    }
  }

  // Get session data
  async getSession(sessionId) {
    try {
      const key = `session:${sessionId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  // Delete cached data
  async deleteCache(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Error deleting cache:', error);
      return false;
    }
  }

  // Delete user-specific caches
  async invalidateUserCache(userId) {
    try {
      // Delete user profile cache
      await this.deleteCache(`user:${userId}`);
      // Delete user conversations cache
      await this.deleteCache(`conversations:${userId}`);
      return true;
    } catch (error) {
      console.error('Error invalidating user cache:', error);
      return false;
    }
  }

  // Get cache keys by pattern
  async getKeys(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      return keys;
    } catch (error) {
      console.error('Error getting cache keys:', error);
      return [];
    }
  }

  // Clear all cache
  async clearAllCache() {
    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }
}

module.exports = new RedisService();