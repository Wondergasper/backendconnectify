const express = require('express');
const { auth } = require('../middleware/auth');
const { acceptQuote, rejectQuote } = require('../controllers/jobQuoteController');

const router = express.Router();

/**
 * PATCH /api/quotes/:id/accept
 * Accept a job quote (customer or admin action).
 */
router.patch('/:id/accept', auth, acceptQuote);

/**
 * PATCH /api/quotes/:id/reject
 * Reject a job quote (customer or admin action).
 */
router.patch('/:id/reject', auth, rejectQuote);

module.exports = router;
