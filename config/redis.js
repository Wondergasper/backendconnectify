// config/redis.js
const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Build Redis configuration from environment variables
   * Supports both URL-based and traditional host/port configuration
   */
  getRedisConfig() {
    // Priority 1: Use REDIS_URL if provided (modern, cloud-ready)
    if (process.env.REDIS_URL) {
      console.log('📡 Using REDIS_URL for connection');
      
      const config = {
        url: process.env.REDIS_URL,
      };

      // Add TLS configuration for secure connections (rediss://)
      if (process.env.REDIS_URL.startsWith('rediss://')) {
        config.socket = {
          tls: true,
          rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
        };
      }

      return config;
    }

    // Priority 2: Fall back to traditional host/port/password
    console.log('📡 Using REDIS_HOST/PORT for connection');
    
    const config = {
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    };

    // Add password if provided
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    // Add username if provided (Redis 6+)
    if (process.env.REDIS_USERNAME) {
      config.username = process.env.REDIS_USERNAME;
    }

    return config;
  }

  async connect() {
    try {
      const config = this.getRedisConfig();

      // Add common configuration options
      const clientConfig = {
        ...config,
        socket: {
          ...config.socket,
          // Connection timeout
          connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '30000', 10),
          // Keep the connection alive
          keepAlive: true,
          // Reconnection strategy
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Redis: Max reconnection attempts reached');
              return false; // Stop reconnecting
            }
            
            const delay = Math.min(retries * 100, 3000);
            console.log(`🔄 Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
        },
        // Database number (default: 0)
        database: parseInt(process.env.REDIS_DB || '0', 10),
      };

      // Create Redis client
      this.client = redis.createClient(clientConfig);

      // Event handlers
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔌 Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('✅ Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis Client Reconnecting...');
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('🔌 Redis Client Disconnected');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();
      console.log('✅ Redis connection established successfully');
      
      return this.client;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
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
      console.error('❌ Redis ping test failed:', error.message);
      return false;
    }
  }

  // Get connection info
  getConnectionInfo() {
    if (!this.client) {
      return null;
    }

    return {
      isConnected: this.isConnected,
      isReady: this.client.isReady,
      // Safe connection info (no passwords)
      config: process.env.REDIS_URL 
        ? { type: 'URL', url: process.env.REDIS_URL.replace(/:[^:@]+@/, ':****@') }
        : { 
            type: 'HOST/PORT', 
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: process.env.REDIS_PORT || 6379,
            hasPassword: !!process.env.REDIS_PASSWORD,
          },
    };
  }

  // Close connection
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
        console.log('✅ Redis connection closed gracefully');
      } catch (error) {
        console.error('❌ Error closing Redis connection:', error.message);
        // Force disconnect
        await this.client.disconnect();
      }
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;