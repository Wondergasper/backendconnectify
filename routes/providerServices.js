const express = require('express');
const { body } = require('express-validator');
const { auth, requireAnyProvider } = require('../middleware/auth');
const { create, list, update, remove } = require('../controllers/providerServiceController');

const router = express.Router();

// All provider-service routes require auth + any provider
router.use(auth, requireAnyProvider);

/**
 * POST /api/provider-services
 */
router.post(
  '/',
  [
    body('serviceName', 'Service name is required').notEmpty(),
    body('category', 'Category is required').notEmpty(),
    body('priceType').optional().isIn(['fixed', 'negotiable', 'quote']).withMessage('Invalid priceType'),
    body('startingPrice').optional().isNumeric().withMessage('startingPrice must be a number'),
    body('isAvailable').optional().isBoolean()
  ],
  create
);

/**
 * GET /api/provider-services
 */
router.get('/', list);

/**
 * PATCH /api/provider-services/:id
 */
router.patch(
  '/:id',
  [
    body('serviceName').optional().notEmpty(),
    body('category').optional().notEmpty(),
    body('priceType').optional().isIn(['fixed', 'negotiable', 'quote']),
    body('startingPrice').optional().isNumeric(),
    body('isAvailable').optional().isBoolean()
  ],
  update
);

/**
 * DELETE /api/provider-services/:id
 */
router.delete('/:id', remove);

module.exports = router;
