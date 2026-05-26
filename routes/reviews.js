const express = require('express');
const { 
  createReview,
  getServiceReviews,
  getProviderReviews,
  getUserReviews,
  getReviewById,
  getAllReviews,
  deleteReview
} = require('../controllers/reviewController');
const { auth, checkRole } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/reviews
// @desc    Create a review for a booking
// @access  Private
router.post('/', auth, createReview);

// @route   GET api/reviews
// @desc    Get all reviews for admin moderation
// @access  Private/Admin
router.get('/', auth, checkRole(['admin']), getAllReviews);

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

// @route   DELETE api/reviews/:id
// @desc    Delete a review for moderation
// @access  Private/Admin
router.delete('/:id', auth, checkRole(['admin']), deleteReview);

module.exports = router;
