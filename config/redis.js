// config/redis.js
const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis server connection refused');
            return new Error('Could not connect to Redis server');
          }
          
          if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands
            return new Error('Retry time exhausted');
          }
          
          if (options.attempt > 10) {
            // End reconnecting with built in error
            return undefined;
          }
          
          // Reconnect after 1 second
          return Math.min(options.attempt * 100, 3000);
        },
        connect_timeout: 30000,
        family: 4, // 4 (IPv4) or 6 (IPv6)
        socket_keepalive: true,
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis Client Reconnecting...');
        this.isConnected = false;
      });

      await this.client.connect();
      console.log('Redis connection established successfully');
      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  // Get client instance
  getClient() {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  // Check connection status
  isReady() {
    return this.isConnected && this.client && this.client.isReady;
  }

  // Test connection
  async testConnection() {
    try {
      const pingResult = await this.client.ping();
      return pingResult === 'PONG';
    } catch (error) {
      console.error('Redis ping test failed:', error);
      return false;
    }
  }

  // Close connection
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis connection closed');
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;