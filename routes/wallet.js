// routes/wallet.js
const express = require('express');
const { body, query } = require('express-validator');
const {
  getWalletBalance,
  getTransactionHistory,
  processBookingPayment,
  addFunds,
  initializePayment,
  verifyPayment,
  withdrawFunds,
  listBanks,
  resolveAccount,
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
router.get(
  '/transactions',
  auth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('type').optional().isIn(['credit', 'debit']).withMessage('Type must be credit or debit'),
  ],
  getTransactionHistory
);

// @route   GET api/wallet/banks
// @desc    List Nigerian banks (for withdrawal form)
// @access  Private
router.get('/banks', auth, listBanks);

// @route   POST api/wallet/initialize-payment
// @desc    Initialize Paystack transaction to add funds
// @access  Private
router.post(
  '/initialize-payment',
  auth,
  [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isFloat({ min: 100, max: 10_000_000 }).withMessage('Amount must be between ₦100 and ₦10,000,000'),
  ],
  initializePayment
);

// @route   POST api/wallet/verify-payment
// @desc    Verify Paystack transaction and credit wallet
// @access  Private
router.post(
  '/verify-payment',
  auth,
  [
    body('reference').notEmpty().withMessage('Transaction reference is required'),
  ],
  verifyPayment
);

// @route   POST api/wallet/resolve-account
// @desc    Verify bank account number before withdrawal
// @access  Private
router.post(
  '/resolve-account',
  auth,
  [
    body('accountNumber').notEmpty().withMessage('Account number is required').isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits'),
    body('bankCode').notEmpty().withMessage('Bank code is required'),
  ],
  resolveAccount
);

// @route   POST api/wallet/withdraw
// @desc    Withdraw funds to Nigerian bank account via Paystack Transfer
// @access  Private
router.post(
  '/withdraw',
  auth,
  [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isFloat({ min: 100 }).withMessage('Minimum withdrawal is ₦100'),
    body('accountNumber')
      .notEmpty().withMessage('Account number is required')
      .isLength({ min: 10, max: 10 }).withMessage('Account number must be 10 digits'),
    body('bankCode').notEmpty().withMessage('Bank code is required'),
    body('accountName').notEmpty().withMessage('Account name is required').trim(),
  ],
  withdrawFunds
);

// @route   POST api/wallet/process-payment
// @desc    Process booking payment from wallet balance
// @access  Private
router.post(
  '/process-payment',
  auth,
  [
    body('bookingId')
      .notEmpty().withMessage('Booking ID is required')
      .isMongoId().withMessage('Invalid booking ID format'),
  ],
  processBookingPayment
);

// @route   POST api/wallet/add-funds  (legacy fallback — dev/test mode only)
// @desc    Add funds without Paystack (only works if PAYSTACK_SECRET_KEY is not set)
// @access  Private
router.post(
  '/add-funds',
  auth,
  [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isFloat({ min: 100, max: 10_000_000 }).withMessage('Amount must be between ₦100 and ₦10,000,000'),
  ],
  addFunds
);

module.exports = router;