const express = require('express');
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
const { listCompanyProviders, approve, reject } = require('../controllers/adminCompanyController');
const { acceptQuote, rejectQuote } = require('../controllers/jobQuoteController');

const router = express.Router();

// Admin guard applied to all routes
router.use(auth, checkRole(['admin']));

/**
 * GET /api/admin/company-providers
 * List all company provider profiles with optional filters.
 */
router.get('/company-providers', listCompanyProviders);

/**
 * PATCH /api/admin/company-providers/:id/approve
 */
router.patch('/company-providers/:id/approve', approve);

/**
 * PATCH /api/admin/company-providers/:id/reject
 */
router.patch(
  '/company-providers/:id/reject',
  [body('reason').optional().notEmpty()],
  reject
);

/**
 * PATCH /api/quotes/:id/accept  (admin can also accept quotes)
 */
router.patch('/quotes/:id/accept', acceptQuote);

/**
 * PATCH /api/quotes/:id/reject  (admin can also reject quotes)
 */
router.patch('/quotes/:id/reject', rejectQuote);

module.exports = router;
