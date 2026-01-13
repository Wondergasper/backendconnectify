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
 * @route   GET /api/notify/user/:userId
 * @desc    Get user notifications
 * @access  Private
 * @query   limit (default: 50), unreadOnly (default: false)
 */
router.get('/user/:userId', auth, notifyController.getUserNotifications);

/**
 * @route   PUT /api/notify/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:notificationId/read', auth, notifyController.markAsRead);

/**
 * @route   PUT /api/notify/user/:userId/read-all
 * @desc    Mark all user notifications as read
 * @access  Private
 */
router.put('/user/:userId/read-all', auth, notifyController.markAllAsRead);

/**
 * @route   DELETE /api/notify/:notificationId
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/:notificationId', auth, notifyController.deleteNotification);

/**
 * @route   POST /api/notify/otp
 * @desc    Send OTP via SMS
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
