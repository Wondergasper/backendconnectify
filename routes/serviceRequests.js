const express = require('express');
const { body } = require('express-validator');
const { auth, requireAnyProvider } = require('../middleware/auth');
const { listRequests, getRequest, acceptRequest, rejectRequest } = require('../controllers/serviceRequestController');
const { createQuote, listMyQuotes, acceptQuote, rejectQuote } = require('../controllers/jobQuoteController');

const router = express.Router();

// All routes require authentication + any provider profile
router.use(auth, requireAnyProvider);

// ── Service Requests ──────────────────────────────────────────

/**
 * GET /api/provider/requests
 */
router.get('/requests', listRequests);

/**
 * GET /api/provider/requests/:id
 */
router.get('/requests/:id', getRequest);

/**
 * PATCH /api/provider/requests/:id/accept
 */
router.patch('/requests/:id/accept', acceptRequest);

/**
 * PATCH /api/provider/requests/:id/reject
 */
router.patch('/requests/:id/reject', rejectRequest);

// ── Quotes ───────────────────────────────────────────────────

/**
 * POST /api/requests/:id/quotes
 * Note: uses /requests prefix to match spec exactly
 */
router.post(
  '/requests/:id/quotes',
  [
    body('quotedAmount', 'quotedAmount is required and must be a number').isNumeric(),
    body('estimatedDeliveryTime').optional().notEmpty(),
    body('message').optional().isLength({ max: 1000 })
  ],
  createQuote
);

/**
 * GET /api/provider/quotes
 */
router.get('/quotes', listMyQuotes);

module.exports = router;
