const express = require('express');
const {
  generateReceipt,
  getReceiptAsPDF,
  getReceiptDetails
} = require('../controllers/receiptController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/receipts/:id
// @desc    Get booking receipt (general receipt data)
// @access  Private
router.get('/:id', auth, generateReceipt);

// @route   GET api/receipts/:id/generate
// @desc    Generate booking receipt (alternative endpoint for receipt data)
// @access  Private
router.get('/:id/generate', auth, generateReceipt);

// @route   GET api/receipts/:id/details
// @desc    Get booking receipt details
// @access  Private
router.get('/:id/details', auth, getReceiptDetails);

// @route   GET api/receipts/:id/pdf
// @desc    Get booking receipt as PDF
// @access  Private
router.get('/:id/pdf', auth, getReceiptAsPDF);

module.exports = router;