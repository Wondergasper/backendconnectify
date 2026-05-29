const express = require('express');
const { body } = require('express-validator');
const { auth, requireProvider } = require('../middleware/auth');
const { onboard, getMyProfile, updateMyProfile } = require('../controllers/providerController');

const router = express.Router();

/**
 * POST /api/providers/onboard
 * Register a provider profile (individual or company).
 */
router.post(
  '/onboard',
  auth,
  requireProvider,
  [
    body('providerType')
      .optional()
      .isIn(['individual', 'company'])
      .withMessage('providerType must be individual or company'),
    body('displayName').optional().notEmpty().withMessage('displayName cannot be empty'),
    body('businessName').optional().notEmpty().withMessage('businessName cannot be empty'),
    body('contactPersonName').optional().notEmpty().withMessage('contactPersonName cannot be empty'),
    body('phone').optional().notEmpty(),
    body('email').optional().isEmail().withMessage('Invalid email address')
  ],
  onboard
);

/**
 * GET /api/providers/me
 */
router.get('/me', auth, requireProvider, getMyProfile);

/**
 * PATCH /api/providers/me
 */
router.patch(
  '/me',
  auth,
  requireProvider,
  [
    body('displayName').optional().notEmpty(),
    body('phone').optional().notEmpty(),
    body('email').optional().isEmail().withMessage('Invalid email address')
  ],
  updateMyProfile
);

module.exports = router;
