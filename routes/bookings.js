const express = require('express');
const {
  createBooking,
  getUserBookings,
  getBookingById,
  updateBookingStatus,
  addRating
} = require('../controllers/bookingController');
const { auth } = require('../middleware/auth');
const bookingReminderService = require('../services/bookingReminderService');

const router = express.Router();

// @route   POST api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', auth, createBooking);

// @route   GET api/bookings
// @desc    Get user bookings
// @access  Private
router.get('/', auth, getUserBookings);

// @route   GET api/bookings/:id
// @desc    Get booking by ID
// @access  Private
router.get('/:id', auth, getBookingById);

// @route   PUT api/bookings/:id
// @desc    Update booking status
// @access  Private
router.put('/:id', auth, updateBookingStatus);

// @route   POST api/bookings/:id/rating
// @desc    Add rating to booking
// @access  Private
router.post('/:id/rating', auth, addRating);

// @route   POST api/bookings/reminders/trigger
// @desc    Manually trigger booking reminder emails (for testing/admin)
// @access  Private (should be admin only in production)
router.post('/reminders/trigger', auth, async (req, res) => {
  try {
    const result = await bookingReminderService.triggerReminders();
    res.json({
      success: true,
      message: 'Booking reminders processed',
      ...result
    });
  } catch (error) {
    console.error('Error triggering reminders:', error);
    res.status(500).json({ error: 'Failed to trigger reminders' });
  }
});

module.exports = router;