const express = require('express');
const { body } = require('express-validator');
const { auth, requireCompanyProvider } = require('../middleware/auth');
const { getDashboard, updateProfile, getVerificationStatus } = require('../controllers/companyController');
const { addMember, listMembers, updateMember, removeMember } = require('../controllers/teamMemberController');
const { assignJob, updateJobStatus } = require('../controllers/jobAssignmentController');

const router = express.Router();

// All company routes require auth + company provider
router.use(auth, requireCompanyProvider);

/**
 * GET /api/company/dashboard
 */
router.get('/dashboard', getDashboard);

/**
 * PATCH /api/company/profile
 */
router.patch(
  '/profile',
  [
    body('displayName').optional().notEmpty(),
    body('businessName').optional().notEmpty(),
    body('contactPersonName').optional().notEmpty(),
    body('phone').optional().notEmpty(),
    body('email').optional().isEmail().withMessage('Invalid email address'),
    body('operatingLocations').optional().isArray().withMessage('operatingLocations must be an array')
  ],
  updateProfile
);

/**
 * GET /api/company/verification-status
 */
router.get('/verification-status', getVerificationStatus);

// ── Team Members ─────────────────────────────────────────────

/**
 * POST /api/company/team
 */
router.post(
  '/team',
  [
    body('fullName', 'Full name is required').notEmpty(),
    body('role', 'Role is required').notEmpty(),
    body('phone', 'Phone is required').notEmpty(),
    body('email').optional().isEmail().withMessage('Invalid email address'),
    body('status').optional().isIn(['active', 'inactive'])
  ],
  addMember
);

/**
 * GET /api/company/team
 */
router.get('/team', listMembers);

/**
 * PATCH /api/company/team/:id
 */
router.patch(
  '/team/:id',
  [
    body('fullName').optional().notEmpty(),
    body('role').optional().notEmpty(),
    body('phone').optional().notEmpty(),
    body('email').optional().isEmail(),
    body('status').optional().isIn(['active', 'inactive'])
  ],
  updateMember
);

/**
 * DELETE /api/company/team/:id
 */
router.delete('/team/:id', removeMember);

// ── Job Management ────────────────────────────────────────────

/**
 * PATCH /api/company/jobs/:id/assign
 */
router.patch(
  '/jobs/:id/assign',
  [body('teamMemberId', 'teamMemberId is required').notEmpty()],
  assignJob
);

/**
 * PATCH /api/company/jobs/:id/status
 */
router.patch(
  '/jobs/:id/status',
  [body('status', 'status is required').notEmpty()],
  updateJobStatus
);

module.exports = router;
