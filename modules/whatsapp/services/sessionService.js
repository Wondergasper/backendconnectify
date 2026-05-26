const { createClient } = require('redis');

// --- Redis Client Setup ---
let redisClient = null;
let redisConnected = false;

// Graceful in-memory fallback for when Redis is not available (local dev without Redis)
const memoryStore = {};

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours
const KEY_PREFIX = 'connectify:session:';

async function getRedisClient() {
  if (redisClient && redisConnected) return redisClient;

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: {
        reconnectStrategy: false
      }
    });

    redisClient.on('error', (err) => {
      if (redisConnected) {
        console.warn('[SessionService] Redis connection error, falling back to memory store:', err.message);
      }
      redisConnected = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('[SessionService] Reconnecting to Redis...');
    });

    redisClient.on('ready', () => {
      console.log('[SessionService] Connected to Redis.');
      redisConnected = true;
    });

    await redisClient.connect();
    redisConnected = true;
    return redisClient;
  } catch (err) {
    console.warn('[SessionService] Redis unavailable, using in-memory fallback:', err.message);
    redisConnected = false;
    return null;
  }
}

/**
 * Default blank session structure
 */
function defaultSession() {
  return {
    step: 'init',
    service: null,
    location: null,
    date: null,
    isConfirmed: false,
    matchedProviders: [],
  };
}

/**
 * Retrieve a session for a given phone number.
 * Creates a new default session if none exists.
 */
exports.getSession = async (phoneNumber) => {
  const key = KEY_PREFIX + phoneNumber;
  const client = await getRedisClient();

  if (client && redisConnected) {
    try {
      const data = await client.get(key);
      if (data) return JSON.parse(data);
      // First time: create and store default session
      const fresh = defaultSession();
      await client.setEx(key, SESSION_TTL_SECONDS, JSON.stringify(fresh));
      return fresh;
    } catch (err) {
      console.error('[SessionService] Redis GET error:', err.message);
    }
  }

  // In-memory fallback
  if (!memoryStore[phoneNumber]) {
    memoryStore[phoneNumber] = defaultSession();
  }
  return memoryStore[phoneNumber];
};

/**
 * Update (merge) session data for a given phone number.
 * Resets the TTL on every update.
 */
exports.updateSession = async (phoneNumber, updates) => {
  const key = KEY_PREFIX + phoneNumber;
  const client = await getRedisClient();

  if (client && redisConnected) {
    try {
      const existing = await exports.getSession(phoneNumber);
      const merged = { ...existing, ...updates };
      await client.setEx(key, SESSION_TTL_SECONDS, JSON.stringify(merged));
      return merged;
    } catch (err) {
      console.error('[SessionService] Redis SET error:', err.message);
    }
  }

  // In-memory fallback
  if (!memoryStore[phoneNumber]) {
    memoryStore[phoneNumber] = defaultSession();
  }
  memoryStore[phoneNumber] = { ...memoryStore[phoneNumber], ...updates };
  return memoryStore[phoneNumber];
};

/**
 * Delete a user's session (e.g., after booking completion or explicit reset).
 */
exports.clearSession = async (phoneNumber) => {
  const key = KEY_PREFIX + phoneNumber;
  const client = await getRedisClient();

  if (client && redisConnected) {
    try {
      await client.del(key);
      return;
    } catch (err) {
      console.error('[SessionService] Redis DEL error:', err.message);
    }
  }

  delete memoryStore[phoneNumber];
};
