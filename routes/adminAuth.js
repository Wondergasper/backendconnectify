const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { login, logout, verifySession, refreshToken } = require('../controllers/adminAuthController');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// Shared rate limiter for auth endpoints that are public but sensitive
const adminRefreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many admin token refresh attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST api/admin/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', [
  body('email', 'Valid email is required').isEmail(),
  body('password', 'Password is required').notEmpty()
], login);

// @route   POST api/admin/auth/refresh
// @desc    Rotate adminAccessToken using adminRefreshToken cookie
// @access  Public (cookie-based auth)
router.post('/refresh', adminRefreshRateLimit, [
  body().custom((value, { req }) => {
    if (!req.cookies || !req.cookies.adminRefreshToken) {
      throw new Error('Admin refresh token cookie is required');
    }
    return true;
  }),
], refreshToken);

// @route   POST api/admin/auth/logout
// @desc    Admin logout
// @access  Private
router.post('/logout', adminAuth, logout);

// @route   GET api/admin/auth/session
// @desc    Verify admin session
// @access  Private
router.get('/session', adminAuth, verifySession);

module.exports = router;