const express = require('express');
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { auth, checkRole } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

const router = express.Router();

// @route   POST api/categories
// @desc    Create a new category
// @access  Private (Admin only)
router.post('/', auth, checkRole(['admin']), createCategory);

// @route   GET api/categories
// @desc    Get all categories
// @access  Public
router.get('/', cacheMiddleware(3600), getCategories); // Cache for 1 hour

// @route   GET api/categories/:id
// @desc    Get category by ID
// @access  Public
router.get('/:id', cacheMiddleware(3600), getCategoryById); // Cache for 1 hour

// @route   PUT api/categories/:id
// @desc    Update category
// @access  Private (Admin only)
router.put('/:id', auth, checkRole(['admin']), updateCategory);

// @route   DELETE api/categories/:id
// @desc    Delete category
// @access  Private (Admin only)
router.delete('/:id', auth, checkRole(['admin']), deleteCategory);

module.exports = router;