const express = require('express');
const { getUsers, getUserById, updateUser, deleteUser, registerFcmToken } = require('../controllers/userController');
const { auth, checkRole } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/users
// @desc    Get all users (admin only)
// @access  Private/Admin
router.get('/', auth, checkRole(['admin']), getUsers);

// @route   GET api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', auth, getUserById);

// @route   PUT api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', auth, updateUser);

// @route   DELETE api/users/:id
// @desc    Delete user
// @access  Private
router.delete('/:id', auth, checkRole(['admin']), deleteUser);

// @route   POST api/users/fcm-token
// @desc    Register FCM token for push notifications
// @access  Private
router.post('/fcm-token', auth, registerFcmToken);

module.exports = router;