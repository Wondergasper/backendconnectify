const express = require('express');
const { 
  createBooking,
  getUserBookings,
  getBookingById,
  updateBookingStatus,
  addRating
} = require('../controllers/bookingController');
const { auth } = require('../middleware/auth');

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

module.exports = router;