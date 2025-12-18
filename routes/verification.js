const express = require('express');
const { 
  submitVerification, 
  getVerificationStatus, 
  getAllVerifications, 
  approveVerification, 
  rejectVerification,
  getVerificationById
} = require('../controllers/verificationController');
const { auth, checkRole } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/verification
// @desc    Submit verification documents
// @access  Private
router.post('/', auth, submitVerification);

// @route   GET api/verification/status
// @desc    Get current user's verification status
// @access  Private
router.get('/status', auth, getVerificationStatus);

// @route   GET api/verification/:userId
// @desc    Get specific user's verification status
// @access  Private
router.get('/:userId', auth, getVerificationStatus);

// @route   GET api/verification/request/:id
// @desc    Get verification request by ID
// @access  Private
router.get('/request/:id', auth, getVerificationById);

// @route   GET api/verification/requests
// @desc    Get all verification requests (admin only)
// @access  Private (Admin only)
router.get('/requests', auth, checkRole(['admin']), getAllVerifications);

// @route   PUT api/verification/:id/approve
// @desc    Approve verification request (admin only)
// @access  Private (Admin only)
router.put('/:id/approve', auth, checkRole(['admin']), approveVerification);

// @route   PUT api/verification/:id/reject
// @desc    Reject verification request (admin only)
// @access  Private (Admin only)
router.put('/:id/reject', auth, checkRole(['admin']), rejectVerification);

module.exports = router;