// utils/tokenUtils.js
// Centralised JWT + refresh‑token helpers.
// Import from here in both authController.js and middleware/auth.js
// to avoid divergence bugs.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate a short-lived access token (15 minutes).
 * @param {string} userId
 * @returns {string} signed JWT
 */
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '15m'
  });
};

/**
 * Generate a long-lived refresh token (7 days) plus its SHA-256 hash.
 * Store the hash in the database; send the raw token in the httpOnly cookie.
 * @param {string} userId
 * @returns {{ refreshToken: string, refreshTokenHash: string }}
 */
const generateRefreshToken = (userId) => {
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });

  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  return { refreshToken, refreshTokenHash };
};

/**
 * Hash an existing refresh token for comparison against the stored hash.
 * @param {string} refreshToken
 * @returns {string} SHA-256 hex digest
 */
const hashRefreshToken = (refreshToken) => {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
};

module.exports = { generateAccessToken, generateRefreshToken, hashRefreshToken };
