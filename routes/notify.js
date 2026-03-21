// routes/notify.js
const express = require('express');
const router = express.Router();
const notifyController = require('../controllers/notifyController');
const { auth } = require('../middleware/auth');  // Fixed: was 'authenticate', should be 'auth'

/**
 * @route   POST /api/notify
 * @desc    Send multi-channel notification
 * @access  Private
 * @body    {
 *   email: string,
 *   phone: string,
 *   userId: string,
 *   fcmToken: string,
 *   title: string,
 *   message: string,
 *   subject: string,
 *   html: string,
 *   channels: ['email', 'sms', 'inapp'],
 *   template: string,
 *   templateData: object,
 *   data: object
 * }
 */
router.post('/', auth, notifyController.sendNotification);

/**
 * @route   POST /api/notify/otp
 * @desc    Send OTP via email
 * @access  Private
 * @body    { phone: string, otp: string, expiryMinutes: number }
 */
router.post('/otp', auth, notifyController.sendOTP);

/**
 * @route   POST /api/notify/booking
 * @desc    Send booking notification
 * @access  Private
 * @body    {
 *   email: string,
 *   phone: string,
 *   userId: string,
 *   fcmToken: string,
 *   bookingDetails: object,
 *   status: string,
 *   channels: ['email', 'sms', 'inapp']
 * }
 */
router.post('/booking', auth, notifyController.sendBookingNotification);

module.exports = router;
