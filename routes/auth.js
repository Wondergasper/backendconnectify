const express = require('express');
const { body } = require('express-validator');
const { register, login, getProfile, updateProfile, refreshToken, logout, forgotPassword, resetPassword } = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', [
  body('name', 'Name is required').not().isEmpty(),
  body('email', 'Please include a valid email').isEmail(),
  body('phone', 'Phone number is required').not().isEmpty(),
  body('password', 'Password must be at least 6 characters').isLength({ min: 6 })
], register);

// @route   POST api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('password', 'Password is required').exists(),
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error('Either email or phone must be provided');
    }
    if (req.body.email && req.body.phone) {
      throw new Error('Provide either email or phone, not both');
    }
    if (req.body.email && !req.body.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Please provide a valid email address');
    }
    if (req.body.phone && !req.body.phone.trim()) {
      throw new Error('Phone number cannot be empty');
    }
    return true;
  })
], login);

// @route   POST api/auth/refresh
// @desc    Refresh access token
// @access  Public (uses refresh token from cookies)
router.post('/refresh', refreshToken);

// @route   POST api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, logout);

// @route   POST api/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', forgotPassword);

// @route   PUT api/auth/reset-password/:resetToken
// @desc    Reset password
// @access  Public
router.put('/reset-password/:resetToken', resetPassword);

// @route   GET api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, getProfile);

// @route   PUT api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, updateProfile);

module.exports = router;