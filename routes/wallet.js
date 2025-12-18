const express = require('express');
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
router.get('/transactions', auth, getTransactionHistory);

// @route   POST api/wallet/process-payment
// @desc    Process payment for booking
// @access  Private
router.post('/process-payment', auth, processBookingPayment);

// @route   POST api/wallet/add-funds
// @desc    Add funds to wallet
// @access  Private
router.post('/add-funds', auth, addFunds);

module.exports = router;