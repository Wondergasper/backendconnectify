const express = require('express');
const { 
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', auth, getNotifications);

// @route   PUT api/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private
router.put('/:notificationId/read', auth, markAsRead);

// @route   PUT api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', auth, markAllAsRead);

// @route   DELETE api/notifications/:notificationId
// @desc    Delete notification
// @access  Private
router.delete('/:notificationId', auth, deleteNotification);

module.exports = router;