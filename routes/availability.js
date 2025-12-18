const express = require('express');
const { 
  getAvailability, 
  getAvailabilityRange, 
  updateAvailability, 
  bookSlot, 
  unbookSlot 
} = require('../controllers/availabilityController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/availability
// @desc    Get provider availability for a date
// @access  Public
router.get('/', getAvailability);

// @route   GET api/availability/range
// @desc    Get provider availability for a date range
// @access  Public
router.get('/range', getAvailabilityRange);

// @route   PUT api/availability
// @desc    Update provider availability
// @access  Private (Provider only)
router.put('/', auth, updateAvailability);

// @route   PUT api/availability/book-slot
// @desc    Mark a time slot as booked
// @access  Private (Provider only)
router.put('/book-slot', auth, bookSlot);

// @route   PUT api/availability/unbook-slot
// @desc    Mark a time slot as unbooked
// @access  Private (Provider only)
router.put('/unbook-slot', auth, unbookSlot);

module.exports = router;