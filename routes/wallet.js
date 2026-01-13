const express = require('express');
const { body, query } = require('express-validator');
const {
  getWalletBalance,
  getTransactionHistory,
  processBookingPayment,
  addFunds
} = require('../controllers/walletController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/wallet/balance
// @desc    Get user wallet balance
// @access  Private
router.get('/balance', auth, getWalletBalance);

// @route   GET api/wallet/transactions
// @desc    Get wallet transaction history
// @access  Private
router.get('/transactions',
  auth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('type').optional().isIn(['credit', 'debit']).withMessage('Type must be credit or debit')
  ],
  getTransactionHistory
);

// @route   POST api/wallet/process-payment
// @desc    Process payment for booking
// @access  Private
router.post('/process-payment',
  auth,
  [
    body('bookingId')
      .notEmpty().withMessage('Booking ID is required')
      .isMongoId().withMessage('Invalid booking ID format')
  ],
  processBookingPayment
);

// @route   POST api/wallet/add-funds
// @desc    Add funds to wallet
// @access  Private
router.post('/add-funds',
  auth,
  [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isFloat({ min: 100, max: 10000000 }).withMessage('Amount must be between ₦100 and ₦10,000,000')
      .custom((value) => {
        if (value <= 0) {
          throw new Error('Amount must be greater than 0');
        }
        return true;
      })
  ],
  addFunds
);

module.exports = router;