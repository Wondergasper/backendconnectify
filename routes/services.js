const express = require('express');
const {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  searchServices
} = require('../controllers/serviceController');
const { auth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

const router = express.Router();

// @route   POST api/services
// @desc    Create a new service
// @access  Private (Provider only)
router.post('/', auth, createService);

// @route   GET api/services
// @desc    Get all services with filtering
// @access  Public
router.get('/', cacheMiddleware(900), getServices); // Cache for 15 minutes

// @route   GET api/services/search
// @desc    Search services with advanced filters
// @access  Public
router.get('/search', cacheMiddleware(300), searchServices); // Cache for 5 minutes

// @route   GET api/services/:id
// @desc    Get service by ID
// @access  Public
router.get('/:id', cacheMiddleware(1800), getServiceById); // Cache for 30 minutes

// @route   PUT api/services/:id
// @desc    Update service
// @access  Private (Provider only)
router.put('/:id', auth, updateService);

// @route   DELETE api/services/:id
// @desc    Delete service
// @access  Private (Provider only)
router.delete('/:id', auth, deleteService);

module.exports = router;