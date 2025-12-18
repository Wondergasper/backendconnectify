const express = require('express');
const { 
  createReview,
  getServiceReviews,
  getProviderReviews,
  getUserReviews,
  getReviewById
} = require('../controllers/reviewController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/reviews
// @desc    Create a review for a booking
// @access  Private
router.post('/', auth, createReview);

// @route   GET api/reviews/service/:serviceId
// @desc    Get reviews for a service
// @access  Public
router.get('/service/:serviceId', getServiceReviews);

// @route   GET api/reviews/provider/:providerId
// @desc    Get reviews for a provider
// @access  Public
router.get('/provider/:providerId', getProviderReviews);

// @route   GET api/reviews/user
// @desc    Get reviews by current user
// @access  Private
router.get('/user', auth, getUserReviews);

// @route   GET api/reviews/:id
// @desc    Get a specific review
// @access  Public
router.get('/:id', getReviewById);

module.exports = router;