const express = require('express');
const { getStats } = require('../controllers/analyticsController');
const { auth, checkRole } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/analytics/stats
// @desc    Get dashboard statistics
// @access  Private (Admin only)
router.get('/stats', auth, checkRole(['admin']), getStats);

module.exports = router;