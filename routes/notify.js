// routes/notify.js
// ⚠️  INTERNAL USE ONLY — these routes trigger real emails/SMS/push notifications.
//     All routes require admin role to prevent abuse.
const express = require('express');
const router = express.Router();
const notifyController = require('../controllers/notifyController');
const { auth, checkRole } = require('../middleware/auth');

// All notify routes are restricted to admin role
const adminOnly = [auth, checkRole(['admin'])];

/**
 * @route   POST /api/notify
 * @desc    Send multi-channel notification (email, SMS, in-app, push)
 * @access  Private — Admin only
 */
router.post('/', ...adminOnly, notifyController.sendNotification);

/**
 * @route   POST /api/notify/otp
 * @desc    Send OTP via email
 * @access  Private — Admin only
 */
router.post('/otp', ...adminOnly, notifyController.sendOTP);

/**
 * @route   POST /api/notify/booking
 * @desc    Send booking-specific notification
 * @access  Private — Admin only
 */
router.post('/booking', ...adminOnly, notifyController.sendBookingNotification);

module.exports = router;
