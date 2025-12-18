const express = require('express');
const { addServiceImages, removeServiceImage } = require('../controllers/imageController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   POST api/images/services/:serviceId
// @desc    Add images to service
// @access  Private
router.post('/services/:serviceId', auth, addServiceImages);

// @route   DELETE api/images/services/:serviceId
// @desc    Remove image from service
// @access  Private
router.delete('/services/:serviceId', auth, removeServiceImage);

module.exports = router;