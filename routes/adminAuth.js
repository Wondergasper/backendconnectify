const express = require('express');
const { body } = require('express-validator');
const { login, logout, verifySession } = require('../controllers/adminAuthController');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// @route   POST api/admin/auth/login
// @desc    Admin login
// @access  Public
router.post('/login', [
  body('email', 'Valid email is required').isEmail(),
  body('password', 'Password is required').notEmpty()
], login);

// @route   POST api/admin/auth/logout
// @desc    Admin logout
// @access  Private
router.post('/logout', adminAuth, logout);

// @route   GET api/admin/auth/session
// @desc    Verify admin session
// @access  Private
router.get('/session', adminAuth, verifySession);

module.exports = router;